import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { EquipmentService } from './equipment.service';

@UseGuards(JwtAuthGuard)
@Controller('equipment')
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  @Get()
  list(@Query() filters: { serialNo?: string; category?: string; customerId?: string }) {
    return this.equipment.list(filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.equipment.findOne(id);
  }
}
