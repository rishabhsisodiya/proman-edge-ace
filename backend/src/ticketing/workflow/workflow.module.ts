import { Module } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { SlaPauseStateModule } from '../sla-pause-state/sla-pause-state.module';

@Module({
  imports: [SlaPauseStateModule],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
