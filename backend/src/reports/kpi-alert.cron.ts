import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Region } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { NotificationTemplateService } from '../notifications/notification-template.service';
import { ReportsService } from './reports.service';

const ALL_REGIONS: Region[] = ['NORTH', 'SOUTH', 'EAST', 'WEST', 'CENTRAL', 'BANGLADESH'];

/**
 * §6.2 KPI breach alerts (2026-08-04) — the FSD names 4 specific breach
 * thresholds ("< 85% — alert to Ashwath" etc.) but the KPI Matrix itself
 * only ever showed a passive "Breached" badge, nothing proactive. This cron
 * makes that alert real: daily, checks every KPI, and notifies on anything
 * BREACHED.
 *
 * Region-scoped (2026-08-04, client decision — "Manager is region based ...
 * All KPI should be region based"): computes `kpiMatrix('month', [region])`
 * once per region and notifies only the Managers assigned to that region —
 * a Manager only ever hears about breaches in their own region(s), never
 * another region's. Admin separately gets one org-wide pass
 * (`kpiMatrix('month')`, no region filter) — Admin is the one role that
 * should see everything, matching the "Admin sees everything Manager sees,
 * plus more" convention used everywhere else in this app.
 *
 * "Ashwath" = every active Manager (region-matched) + Admin (org-wide) —
 * client decision, 2026-08-02, already applied to CUST-BLOCKED and the AMC
 * renewal ladder.
 *
 * Fires at most once per day per breached KPI (this cron only runs once
 * daily) — no separate "already alerted" suppression table, unlike the AMC
 * renewal ladder's one-shot-ever alerts, since a KPI can go in and out of
 * breach day to day and each day's breach is worth a fresh notice.
 */
@Injectable()
export class KpiAlertCron {
  private readonly logger = new Logger(KpiAlertCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly notifications: NotificationService,
    private readonly notificationTemplates: NotificationTemplateService,
  ) {}

  @Cron('0 6 * * *', { timeZone: 'Asia/Kolkata' }) // 6 AM IST daily, after every other engine/report-feeding cron has run for the day
  async run() {
    let totalAlerts = 0;

    // Per-region pass — only that region's Managers.
    for (const region of ALL_REGIONS) {
      const managers = await this.prisma.user.findMany({
        where: { role: 'MANAGER', isActive: true, regions: { some: { region } } },
      });
      if (managers.length === 0) continue; // no one to notify — skip computing this region's KPIs at all

      const rows = await this.reports.kpiMatrix('month', [region]);
      const breached = rows.filter((r) => r.status === 'BREACHED');
      if (breached.length === 0) continue;

      for (const row of breached) {
        await this.notifyAll(row, managers, `${region} region`);
        totalAlerts++;
      }
    }

    // Org-wide pass — Admin only.
    const admins = await this.prisma.user.findMany({ where: { role: 'ADMIN', isActive: true } });
    if (admins.length > 0) {
      const orgRows = await this.reports.kpiMatrix('month');
      const orgBreached = orgRows.filter((r) => r.status === 'BREACHED');
      for (const row of orgBreached) {
        await this.notifyAll(row, admins, 'org-wide');
        totalAlerts++;
      }
    }

    if (totalAlerts > 0) this.logger.log(`KPI breach alerts sent — ${totalAlerts} breach notification(s) across all regions + org-wide.`);
  }

  private async notifyAll(
    row: Awaited<ReturnType<ReportsService['kpiMatrix']>>[number],
    recipients: { id: string; email: string }[],
    scopeLabel: string,
  ) {
    const vars = {
      kpi_name: row.kpi,
      current_value: row.current == null ? 'N/A' : `${row.current}${row.unit}`,
      target: row.target,
      breach_alert: row.breachAlert,
      period_label: `This Month (${scopeLabel})`,
    };
    for (const user of recipients) {
      await this.fireNotification('KPI-BREACH', 'EMAIL', user.email, vars);
      await this.fireNotification('KPI-BREACH', 'PUSH', user.email, vars, user.id);
    }
  }

  private async fireNotification(
    triggerCode: string,
    channel: 'EMAIL' | 'PUSH',
    recipient: string,
    vars: Record<string, string | number | null | undefined>,
    userId?: string,
  ) {
    const template = await this.notificationTemplates.render(triggerCode, channel, vars);
    if (!template) return;
    await this.notifications.send({
      channel,
      recipient,
      templateName: triggerCode,
      subject: template.subject,
      body: template.body,
      userId,
    });
  }
}
