import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QuotationService } from '../quotations/quotation.service';

/**
 * Backstop for missed/failed webhooks (a webhook can be missed or fire
 * twice per Shivam's doc) — re-checks ERPNext status directly for any
 * quotation still awaiting its next step. Runs every 5 minutes.
 */
@Injectable()
export class QuotationPollCron {
  private readonly logger = new Logger(QuotationPollCron.name);

  constructor(private readonly quotations: QuotationService) {}

  @Cron('*/5 * * * *')
  async poll() {
    try {
      await this.quotations.pollPending();
    } catch (err) {
      this.logger.error('Quotation poll crashed', err);
    }
  }
}
