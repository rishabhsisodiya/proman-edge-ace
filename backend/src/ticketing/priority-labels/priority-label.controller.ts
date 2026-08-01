import { Body, Controller, Get, Param, ParseEnumPipe, Patch, UseGuards } from '@nestjs/common';
import { Priority } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { PriorityLabelService } from './priority-label.service';
import { UpdatePriorityLabelDto } from './dto/priority-label.dto';

// Same shape as WorkflowLabelController: list() open to any authenticated
// role (every ticket view needs these), update() Admin-only.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('priority-labels')
export class PriorityLabelController {
  constructor(private readonly labels: PriorityLabelService) {}

  @Get()
  list() {
    return this.labels.list();
  }

  @Roles('ADMIN')
  @Patch(':priority')
  update(@Param('priority', new ParseEnumPipe(Priority)) priority: Priority, @Body() dto: UpdatePriorityLabelDto) {
    return this.labels.update(priority, dto.label, dto.definition);
  }
}
