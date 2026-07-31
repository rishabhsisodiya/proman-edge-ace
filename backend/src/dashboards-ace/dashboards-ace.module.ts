import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { DashboardsAceController } from './dashboards-ace.controller';
import { DashboardsAceService } from './dashboards-ace.service';

@Module({
  imports: [ReportsModule],
  controllers: [DashboardsAceController],
  providers: [DashboardsAceService],
})
export class DashboardsAceModule {}
