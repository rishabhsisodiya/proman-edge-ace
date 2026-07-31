import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DashboardsAceService } from './dashboards-ace.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboards-ace')
export class DashboardsAceController {
  constructor(private readonly dashboards: DashboardsAceService) {}

  @Roles('CS_SUPPORT', 'ADMIN')
  @Get('cs-support-summary')
  csSupportSummary() {
    return this.dashboards.csSupportSummary();
  }

  @Roles('MD', 'ADMIN')
  @Get('executive-summary')
  executiveSummary() {
    return this.dashboards.executiveSummary();
  }
}
