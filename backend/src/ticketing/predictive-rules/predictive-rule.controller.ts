import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { PredictiveRuleService } from './predictive-rule.service';
import { UpdatePredictiveRuleDto } from './dto/predictive-rule.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/predictive-rules')
export class PredictiveRuleController {
  constructor(private readonly rules: PredictiveRuleService) {}

  @Get()
  list() {
    return this.rules.list();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePredictiveRuleDto) {
    return this.rules.update(
      id,
      dto.monthsSinceService,
      dto.operatingHoursInterval,
      dto.breakdownFrequencyThreshold,
      dto.breakdownFrequencyWindowMonths,
    );
  }
}
