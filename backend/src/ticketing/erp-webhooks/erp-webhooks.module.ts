import { Module } from '@nestjs/common';
import { QuotationModule } from '../quotations/quotation.module';
import { ErpWebhooksController } from './erp-webhooks.controller';

// The 5-minute polling cron (QuotationPollCron) was removed 2026-07-25 per
// client instruction — replaced by manual "Create Sales Order"/"Create
// Invoice" buttons on the Quotation page (QuotationService.createSalesOrder/
// createInvoice), each doing a live ERPNext status check on click instead of
// a recurring background poll. The webhook path above is unaffected — it's
// push-based and stays fully automatic.
@Module({
  imports: [QuotationModule],
  controllers: [ErpWebhooksController],
})
export class ErpWebhooksModule {}
