import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ServiceTypeConfigService } from './service-type.service';
import { CreateServiceTypeDto, UpdateServiceTypeConfigDto } from './dto/service-type.dto';

// Same shape as PriorityLabelController/WorkflowLabelController: list() open
// to any authenticated role (ticket creation's dropdown needs it), writes
// Admin-only.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('service-types')
export class ServiceTypeConfigController {
  constructor(private readonly serviceTypes: ServiceTypeConfigService) {}

  @Get()
  list(@Query('active') active?: string) {
    return active === 'true' ? this.serviceTypes.listActive() : this.serviceTypes.list();
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateServiceTypeDto) {
    return this.serviceTypes.create(dto.code, dto.label);
  }

  @Roles('ADMIN')
  @Patch(':code')
  update(@Param('code') code: string, @Body() dto: UpdateServiceTypeConfigDto) {
    return this.serviceTypes.update(code, dto.label, dto.isActive);
  }
}
