import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { WorkflowModule } from '../workflow/workflow.module';
import { SlaPolicyModule } from '../sla-policy/sla-policy.module';
import { HolidayModule } from '../holiday/holiday.module';
import { ServiceTypeConfigModule } from '../service-types/service-type.module';
import { SlaBreachCron } from './sla-breach.cron';

@Module({
  imports: [WorkflowModule, SlaPolicyModule, HolidayModule, ServiceTypeConfigModule],
  controllers: [TicketsController],
  providers: [TicketsService, SlaBreachCron],
  exports: [TicketsService],
})
export class TicketsModule {}
