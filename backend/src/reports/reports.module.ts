import { Module } from '@nestjs/common';
import { BillingRateModule } from '../ticketing/billing-rates/billing-rate.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ScheduledReportsController } from './scheduled-reports.controller';
import { ScheduledReportsService } from './scheduled-reports.service';
import { ScheduledReportCron } from './scheduled-report.cron';
import { KpiAlertCron } from './kpi-alert.cron';

@Module({
  // ScheduledReportsController first — its static "reports/schedules" path
  // must be registered before ReportsController's greedy "reports/:key"
  // route, or "/reports/schedules" would match `:key = 'schedules'` there
  // instead (Nest/Express match routes in registration order, not by
  // specificity).
  imports: [BillingRateModule],
  controllers: [ScheduledReportsController, ReportsController],
  providers: [ReportsService, ScheduledReportsService, ScheduledReportCron, KpiAlertCron],
  // Exported so DashboardsAceModule's Executive/MD summary can call the
  // exact same report methods instead of re-deriving the same numbers.
  exports: [ReportsService],
})
export class ReportsModule {}
