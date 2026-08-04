import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { SlaNotificationRuleService } from './sla-notification-rule.service';
import { SetSlaNotificationRuleDto } from './dto/sla-notification-rule.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/sla-notification-rules')
export class SlaNotificationRuleController {
  constructor(private readonly rules: SlaNotificationRuleService) {}

  @Get()
  list() {
    return this.rules.list();
  }

  @Patch()
  setEnabled(@Body() dto: SetSlaNotificationRuleDto) {
    return this.rules.setEnabled(dto.breachType, dto.role, dto.enabled);
  }
}
