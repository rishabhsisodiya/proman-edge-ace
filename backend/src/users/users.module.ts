import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SkillTagModule } from '../ticketing/skill-tags/skill-tag.module';
import { BillingRateModule } from '../ticketing/billing-rates/billing-rate.module';

@Module({
  imports: [SkillTagModule, BillingRateModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
