import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PDF_SUPPORTED, ReportKey } from './report-registry';
import { CreateScheduledReportDto, UpdateScheduledReportDto } from './dto/scheduled-report.dto';

@Injectable()
export class ScheduledReportsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.scheduledReport.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async create(dto: CreateScheduledReportDto, createdByUserId: string) {
    this.validateFormat(dto.reportKey, dto.format);
    return this.prisma.scheduledReport.create({
      data: {
        reportKey: dto.reportKey,
        filters: dto.filters,
        relativeWindowDays: dto.relativeWindowDays,
        format: dto.format,
        recipients: dto.recipients,
        frequency: dto.frequency,
        dayOfWeek: dto.dayOfWeek,
        dayOfMonth: dto.dayOfMonth,
        sendHour: dto.sendHour,
        createdByUserId,
      },
    });
  }

  async update(id: string, dto: UpdateScheduledReportDto) {
    const existing = await this.prisma.scheduledReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Scheduled report not found');
    if (dto.format) this.validateFormat(existing.reportKey as ReportKey, dto.format);
    return this.prisma.scheduledReport.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const existing = await this.prisma.scheduledReport.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Scheduled report not found');
    await this.prisma.scheduledReport.delete({ where: { id } });
    return { ok: true };
  }

  private validateFormat(reportKey: ReportKey, format: 'excel' | 'pdf') {
    if (format === 'pdf' && !PDF_SUPPORTED.has(reportKey)) {
      throw new BadRequestException(`${reportKey} does not support PDF export — Excel only, per the FSD.`);
    }
  }
}
