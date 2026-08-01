import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Region, SlaClockStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../notifications/notification.service';
import { NotificationTemplateService } from '../../notifications/notification-template.service';

/**
 * SLA breach monitoring cron (2026-07-28, FSD §14.3 — was ❌ pending in the
 * build plan). "90% elapsed → early warning; 100% → breach" per the FSD's
 * own wording, checked independently for the response clock (stops at
 * Assigned) and the resolution clock (stops at Engineer Resolved, does NOT
 * pause during Pending — counts against SLA).
 *
 * N-15/16/17 (FSD §9) wired 2026-07-30 — response breach, resolution 90%
 * warning, resolution breach, respectively. State is persisted on the ticket
 * (slaResponseStatus/slaResolutionStatus) so it's badge-able/filterable in
 * the UI independent of whether the notification itself succeeds.
 */
@Injectable()
export class SlaBreachCron {
  private readonly logger = new Logger(SlaBreachCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly notificationTemplates: NotificationTemplateService,
  ) {}

  @Cron('*/15 * * * *') // every 15 minutes — SLA windows can be as short as a few hours
  async run() {
    const now = new Date();
    const tickets = await this.prisma.ticket.findMany({
      where: {
        status: { notIn: ['CLOSED', 'ASM_RESOLVED'] },
        OR: [
          { slaResponseMet: false, slaResponseDue: { not: null } },
          { slaResolutionMet: false, slaResolutionDue: { not: null } },
        ],
      },
      include: { customer: true, assignedAsm: true, assignedEngineer: true },
    });

    let checked = 0;
    let changed = 0;
    let systemActorId: string | undefined;

    for (const t of tickets) {
      checked++;
      const data: Record<string, SlaClockStatus> = {};
      const auditEntries: { fieldName: string; oldValue: string; newValue: string }[] = [];

      if (!t.slaResponseMet && t.slaResponseDue) {
        const pct = this.percentElapsed(t.createdAt, t.slaResponseDue, now);
        const next = this.statusFor(pct);
        if (next !== t.slaResponseStatus) {
          data.slaResponseStatus = next;
          auditEntries.push({ fieldName: 'slaResponseStatus', oldValue: t.slaResponseStatus, newValue: next });
          if (next === 'BREACHED') {
            await this.fireResponseBreach(t);
          }
        }
      }

      if (!t.slaResolutionMet && t.slaResolutionDue) {
        const pct = this.percentElapsed(t.createdAt, t.slaResolutionDue, now);
        const next = this.statusFor(pct);
        if (next !== t.slaResolutionStatus) {
          data.slaResolutionStatus = next;
          auditEntries.push({ fieldName: 'slaResolutionStatus', oldValue: t.slaResolutionStatus, newValue: next });
          if (next === 'WARNING_90') {
            await this.fireResolutionWarning(t);
          } else if (next === 'BREACHED') {
            await this.fireResolutionBreach(t);
          }
        }
      }

      if (Object.keys(data).length > 0) {
        if (!systemActorId) systemActorId = await this.resolveSystemActorId();
        await this.prisma.ticket.update({ where: { id: t.id }, data });
        for (const entry of auditEntries) {
          await this.prisma.ticketAuditLog.create({
            data: {
              ticketId: t.id,
              fieldName: entry.fieldName,
              oldValue: entry.oldValue,
              newValue: entry.newValue,
              changedByUserId: systemActorId,
              changeSource: 'SYSTEM_JOB',
            },
          });
        }
        changed++;
      }
    }

    this.logger.log(`SLA breach cron complete — ${checked} ticket(s) checked, ${changed} status change(s)`);
  }

  // Region-scoped Manager lookup (client decision, 2026-08-02) — same
  // pattern/fail-safe as TicketsService.managersForRegion(): a null region
  // matches no one, rather than falling back to notifying every Manager.
  private async managersForRegion(region: Region | null) {
    if (!region) return [];
    const regions = await this.prisma.userRegion.findMany({ where: { region, user: { role: 'MANAGER', isActive: true } } });
    if (regions.length === 0) return [];
    return this.prisma.user.findMany({ where: { id: { in: regions.map((r) => r.userId) } } });
  }

  private async callCenterUsers() {
    return this.prisma.user.findMany({ where: { role: 'CALL_CENTER', isActive: true } });
  }

