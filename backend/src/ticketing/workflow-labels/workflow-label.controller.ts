import { Body, Controller, Get, Param, ParseEnumPipe, Patch, UseGuards } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { WorkflowLabelService } from './workflow-label.service';
import { UpdateTicketStatusLabelDto } from './dto/workflow-label.dto';

// Not @Roles-gated at the class level: list() is read by every role that
// renders a ticket status anywhere (badges, filters, dropdowns) — only
// update() is Admin-only. RolesGuard allows any authenticated role through
// when a handler has no @Roles metadata at all (see roles.guard.ts).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('workflow-labels')
export class WorkflowLabelController {
  constructor(private readonly labels: WorkflowLabelService) {}

  @Get()
  list() {
    return this.labels.list();
  }

  @Roles('ADMIN')
  @Patch(':status')
  update(@Param('status', new ParseEnumPipe(TicketStatus)) status: TicketStatus, @Body() dto: UpdateTicketStatusLabelDto) {
    return this.labels.update(status, dto.label);
  }
}
