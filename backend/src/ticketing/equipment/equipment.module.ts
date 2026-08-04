import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { PredictiveRuleModule } from '../predictive-rules/predictive-rule.module';
import { EquipmentController } from './equipment.controller';
import { EquipmentService } from './equipment.service';
import { WarrantyEngineCron } from './warranty-engine.cron';
import { PredictiveEngineCron } from './predictive-engine.cron';
import { WarrantyPmCron } from './warranty-pm.cron';

@Module({
  imports: [TicketsModule, PredictiveRuleModule],
  controllers: [EquipmentController],
  providers: [EquipmentService, WarrantyEngineCron, PredictiveEngineCron, WarrantyPmCron],
  exports: [EquipmentService],
})
export class EquipmentModule {}
