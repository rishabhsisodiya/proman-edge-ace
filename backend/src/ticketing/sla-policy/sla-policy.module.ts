import { Module } from '@nestjs/common';
import { SlaPolicyController } from './sla-policy.controller';
import { SlaPolicyService } from './sla-policy.service';

@Module({
  controllers: [SlaPolicyController],
  providers: [SlaPolicyService],
  exports: [SlaPolicyService],
})
export class SlaPolicyModule {}
