import { Module } from '@nestjs/common';
import { ErpWritebackModule } from '../erp-writeback/erp-writeback.module';
import { QuotationController } from './quotation.controller';
import { QuotationService } from './quotation.service';

@Module({
  imports: [ErpWritebackModule],
  controllers: [QuotationController],
  providers: [QuotationService],
  exports: [QuotationService],
})
export class QuotationModule {}
