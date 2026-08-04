import { Controller, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { Region } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ReportFilters, ReportResult, ReportsService } from './reports.service';
import { toExcelBuffer, toPdfBuffer } from './report-export.util';
import { PDF_SUPPORTED, REPORT_DESCRIPTIONS, REPORT_TITLES, ReportKey, runReport } from './report-registry';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('MANAGER', 'ADMIN')
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly prisma: PrismaService,
  ) {}

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

  /**
   * §6.2 Core KPI matrix — static route, must stay above `:key` or Nest
   * would try to run it as a report. Manager is always auto-scoped to their
   * own assigned regions (2026-08-04, client decision — "Manager is region
   * based so he should not see other region details"), ignoring any
   * `region` query param they might pass. Admin gets org-wide by default,
   * or one explicit region via `?region=`.
   */
  @Get('kpi-matrix')
  async kpiMatrix(@Query('period') period: 'month' | 'quarter' | 'year' | undefined, @Query('region') region: Region | undefined, @Req() req: any) {
    if (req.user.role === 'MANAGER') {
      const rows = await this.prisma.userRegion.findMany({ where: { userId: req.user.userId } });
      return this.reports.kpiMatrix(period ?? 'month', rows.map((r) => r.region));
    }
    return this.reports.kpiMatrix(period ?? 'month', region ? [region] : undefined);
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
