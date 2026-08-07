import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinanceSnapshotStore } from './finance-snapshot.store';
import { FinanceSettingsStore } from './finance-settings.store';
import { FinanceSnapshotCron } from './finance-snapshot.cron';
import { DashboardAccessModule } from '../dashboard-access/dashboard-access.module';

@Module({
  imports: [DashboardAccessModule],
  controllers: [FinanceController],
  providers: [FinanceService, FinanceSnapshotStore, FinanceSettingsStore, FinanceSnapshotCron],
})
export class FinanceModule {}
