import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { PriceListModule } from '../price-lists/price-list.module';
import { FsvController } from './fsv.controller';
import { FsvService } from './fsv.service';

@Module({
  imports: [WorkflowModule, PriceListModule],
  controllers: [FsvController],
  providers: [FsvService],
  exports: [FsvService],
})
export class FsvModule {}