  /** N-15 — SLA response breach: ASM + Call Center + Manager, Email + Push. */
  private async fireResponseBreach(t: { id: string; ticketNo: string; priority: string; slaResponseDue: Date | null; assignedAsm: { id: string; email: string } | null; customer: { region: Region | null } }) {
    const vars = { ticket_no: t.ticketNo, priority: t.priority, sla_response_due: t.slaResponseDue?.toISOString() ?? 'N/A' };
    const recipients: { email: string; userId: string }[] = [];
    if (t.assignedAsm) recipients.push({ email: t.assignedAsm.email, userId: t.assignedAsm.id });
    recipients.push(...(await this.callCenterUsers()).map((u) => ({ email: u.email, userId: u.id })));
    recipients.push(...(await this.managersForRegion(t.customer.region)).map((u) => ({ email: u.email, userId: u.id })));
    await this.sendToAll('N-15', recipients, vars, t.id);
  }

  /** N-16 — SLA resolution 90% warning: ASM + Engineer, Push + Email. */
  private async fireResolutionWarning(t: {
    id: string;
    ticketNo: string;
    status: string;
    assignedAsm: { id: string; email: string } | null;
    assignedEngineer: { id: string; email: string } | null;
  }) {
    const vars = { ticket_no: t.ticketNo, status: t.status };
    const recipients: { email: string; userId: string }[] = [];
    if (t.assignedAsm) recipients.push({ email: t.assignedAsm.email, userId: t.assignedAsm.id });
    if (t.assignedEngineer) recipients.push({ email: t.assignedEngineer.email, userId: t.assignedEngineer.id });
    await this.sendToAll('N-16', recipients, vars, t.id);
  }

  /** N-17 — SLA resolution breach: ASM + Manager, Email + WhatsApp (no WhatsApp number for internal users — sent via Email + Push instead). */
  private async fireResolutionBreach(t: {
    id: string;
    ticketNo: string;
    status: string;
    slaResolutionDue: Date | null;
    assignedAsm: { id: string; email: string } | null;
    customer: { region: Region | null };
  }) {
    const vars = {
      ticket_no: t.ticketNo,
      status: t.status,
      sla_resolution_due: t.slaResolutionDue?.toISOString() ?? 'N/A',
    };
    const recipients: { email: string; userId: string }[] = [];
    if (t.assignedAsm) recipients.push({ email: t.assignedAsm.email, userId: t.assignedAsm.id });
    recipients.push(...(await this.managersForRegion(t.customer.region)).map((u) => ({ email: u.email, userId: u.id })));
    // WhatsApp needs a phone number, not an email — internal users (ASM/Manager)
    // only have email on file, so N-17 goes out via Email + Push for them
    // despite the FSD listing WhatsApp; the customer-facing WhatsApp triggers
    // (N-01 etc.) use the customer's mobile instead.
    for (const r of recipients) {
      await this.sendOne('N-17', 'EMAIL', r.email, vars, t.id);
      await this.sendOne('N-17', 'PUSH', r.email, vars, t.id, r.userId);
    }
  }

  private async sendToAll(triggerCode: string, recipients: { email: string; userId: string }[], vars: Record<string, string>, ticketId: string) {
    for (const r of recipients) {
      await this.sendOne(triggerCode, 'EMAIL', r.email, vars, ticketId);
      await this.sendOne(triggerCode, 'PUSH', r.email, vars, ticketId, r.userId);
    }
  }

  private async sendOne(
    triggerCode: string,
    channel: 'EMAIL' | 'PUSH' | 'WHATSAPP',
    recipient: string,
    vars: Record<string, string>,
    ticketId: string,
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
      ticketId,
      userId,
    });
  }

  /** Same PARTNER_ACTOR_USER_ID-or-first-ADMIN pattern as createFromPartner()/createFromAmcSchedule() — a cron has no logged-in user to attribute the audit entry to. */
  private async resolveSystemActorId(): Promise<string> {
    const envActor = process.env.PARTNER_ACTOR_USER_ID;
    if (envActor) return envActor;
    const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) throw new Error('No PARTNER_ACTOR_USER_ID configured and no ADMIN user exists to attribute SLA audit log entries to');
    return admin.id;
  }

  private percentElapsed(createdAt: Date, due: Date, now: Date): number {
    const totalMs = due.getTime() - createdAt.getTime();
    if (totalMs <= 0) return 100;
    const elapsedMs = now.getTime() - createdAt.getTime();
    return (elapsedMs / totalMs) * 100;
  }

  private statusFor(pct: number): SlaClockStatus {
    if (pct >= 100) return 'BREACHED';
    if (pct >= 90) return 'WARNING_90';
    return 'ON_TRACK';
  }
}
