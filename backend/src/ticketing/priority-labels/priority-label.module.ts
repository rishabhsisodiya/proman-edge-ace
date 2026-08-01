import { Module } from '@nestjs/common';
import { PriorityLabelController } from './priority-label.controller';
import { PriorityLabelService } from './priority-label.service';

@Module({
  controllers: [PriorityLabelController],
  providers: [PriorityLabelService],
})
export class PriorityLabelModule {}
