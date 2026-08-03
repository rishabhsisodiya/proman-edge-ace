import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerSyncService } from './customer-sync.service';
import { ItemSyncService } from './item-sync.service';
import { EmployeeSyncService } from './employee-sync.service';
import { EquipmentTrackingSyncService } from './equipment-tracking-sync.service';

/** Backs the W-26 Sync Monitor admin screen (§12.5/§10.1). */
@Injectable()
export class SyncAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerSync: CustomerSyncService,
    private readonly itemSync: ItemSyncService,
    private readonly employeeSync: EmployeeSyncService,
    private readonly equipmentTrackingSync: EquipmentTrackingSyncService,
  ) {}

  runs(entity?: string) {
    return this.prisma.syncLog.findMany({
      where: entity ? { entity } : undefined,
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  }

  failures() {
    return this.prisma.customerSyncFailure.findMany({ orderBy: { lastAttemptAt: 'desc' } });
  }

  skipped() {
    return this.prisma.customerSyncSkipped.findMany({ orderBy: { firstSeenAt: 'desc' } });
  }

  needsReview() {
    return this.prisma.customer.findMany({
      where: { needsReview: true },
      orderBy: { lastSyncedAt: 'desc' },
      select: { id: true, customerName: true, erpnextCustomerId: true, region: true, reviewReason: true, lastSyncedAt: true },
    });
  }

  /** Full synced Employee list, for Sync Monitor visibility into what the last run brought in — not the Create User picker (see UsersService.unimportedErpEmployees for that). */
  employees() {
    return this.prisma.erpEmployee.findMany({ orderBy: { employeeName: 'asc' } });
  }

  /** Equipment Tracking rows skipped for an unmatched customer name — same self-healing pattern as Customer sync's own skipped list. */
  equipmentSkipped() {
    return this.prisma.equipmentSyncSkipped.findMany({ orderBy: { firstSeenAt: 'desc' } });
  }

  async retryFailure(id: string) {
    const failure = await this.prisma.customerSyncFailure.findUnique({ where: { id } });
    if (!failure) throw new NotFoundException('Failure record not found');
    const ok = await this.customerSync.manualRetry(failure.erpnextCustomerId);
    return { ok };
  }

  /**
   * "View Details" on a Sync Failure (2026-08-04) — the raw ERPNext row
   * right now, alongside the stored failure reason, so an Admin can see
   * exactly what needs fixing in ERPNext before retrying. `erpRow` is null
   * if the record has since been deleted/renamed in ERPNext.
   */
  async failureDetail(id: string) {
    const failure = await this.prisma.customerSyncFailure.findUnique({ where: { id } });
    if (!failure) throw new NotFoundException('Failure record not found');
    const erpRow = await this.customerSync.getRawErpRow(failure.erpnextCustomerId);
    return { failure, erpRow };
  }

  /**
   * Manual on-demand run of the full night job — Customer (+ CustomerSite),
   * Item, Employee, then Equipment Tracking — same sequence NightlySyncCron
   * fires automatically at 1:30 AM.
   * @param force Ignores each sync's modified-since watermark and reprocesses
   * every record from scratch — for one-off full resyncs, not routine use.
   * Employee sync has no watermark (small dataset, always a full re-pull),
   * so `force` doesn't change its behavior; Equipment Tracking does use a
   * watermark (large dataset) but doesn't currently expose a force option.
   * @param entity Run just one sync instead of all 4 (2026-08-04) — Customer/
   * Item/Employee/EquipmentTracking, case-insensitive; omitted/invalid runs
   * everything, same as before this option existed.
   */
  async triggerRun(force = false, entity?: string) {
    const target = entity?.toLowerCase();
    if (!target) {
      await this.customerSync.run(force);
      await this.itemSync.run(force);
      await this.employeeSync.run();
      await this.equipmentTrackingSync.run();
      return { ok: true };
    }
    if (target === 'customer') await this.customerSync.run(force);
    else if (target === 'item') await this.itemSync.run(force);
    else if (target === 'employee') await this.employeeSync.run();
    else if (target === 'equipmenttracking') await this.equipmentTrackingSync.run();
    else throw new NotFoundException(`Unknown sync entity "${entity}"`);
    return { ok: true };
  }
}
