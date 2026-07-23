import { Module } from '@nestjs/common';
import { QuotationModule } from '../quotations/quotation.module';
import { ErpWebhooksController } from './erp-webhooks.controller';
import { QuotationPollCron } from './quotation-poll.cron';

@Module({
  imports: [QuotationModule],
  controllers: [ErpWebhooksController],
  providers: [QuotationPollCron],
})
export class ErpWebhooksModule {}
