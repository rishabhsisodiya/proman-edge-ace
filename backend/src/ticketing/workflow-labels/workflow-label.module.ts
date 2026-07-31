import { Module } from '@nestjs/common';
import { WorkflowLabelController } from './workflow-label.controller';
import { WorkflowLabelService } from './workflow-label.service';

@Module({
  controllers: [WorkflowLabelController],
  providers: [WorkflowLabelService],
})
export class WorkflowLabelModule {}
