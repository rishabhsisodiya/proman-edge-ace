import { Module } from '@nestjs/common';
import { ErpWritebackModule } from '../erp-writeback/erp-writeback.module';
import { PriceListModule } from '../price-lists/price-list.module';
import { QuotationController } from './quotation.controller';
import { QuotationService } from './quotation.service';
import { QuotationExpiryCron } from './quotation-expiry.cron';
import { QuotationPdfService } from './quotation-pdf.service';

@Module({
  imports: [ErpWritebackModule, PriceListModule],
  controllers: [QuotationController],
  providers: [QuotationService, QuotationExpiryCron, QuotationPdfService],
  exports: [QuotationService],
})
export class QuotationModule {}
