import { Module } from '@nestjs/common';
import { PredictiveRuleController } from './predictive-rule.controller';
import { PredictiveRuleService } from './predictive-rule.service';

@Module({
  controllers: [PredictiveRuleController],
  providers: [PredictiveRuleService],
  exports: [PredictiveRuleService],
})
export class PredictiveRuleModule {}
