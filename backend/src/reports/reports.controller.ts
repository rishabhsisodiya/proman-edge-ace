import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ReportFilters, ReportResult, ReportsService } from './reports.service';
import { toExcelBuffer, toPdfBuffer } from './report-export.util';
import { PDF_SUPPORTED, REPORT_DESCRIPTIONS, REPORT_TITLES, ReportKey, runReport } from './report-registry';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  list() {
    return Object.entries(REPORT_TITLES).map(([key, title]) => ({
      key,
      title,
      description: REPORT_DESCRIPTIONS[key as ReportKey],
      pdfSupported: PDF_SUPPORTED.has(key as ReportKey),
    }));
  }

  @Get('ticket-status-timeline/:ticketId')
  ticketStatusTimeline(@Param('ticketId') ticketId: string) {
    return this.reports.ticketStatusTimeline(ticketId);
  }

  @Get('ticket-status-timeline/:ticketId/export')
  async exportTicketStatusTimeline(@Param('ticketId') ticketId: string, @Res() res: Response) {
    const result = await this.reports.ticketStatusTimeline(ticketId);
    const buffer = await toPdfBuffer('Ticket Status Timeline', result.columns, result.rows);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="ticket-status-timeline.pdf"' });
    res.send(buffer);
  }

  @Get(':key')
  async run(@Param('key') key: ReportKey, @Query() query: ReportFilters): Promise<ReportResult> {
    return runReport(this.reports, key, query);
  }

  @Get(':key/export')
  async export(@Param('key') key: ReportKey, @Query() query: ReportFilters & { format?: 'excel' | 'pdf' }, @Res() res: Response) {
    const { format, ...filters } = query;
    const result = await runReport(this.reports, key, filters);
    const title = REPORT_TITLES[key] ?? key;

    if (format === 'pdf') {
      if (!PDF_SUPPORTED.has(key)) {
        res.status(400).send({ message: `${title} does not support PDF export — Excel only, per the FSD.` });
        return;
      }
      const buffer = await toPdfBuffer(title, result.columns, result.rows);
      res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${key}.pdf"` });
      res.send(buffer);
      return;
    }

    const buffer = toExcelBuffer(result.columns, result.rows);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${key}.xlsx"`,
    });
    res.send(buffer);
  }
}
