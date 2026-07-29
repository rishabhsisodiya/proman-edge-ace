import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { WorkflowModule } from '../workflow/workflow.module';
import { SlaPolicyModule } from '../sla-policy/sla-policy.module';
import { SlaBreachCron } from './sla-breach.cron';

@Module({
  imports: [WorkflowModule, SlaPolicyModule],
  controllers: [TicketsController],
  providers: [TicketsService, SlaBreachCron],
  exports: [TicketsService],
})
export class TicketsModule {}
