import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CustomerSyncService } from './customer-sync.service';

// §12.1: nightly batch, 01:30 IST.
@Injectable()
export class CustomerSyncCron {
  private readonly logger = new Logger(CustomerSyncCron.name);

  constructor(private readonly customerSync: CustomerSyncService) {}

  @Cron('30 1 * * *', { timeZone: 'Asia/Kolkata' })
  async runNightlySync() {
    try {
      await this.customerSync.run();
    } catch (err) {
      this.logger.error('Nightly customer sync crashed', err);
    }
  }
}
