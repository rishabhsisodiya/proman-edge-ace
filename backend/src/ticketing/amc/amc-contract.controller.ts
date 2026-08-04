import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Request } from 'express';
import * as path from 'path';
import * as crypto from 'crypto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { AmcContractService } from './amc-contract.service';
import { CreateAmcContractDto, UpdateAmcContractDto } from './dto/amc-contract.dto';
import { RescheduleVisitDto } from './dto/reschedule-visit.dto';
import { GenerateScheduleDto } from './dto/generate-schedule.dto';
import { AddVisitDto } from './dto/add-visit.dto';

const AMC_DOCUMENT_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'amc-documents');
const ALLOWED_DOCUMENT_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);

@UseGuards(JwtAuthGuard)
@Controller('amc-contracts')
export class AmcContractController {
  constructor(private readonly amc: AmcContractService) {}

  @Get()
  list(@Query('customerId') customerId?: string) {
    return this.amc.list(customerId);
  }

  /** §6.1 ASM Dashboard "Today's AMC visits" — static route, must stay above `:id` or Nest would try to resolve "today-visits" as a contract id. */
  @Get('today-visits')
  todayVisits(@Req() req: Request & { user: { userId: string; role: any } }) {
    return this.amc.todayVisits({ userId: req.user.userId, role: req.user.role });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.amc.findOne(id);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post()
  create(@Body() dto: CreateAmcContractDto) {
    return this.amc.create(dto);
  }

  // Contract renewal (2026-08-03, client-agreed scope) — creates a new
  // contract referencing this one and flips this one to RENEWED. Eligible
  // from any non-RENEWED status, not "Lapsed only."
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post(':id/renew')
  renew(@Param('id') id: string, @Body() dto: CreateAmcContractDto) {
    return this.amc.renew(id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAmcContractDto) {
    return this.amc.update(id, dto);
  }

  /** Uploaded contract document (2026-07-27) — client request, "Add AMC contract option (upload contract option)". */
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post(':id/document/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: AMC_DOCUMENT_UPLOAD_DIR,
        filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`),
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.mimetype)) {
          cb(new BadRequestException('Contract document must be a JPEG, PNG, or PDF file'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadDocument(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    const url = `${req.protocol}://${req.get('host')}/uploads/amc-documents/${file.filename}`;
    return this.amc.uploadDocument(id, url);
  }

  /** Manual reschedule of one auto-generated scheduled visit. */
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Patch('scheduled-visits/:visitId')
  rescheduleVisit(@Param('visitId') visitId: string, @Body() dto: RescheduleVisitDto) {
    return this.amc.rescheduleVisit(visitId, dto.plannedDate, dto.notes);
  }

  /** Backfill for a contract with zero scheduled visits (2026-07-27). */
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post(':id/generate-schedule')
  generateSchedule(@Param('id') id: string, @Body() dto: GenerateScheduleDto) {
    return this.amc.generateScheduleForExisting(id, dto.visitDates);
  }

  /** Covers Visits Included being increased after the schedule already exists. */
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post(':id/scheduled-visits')
  addVisit(@Param('id') id: string, @Body() dto: AddVisitDto) {
    return this.amc.addVisit(id, dto.equipmentId, dto.plannedDate);
  }

  /** Covers Visits Included being decreased. Blocked once a real ticket exists for the visit. */
  @UseGuards(RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Delete('scheduled-visits/:visitId')
  removeVisit(@Param('visitId') visitId: string) {
    return this.amc.removeVisit(visitId);
  }
}
