import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { DashboardAccessService } from './dashboard-access.service';
import { SetDashboardAccessRuleDto } from './dto/dashboard-access.dto';
import { DASHBOARD_REGISTRY } from './dashboard-registry';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/dashboard-access')
export class DashboardAccessController {
  constructor(private readonly access: DashboardAccessService) {}

  @Get()
  list() {
    return this.access.list();
  }

  @Get('registry')
  registry() {
    return DASHBOARD_REGISTRY;
  }

  @Patch()
  setEnabled(@Body() dto: SetDashboardAccessRuleDto) {
    return this.access.setEnabled(dto.role, dto.dashboardKey, dto.enabled);
  }
}
