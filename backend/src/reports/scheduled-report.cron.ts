import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { ReportsService } from './reports.service';
import { runReport, REPORT_TITLES, ReportKey } from './report-registry';
import { toExcelBuffer, toPdfBuffer } from './report-export.util';

/**
 * Scheduled Report Auto-Email (FSD §6.3, "all reports support scheduled
 * auto-email distribution" — 2026-07-31, client-confirmed Phase 2 after
 * Phase 1's view+export-only pass). Runs hourly; a schedule only actually
 * fires in the hour matching its own `sendHour` + frequency, so most runs
 * do nothing. Calls the exact same `runReport()`/export helpers the
 * on-demand Reports page uses — no separate report-generation logic to
 * maintain.
 *
 * dateFrom/dateTo are deliberately never frozen on the schedule itself —
 * only `relativeWindowDays` is stored, and recomputed here against "now" on
 * every run, so a schedule never sends a stale, fixed date range.
 */
@Injectable()
export class ScheduledReportCron {
  private readonly logger = new Logger(ScheduledReportCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly notifications: NotificationService,
  ) {}

  @Cron('0 * * * *', { timeZone: 'Asia/Kolkata' }) // top of every hour, IST
  async run() {
    const now = new Date();
    const schedules = await this.prisma.scheduledReport.findMany({ where: { isActive: true } });

    let sent = 0;
    for (const schedule of schedules) {
      if (!this.isDueNow(schedule, now)) continue;

      try {
        const filters = { ...(schedule.filters as Record<string, string>) };
        if (schedule.relativeWindowDays) {
          const from = new Date(now);
          from.setDate(from.getDate() - schedule.relativeWindowDays);
          filters.dateFrom = from.toISOString().slice(0, 10);
          filters.dateTo = now.toISOString().slice(0, 10);
        }

        const reportKey = schedule.reportKey as ReportKey;
        const result = await runReport(this.reports, reportKey, filters);
        const title = REPORT_TITLES[reportKey] ?? reportKey;
        const format = schedule.format as 'excel' | 'pdf';
        const buffer =
          format === 'pdf' ? await toPdfBuffer(title, result.columns, result.rows) : toExcelBuffer(result.columns, result.rows);
        const filename = `${reportKey}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;

        for (const recipient of schedule.recipients) {
          await this.notifications.send({
            channel: 'EMAIL',
            recipient,
            templateName: 'SCHEDULED_REPORT',
            subject: `${title} — Scheduled Report`,
            body: `Attached is your scheduled "${title}" report.`,
            attachments: [{ filename, content: buffer }],
          });
        }

        await this.prisma.scheduledReport.update({
          where: { id: schedule.id },
          data: { lastRunAt: now, lastRunStatus: 'SUCCESS' },
        });
        sent++;
      } catch (err: any) {
        this.logger.warn(`Scheduled report ${schedule.id} (${schedule.reportKey}) failed: ${err?.message ?? err}`);
        await this.prisma.scheduledReport
          .update({ where: { id: schedule.id }, data: { lastRunAt: now, lastRunStatus: 'FAILED' } })
          .catch(() => {});
      }
    }

    if (sent > 0) this.logger.log(`Scheduled Reports: sent ${sent} of ${schedules.length} active schedule(s) this hour.`);
  }

  // Admin sets sendHour/dayOfWeek/dayOfMonth thinking in IST (same timezone
  // the @Cron trigger itself uses) — Date.getHours()/getDay()/getDate() read
  // the *server's* local timezone, which is wrong if the server runs in UTC.
  // Always derive these via Intl against Asia/Kolkata explicitly instead.
  private isDueNow(schedule: { frequency: string; sendHour: number; dayOfWeek: number | null; dayOfMonth: number | null }, now: Date): boolean {
    const ist = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      hour12: false,
      weekday: 'short',
      day: 'numeric',
    }).formatToParts(now);
    const hour = Number(ist.find((p) => p.type === 'hour')?.value) % 24;
    const day = Number(ist.find((p) => p.type === 'day')?.value);
    const weekdayShort = ist.find((p) => p.type === 'weekday')?.value ?? '';
    const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayShort);

    if (hour !== schedule.sendHour) return false;
    if (schedule.frequency === 'DAILY') return true;
    if (schedule.frequency === 'WEEKLY') return weekdayIndex === schedule.dayOfWeek;
    if (schedule.frequency === 'MONTHLY') return day === schedule.dayOfMonth;
    return false;
  }
}
