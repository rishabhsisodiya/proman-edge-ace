import { Injectable, Logger } from '@nestjs/common';
import { EquipCategory } from '@prisma/client';
import { ErpDbService } from '../../erp/erp-db.service';
import { PrismaService } from '../../prisma/prisma.service';

const EQUIPMENT_TRACKING_SELECT = `
  SELECT
      serial_id, sales_order, customer, item_code, item_name, qty,
      warranty_start_date, warranty_end_date, warranty_period_days,
      delivery_date, equipment_category, model_number, status, modified
  FROM \`tabEquipment Tracking\`
`;

interface ErpEquipmentTrackingRow {
  serial_id: string;
  sales_order: string;
  customer: string;
  item_code: string;
  item_name: string;
  // MariaDB returns DECIMAL columns as strings via mysql2 — parse before use.
  qty: string | number;
  warranty_start_date: Date | null;
  warranty_end_date: Date | null;
  warranty_period_days: number | null;
  delivery_date: Date | null;
  equipment_category: string | null;
  model_number: string | null;
  status: string;
  modified: Date;
}

// Best-effort mapping from ERPNext's free-text Item Group onto our fixed
// EquipCategory enum — the ERP side has no concept of this app's categories,
// so this is a heuristic, not a source of truth. Unmatched -> OTHER (not
// skipped — the equipment record itself is still valid, just uncategorized).
// Confirmed live: real sample data (e.g. "Castings") often lands in OTHER.
function mapCategory(raw: string | null): EquipCategory {
  const s = (raw ?? '').toLowerCase();
  if (s.includes('crusher')) return 'CRUSHER';
  if (s.includes('conveyor')) return 'CONVEYOR';
  if (s.includes('wagon') || s.includes('tippler')) return 'WAGON_TIPPLER';
  if (s.includes('stacker') || s.includes('reclaimer')) return 'STACKER_RECLAIMER';
  if (s.includes('screen')) return 'SCREEN';
  if (s.includes('mortar')) return 'DRY_MORTAR';
  if (s.includes('bulk') || s.includes('reception')) return 'BULK_RECEPTION';
  return 'OTHER';
}

/**
 * Equipment Tracking sync (ACE_Service_Module_SQL.md §2, 2026-07-30) — the
 * alternative to the long-blocked Serial No sync (that table has zero rows
 * on ERPNext). proman_edge auto-creates one Equipment Tracking row per Sales
 * Order line on submit; this pulls them nightly (delta, via the same
 * SyncLog watermark pattern as Customer/Item) and upserts into our own
 * Equipment table by `serialNo` (== ERP's `serial_id`).
 *
 * Additional source, not a replacement — manual Equipment entry stays fully
 * available (client decision, 2026-07-28) for units that never went through
 * a Sales Order in proman_edge.
 *
 * Duplicate handling: since ERP's synthetic serial_id has no relationship to
 * a manually-entered serial number, a newly-synced row that matches an
 * existing Equipment record on (customerId, itemCode) is still created, but
 * flagged via possibleDuplicateOfId (mirrors TicketsService's duplicate
 * pattern exactly) — Admin resolves via Merge or Dismiss, see
 * EquipmentService.resolveDuplicate().
 */
@Injectable()
export class EquipmentTrackingSyncService {
  private readonly logger = new Logger(EquipmentTrackingSyncService.name);

  constructor(
    private readonly erpDb: ErpDbService,
    private readonly prisma: PrismaService,
  ) {}

  async run(): Promise<void> {
    const startedAt = new Date();
    const results = new Map<string, boolean>();
    let errorMessage: string | null = null;

    try {
      const watermark = await this.getWatermark();
      const rows = await this.erpDb.query<ErpEquipmentTrackingRow>(
        `${EQUIPMENT_TRACKING_SELECT} WHERE modified >= ? ORDER BY modified ASC`,
        [watermark.toISOString().slice(0, 19).replace('T', ' ')],
      );

      for (const row of rows) {
        results.set(row.serial_id, await this.syncOne(row));
      }

      await this.recheckSkipped(results);
    } catch (err: any) {
      errorMessage = err?.message ?? String(err);
      this.logger.error('Equipment Tracking sync run failed', err);
    }

    const recordsOk = [...results.values()].filter(Boolean).length;
    const recordsFailed = results.size - recordsOk;

    await this.prisma.syncLog.create({
      data: {
        syncType: 'SCHEDULED',
        entity: 'EquipmentTracking',
        erpDoctype: 'Equipment Tracking',
        status: errorMessage ? 'FAILED' : recordsFailed > 0 ? 'PARTIAL' : 'SUCCESS',
        errorMessage: errorMessage ?? undefined,
        payload: { recordsOk, recordsFailed },
        startedAt,
        completedAt: new Date(),
      },
    });
    this.logger.log(`Equipment Tracking sync complete — ok: ${recordsOk}, failed: ${recordsFailed}`);
  }

  /** Modified-since watermark — last successful/partial run's start time, or epoch for a first run. */
  private async getWatermark(): Promise<Date> {
    const lastRun = await this.prisma.syncLog.findFirst({
      where: { entity: 'EquipmentTracking', status: { in: ['SUCCESS', 'PARTIAL'] } },
      orderBy: { startedAt: 'desc' },
    });
    return lastRun?.startedAt ?? new Date(0);
  }

