import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { SlaPauseStateService } from './sla-pause-state.service';
import { CreateSlaPauseStateDto } from './dto/sla-pause-state.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/sla-pause-states')
export class SlaPauseStateController {
  constructor(private readonly slaPauseStates: SlaPauseStateService) {}

  @Get()
  list() {
    return this.slaPauseStates.list();
  }

  @Post()
  create(@Body() dto: CreateSlaPauseStateDto) {
    return this.slaPauseStates.create(dto.status);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.slaPauseStates.remove(id);
  }
}
