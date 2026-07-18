import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Roles('CALL_CENTER', 'ASM', 'MANAGER')
  @Post()
  create(@Body() dto: CreateTicketDto, @Req() req: any) {
    return this.tickets.create(dto, { userId: req.user.userId, role: req.user.role });
  }

  @Get()
  list(@Query() filters: Record<string, string>, @Req() req: any) {
    return this.tickets.list({ userId: req.user.userId, role: req.user.role }, filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.tickets.findOne(id, { userId: req.user.userId, role: req.user.role });
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string) {
    return this.tickets.timeline(id);
  }

  @Roles('ASM', 'MANAGER')
  @Post(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignTicketDto, @Req() req: any) {
    return this.tickets.assign(id, dto.engineerId, { userId: req.user.userId, role: req.user.role });
  }
}
