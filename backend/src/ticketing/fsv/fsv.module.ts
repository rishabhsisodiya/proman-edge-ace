import { Module } from '@nestjs/common';
import { WorkflowModule } from '../workflow/workflow.module';
import { FsvController } from './fsv.controller';
import { FsvService } from './fsv.service';

@Module({
  imports: [WorkflowModule],
  controllers: [FsvController],
  providers: [FsvService],
  exports: [FsvService],
})
export class FsvModule {}
