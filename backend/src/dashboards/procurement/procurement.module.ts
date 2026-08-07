import { Module } from '@nestjs/common';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { ProcurementSnapshotStore } from './procurement-snapshot.store';
import { ProcurementSnapshotCron } from './procurement-snapshot.cron';
import { DashboardAccessModule } from '../dashboard-access/dashboard-access.module';

@Module({
  imports: [DashboardAccessModule],
  controllers: [ProcurementController],
  providers: [ProcurementService, ProcurementSnapshotStore, ProcurementSnapshotCron],
})
export class ProcurementModule {}
