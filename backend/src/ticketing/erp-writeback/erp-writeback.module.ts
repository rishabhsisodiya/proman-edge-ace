import { Module } from '@nestjs/common';
import { ErpWritebackService } from './erp-writeback.service';

@Module({
  providers: [ErpWritebackService],
  exports: [ErpWritebackService],
})
export class ErpWritebackModule {}
