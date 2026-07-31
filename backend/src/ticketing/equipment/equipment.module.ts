import { Module } from '@nestjs/common';
import { TicketsModule } from '../tickets/tickets.module';
import { EquipmentController } from './equipment.controller';
import { EquipmentService } from './equipment.service';
import { WarrantyEngineCron } from './warranty-engine.cron';

@Module({
  imports: [TicketsModule],
  controllers: [EquipmentController],
  providers: [EquipmentService, WarrantyEngineCron],
  exports: [EquipmentService],
})
export class EquipmentModule {}
