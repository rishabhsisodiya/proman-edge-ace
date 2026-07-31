import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ScheduledReportsService } from './scheduled-reports.service';
import { CreateScheduledReportDto, UpdateScheduledReportDto } from './dto/scheduled-report.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@Controller('reports/schedules')
export class ScheduledReportsController {
  constructor(private readonly schedules: ScheduledReportsService) {}

  @Get()
  list() {
    return this.schedules.list();
  }

  @Post()
  create(@Body() dto: CreateScheduledReportDto, @Req() req: any) {
    return this.schedules.create(dto, req.user.userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateScheduledReportDto) {
    return this.schedules.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.schedules.remove(id);
  }
}