  private async syncOne(row: ErpEquipmentTrackingRow): Promise<boolean> {
    const customer = await this.prisma.customer.findFirst({ where: { customerName: row.customer } });
    if (!customer) {
      // Self-healing, same pattern as CustomerSyncSkipped — rechecked every
      // run, cleared automatically once the matching Customer is synced.
      await this.prisma.equipmentSyncSkipped.upsert({
        where: { erpSerialId: row.serial_id },
        create: {
          erpSerialId: row.serial_id,
          customerName: row.customer,
          reason: `No Customer found with name "${row.customer}"`,
        },
        update: { lastCheckedAt: new Date() },
      });
      return false;
    }

    const warrantyStart = row.warranty_start_date ?? row.delivery_date ?? new Date();
    const warrantyEnd = row.warranty_end_date ?? warrantyStart;
    const warrantyMonths = row.warranty_period_days ? Math.round(row.warranty_period_days / 30) : 0;
    const qty = Math.round(Number(row.qty)) || 1;
    const equipmentCategory = mapCategory(row.equipment_category);

    const existing = await this.prisma.equipment.findUnique({ where: { serialNo: row.serial_id } });

    // Only check for a possible duplicate the first time this serial_id is
    // seen — an already-synced row (re-pulled on a later delta run because
    // it was touched again in ERP) shouldn't get re-flagged against itself.
    let possibleDuplicateOfId: string | undefined;
    if (!existing) {
      const duplicate = await this.prisma.equipment.findFirst({
        where: { customerId: customer.id, itemCode: row.item_code },
      });
      possibleDuplicateOfId = duplicate?.id;
    }

    await this.prisma.equipment.upsert({
      where: { serialNo: row.serial_id },
      create: {
        serialNo: row.serial_id,
        itemCode: row.item_code,
        itemName: row.item_name,
        equipmentCategory,
        modelNumber: row.model_number,
        customerId: customer.id,
        // installationDate isn't provided by this feed — approximated from
        // delivery date, same as any other date this sync doesn't have a
        // direct source for (client-confirmed acceptable, 2026-07-30).
        installationDate: row.delivery_date ?? warrantyStart,
        deliveryDate: row.delivery_date,
        warrantyStartDate: warrantyStart,
        warrantyEndDate: warrantyEnd,
        warrantyPeriodMonths: warrantyMonths,
        warrantyStatus: this.warrantyStatus(warrantyEnd),
        quantity: qty,
        erpTrackingStatus: row.status,
        possibleDuplicateOfId,
      },
      update: {
        itemCode: row.item_code,
        itemName: row.item_name,
        equipmentCategory,
        modelNumber: row.model_number,
        customerId: customer.id,
        deliveryDate: row.delivery_date,
        warrantyStartDate: warrantyStart,
        warrantyEndDate: warrantyEnd,
        warrantyPeriodMonths: warrantyMonths,
        warrantyStatus: this.warrantyStatus(warrantyEnd),
        quantity: qty,
        erpTrackingStatus: row.status,
        // status (EquipStatus, this app's own operational lifecycle) and the
        // duplicate flag are deliberately NOT touched on update — see the
        // schema comments on Equipment.erpTrackingStatus/possibleDuplicateOfId.
      },
    });

    await this.prisma.equipmentSyncSkipped.deleteMany({ where: { erpSerialId: row.serial_id } });
    return true;
  }

  /** Admin-triggered manual resync of one customer's equipment (Customer Detail page, 2026-08-04) — bypasses the delta watermark for this one customer name. */
  async manualRetryForCustomer(customerName: string): Promise<void> {
    const rows = await this.erpDb.query<ErpEquipmentTrackingRow>(`${EQUIPMENT_TRACKING_SELECT} WHERE customer = ?`, [customerName]);
    for (const row of rows) {
      await this.syncOne(row);
    }
  }

  private warrantyStatus(warrantyEnd: Date): 'UNDER_WARRANTY' | 'EXPIRING_SOON' | 'OUT_OF_WARRANTY' {
    const now = Date.now();
    const daysLeft = (warrantyEnd.getTime() - now) / (1000 * 60 * 60 * 24);
    if (daysLeft < 0) return 'OUT_OF_WARRANTY';
    if (daysLeft <= 30) return 'EXPIRING_SOON';
    return 'UNDER_WARRANTY';
  }

  /** Retry rows whose customer wasn't found yet — refetches by serial_id since we only stored the customer name, not the full row. */
  private async recheckSkipped(results: Map<string, boolean>): Promise<void> {
    const skipped = await this.prisma.equipmentSyncSkipped.findMany();
    if (skipped.length === 0) return;

    const placeholders = skipped.map(() => '?').join(',');
    const rows = await this.erpDb.query<ErpEquipmentTrackingRow>(
      `${EQUIPMENT_TRACKING_SELECT} WHERE serial_id IN (${placeholders})`,
      skipped.map((s) => s.erpSerialId),
    );
    for (const row of rows) {
      results.set(row.serial_id, await this.syncOne(row));
    }
  }
}
