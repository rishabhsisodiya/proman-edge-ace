import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { WorkflowModule } from '../workflow/workflow.module';
import { SlaBreachCron } from './sla-breach.cron';

@Module({
  imports: [WorkflowModule],
  controllers: [TicketsController],
  providers: [TicketsService, SlaBreachCron],
  exports: [TicketsService],
})
export class TicketsModule {}
