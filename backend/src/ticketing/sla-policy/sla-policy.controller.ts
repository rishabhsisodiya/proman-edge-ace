import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { SlaPolicyService } from './sla-policy.service';
import { CreateSlaPolicyDto, UpdateSlaPolicyDto } from './dto/sla-policy.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/sla-policies')
export class SlaPolicyController {
  constructor(private readonly slaPolicies: SlaPolicyService) {}

  @Get()
  list() {
    return this.slaPolicies.list();
  }

  @Post()
  create(@Body() dto: CreateSlaPolicyDto) {
    return this.slaPolicies.create(dto.serviceType, dto.priority, dto.responseHours ?? null, dto.resolutionHours ?? null);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSlaPolicyDto) {
    return this.slaPolicies.update(id, dto.responseHours ?? null, dto.resolutionHours ?? null);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.slaPolicies.remove(id);
  }
}
