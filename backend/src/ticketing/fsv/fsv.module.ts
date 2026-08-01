import { Module } from '@nestjs/common';
import { PriceListModule } from '../price-lists/price-list.module';
import { FsvController } from './fsv.controller';
import { FsvService } from './fsv.service';
import { FsvPdfService } from './fsv-pdf.service';

@Module({
  imports: [PriceListModule],
  controllers: [FsvController],
  providers: [FsvService, FsvPdfService],
  exports: [FsvService],
})
export class FsvModule {}
