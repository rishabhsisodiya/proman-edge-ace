import { Module } from '@nestjs/common';
import { DashboardAccessController } from './dashboard-access.controller';
import { DashboardAccessService } from './dashboard-access.service';
import { DashboardAccessGuard } from '../../auth/dashboard-access.guard';

@Module({
  controllers: [DashboardAccessController],
  providers: [DashboardAccessService, DashboardAccessGuard],
  exports: [DashboardAccessService, DashboardAccessGuard],
})
export class DashboardAccessModule {}
