import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CustomerSyncService } from './customer-sync.service';
import { ItemSyncService } from './item-sync.service';

// §12.1: single nightly batch, 01:30 IST — Customer (+ its CustomerSite
// sub-sync) and Item run together as one job, not on separate schedules.
@Injectable()
export class NightlySyncCron {
  private readonly logger = new Logger(NightlySyncCron.name);

  constructor(
    private readonly customerSync: CustomerSyncService,
    private readonly itemSync: ItemSyncService,
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
  }
}
