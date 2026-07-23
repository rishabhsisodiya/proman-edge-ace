import { Module } from '@nestjs/common';
import { BillingRateController } from './billing-rate.controller';
import { BillingRateService } from './billing-rate.service';

@Module({
  controllers: [BillingRateController],
  providers: [BillingRateService],
  exports: [BillingRateService],
})
export class BillingRateModule {}
