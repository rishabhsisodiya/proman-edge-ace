import { BadRequestException, Body, Controller, Delete, Get, Header, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { HolidayService } from './holiday.service';
import { CreateHolidayDto } from './dto/holiday.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/holidays')
export class HolidayController {
  constructor(private readonly holidays: HolidayService) {}

  @Get()
  list() {
    return this.holidays.list();
  }

  @Post()
  create(@Body() dto: CreateHolidayDto) {
    return this.holidays.create(dto.date, dto.label);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.holidays.remove(id);
  }

  @Get('template')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="holiday-template.csv"')
  template(@Res() res: Response) {
    res.send(this.holidays.downloadTemplate());
  }

  // Static routes — must stay above any future `:id`-style GET (none exists
  // yet, kept here regardless per this codebase's established convention).
  @Get('erp-fiscal-years')
  fetchErpFiscalYears() {
    return this.holidays.fetchErpFiscalYears();
  }

  @Post('erp-fetch')
  fetchAndMergeErpHolidays(@Body('fiscalYear') fiscalYear: string) {
    if (!fiscalYear) throw new BadRequestException('fiscalYear is required');
    return this.holidays.fetchAndMergeErpHolidays(fiscalYear);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.holidays.bulkUpload(file.buffer);
  }
}
