import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ScheduledReportsController } from './scheduled-reports.controller';
import { ScheduledReportsService } from './scheduled-reports.service';
import { ScheduledReportCron } from './scheduled-report.cron';

@Module({
  // ScheduledReportsController first — its static "reports/schedules" path
  // must be registered before ReportsController's greedy "reports/:key"
  // route, or "/reports/schedules" would match `:key = 'schedules'` there
  // instead (Nest/Express match routes in registration order, not by
  // specificity).
  controllers: [ScheduledReportsController, ReportsController],
  providers: [ReportsService, ScheduledReportsService, ScheduledReportCron],
  // Exported so DashboardsAceModule's Executive/MD summary can call the
  // exact same report methods instead of re-deriving the same numbers.
  exports: [ReportsService],
})
export class ReportsModule {}
