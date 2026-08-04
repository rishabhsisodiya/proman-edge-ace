import { Module } from '@nestjs/common';
import { SlaNotificationRuleController } from './sla-notification-rule.controller';
import { SlaNotificationRuleService } from './sla-notification-rule.service';

@Module({
  controllers: [SlaNotificationRuleController],
  providers: [SlaNotificationRuleService],
  exports: [SlaNotificationRuleService],
})
export class SlaNotificationRuleModule {}
