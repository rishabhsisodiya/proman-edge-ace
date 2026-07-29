import { Module } from '@nestjs/common';
import { SlaPauseStateController } from './sla-pause-state.controller';
import { SlaPauseStateService } from './sla-pause-state.service';

@Module({
  controllers: [SlaPauseStateController],
  providers: [SlaPauseStateService],
  exports: [SlaPauseStateService],
})
export class SlaPauseStateModule {}
