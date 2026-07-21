import { Injectable, Logger } from '@nestjs/common';
import { ErpDbService } from '../../erp/erp-db.service';
import { PrismaService } from '../../prisma/prisma.service';

// Field-for-field per ACE_Master_Data_SQL_Queries.md §5.1.3, minus the
// warehouse-scoped Bin join — that's handled separately per-warehouse
// (Q4's resolution: show all warehouses, let the engineer/ASM pick one,
// rather than assuming a single hardcoded "default" warehouse).
//
// Unfiltered for now — the client's "service checkbox" field meant to
// scope this down to spares-only doesn't exist yet in ERPNext (checked:
// no custom field on Item, and the standard is_service_item field means
// something different and is essentially unused in real data, 2/40,655
// rows). Syncing everything is safe for now since nothing in the app
// currently searches the Item table directly (the ticket form's equipment
// picker uses the separate, customer-scoped Equipment table, not Item).
const ITEM_SELECT = `
  SELECT
      i.name          AS item_code,
      i.item_name     AS item_name,
      i.item_group    AS item_group,
      i.description   AS item_description,
      i.stock_uom     AS uom,
      i.standard_rate AS standard_rate,
      i.modified      AS modified
  FROM \`tabItem\` i
`;

// Batch size for `IN (...)` chunks — keeps each query's parameter list and
// SQL length reasonable rather than one query per item (was the original,
// much slower version) or one unbounded IN clause for 40k+ item codes.
const BIN_BATCH_SIZE = 500;

interface ErpItemRow {
  item_code: string;
  item_name: string;
  item_group: string;
  item_description: string | null;
  uom: string;
  standard_rate: string | number;
  modified: Date;
}

interface ErpBinRow {
  item_code: string;
  warehouse: string;
  actual_qty: string | number;
  valuation_rate: string | number | null;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

@Injectable()
export class ItemSyncService {
  private readonly logger = new Logger(ItemSyncService.name);

  constructor(
    private readonly erpDb: ErpDbService,
    private readonly prisma: PrismaService,
  ) {}

  /** @param force Ignores the modified-since watermark and re-pulls every ERPNext item. */
  async run(force = false): Promise<void> {
    const startedAt = new Date();
    let recordsOk = 0;
    let recordsFailed = 0;
    let errorMessage: string | null = null;

    try {
      const watermark = force ? new Date(0) : await this.getWatermark();
      const rows = await this.erpDb.query<ErpItemRow>(`${ITEM_SELECT} WHERE i.modified > ? ORDER BY i.modified ASC`, [
        watermark.toISOString().slice(0, 19).replace('T', ' '),
      ]);

      const binsByItem = await this.fetchBinsForItems(rows.map((r) => r.item_code));

      for (const row of rows) {
        const ok = await this.syncOne(row, binsByItem.get(row.item_code) ?? []);
        if (ok) recordsOk++;
        else recordsFailed++;
      }
    } catch (err: any) {
      errorMessage = err?.message ?? String(err);
      this.logger.error('Item sync run failed', err);
    }

    await this.prisma.syncLog.create({
      data: {
        syncType: 'SCHEDULED',
        entity: 'Item',
        erpDoctype: 'Item',
        status: errorMessage ? 'FAILED' : recordsFailed > 0 ? 'PARTIAL' : 'SUCCESS',
        errorMessage: errorMessage ?? undefined,
        payload: { recordsOk, recordsFailed },
        startedAt,
        completedAt: new Date(),
      },
    });
    this.logger.log(`Item sync complete — ok: ${recordsOk}, failed: ${recordsFailed}`);
  }

  private async getWatermark(): Promise<Date> {
    const lastRun = await this.prisma.syncLog.findFirst({
      where: { entity: 'Item', status: { in: ['SUCCESS', 'PARTIAL'] } },
      orderBy: { startedAt: 'desc' },
    });
    return lastRun?.startedAt ?? new Date(0);
  }

  /**
   * Bulk-fetches Bin rows for the given item codes in chunked `IN (...)`
   * queries instead of one query per item — with 40k+ items on a full run,
   * the old per-item version meant 40k+ separate network round-trips to
   * ERPNext, which is what made the first run so slow.
   */
  private async fetchBinsForItems(itemCodes: string[]): Promise<Map<string, ErpBinRow[]>> {
    const byItem = new Map<string, ErpBinRow[]>();
    for (const batch of chunk(itemCodes, BIN_BATCH_SIZE)) {
      if (batch.length === 0) continue;
      const placeholders = batch.map(() => '?').join(',');
      const rows = await this.erpDb.query<ErpBinRow>(
        `SELECT item_code, warehouse, actual_qty, valuation_rate FROM \`tabBin\` WHERE item_code IN (${placeholders})`,
        batch,
      );
      for (const row of rows) {
        const existing = byItem.get(row.item_code);
        if (existing) existing.push(row);
        else byItem.set(row.item_code, [row]);
      }
    }
    return byItem;
  }

  private async syncOne(row: ErpItemRow, bins: ErpBinRow[]): Promise<boolean> {
    try {
      const totalStock = bins.reduce((sum, b) => sum + Number(b.actual_qty), 0);
      // Valuation rate isn't warehouse-uniform in general, but for the
      // aggregate Item.valuationRate field, use the most recent non-zero
      // one as a rough reference figure — the per-warehouse table below is
      // the authoritative source.
      const referenceValuationRate = bins.find((b) => Number(b.valuation_rate) > 0)?.valuation_rate ?? null;

      await this.prisma.item.upsert({
        where: { itemCode: row.item_code },
        create: {
          itemCode: row.item_code,
          itemName: row.item_name,
          itemGroup: row.item_group,
          itemDescription: row.item_description ?? undefined,
          uom: row.uom,
          standardRate: row.standard_rate,
          valuationRate: referenceValuationRate ?? undefined,
          currentStock: totalStock,
          lastSyncedAt: new Date(),
        },
        update: {
          itemName: row.item_name,
          itemGroup: row.item_group,
          itemDescription: row.item_description ?? undefined,
          uom: row.uom,
          standardRate: row.standard_rate,
          valuationRate: referenceValuationRate ?? undefined,
          currentStock: totalStock,
          lastSyncedAt: new Date(),
        },
      });

      for (const bin of bins) {
        await this.prisma.itemWarehouseStock.upsert({
          where: { itemCode_warehouse: { itemCode: row.item_code, warehouse: bin.warehouse } },
          create: {
            itemCode: row.item_code,
            warehouse: bin.warehouse,
            actualQty: Number(bin.actual_qty),
            valuationRate: bin.valuation_rate ?? undefined,
          },
          update: {
            actualQty: Number(bin.actual_qty),
            valuationRate: bin.valuation_rate ?? undefined,
            lastSyncedAt: new Date(),
          },
        });
      }

      return true;
    } catch (err) {
      this.logger.error(`Failed to sync item ${row.item_code}`, err);
      return false;
    }
  }
}
