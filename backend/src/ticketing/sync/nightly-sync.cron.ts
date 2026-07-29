import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CustomerSyncService } from './customer-sync.service';
import { ItemSyncService } from './item-sync.service';
import { EmployeeSyncService } from './employee-sync.service';
import { EquipmentTrackingSyncService } from './equipment-tracking-sync.service';

// §12.1: single nightly batch, 01:30 IST — Customer (+ its CustomerSite
// sub-sync) and Item run together as one job, not on separate schedules.
// Employee (ACE_Service_Module_SQL.md §1) and Equipment Tracking (§2) added
// 2026-07-28/30 — same batch, same read-only DB connection, no reason for a
// separate schedule.
@Injectable()
export class NightlySyncCron {
  private readonly logger = new Logger(NightlySyncCron.name);

  constructor(
    private readonly customerSync: CustomerSyncService,
    private readonly itemSync: ItemSyncService,
    private readonly employeeSync: EmployeeSyncService,
    private readonly equipmentTrackingSync: EquipmentTrackingSyncService,
  ) {}

  @Cron('30 1 * * *', { timeZone: 'Asia/Kolkata' })
  async runNightlySync() {
    try {
      await this.customerSync.run();
    } catch (err) {
      this.logger.error('Nightly customer sync crashed', err);
    }
    try {
      await this.itemSync.run();
    } catch (err) {
      this.logger.error('Nightly item sync crashed', err);
    }
    try {
      await this.employeeSync.run();
    } catch (err) {
      this.logger.error('Nightly employee sync crashed', err);
    }
    try {
      // Depends on Customer sync above having already run this same batch,
      // since it resolves each row's customer by name.
      await this.equipmentTrackingSync.run();
    } catch (err) {
      this.logger.error('Nightly Equipment Tracking sync crashed', err);
    }
  }
}
