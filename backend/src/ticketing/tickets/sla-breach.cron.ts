import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Region, Role, SlaClockStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../notifications/notification.service';
import { NotificationTemplateService } from '../../notifications/notification-template.service';
import { SlaNotificationRuleService } from '../sla-notification-rule/sla-notification-rule.service';

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
 *
 * Breach recipients (2026-08-04, client request — FSD: "automatic
 * notification shall be sent to the Manager and the Managing Director (MD)
 * ... Admin-level configuration option ... to set up and manage these SLA
 * notification rules") — previously hardcoded per breach type; now driven
 * by SlaNotificationRuleService, Admin-configurable per role at
 * /dashboard/admin/sla. Manager stays region-scoped when enabled (client
 * confirmed: region Manager only, not every Manager org-wide); MD is
 * org-wide (single top-level role, no region concept for it in this
 * schema).
 */
@Injectable()
export class SlaBreachCron {
  private readonly logger = new Logger(SlaBreachCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly notificationTemplates: NotificationTemplateService,
    private readonly notificationRules: SlaNotificationRuleService,
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
      include: { customer: true, assignedAsm: true, assignedEngineer: true, slaPolicy: true },
    });

    let checked = 0;
    let changed = 0;
    let systemActorId: string | undefined;

    for (const t of tickets) {
      checked++;
      const data: Record<string, unknown> = {};
      const auditEntries: { fieldName: string; oldValue: string; newValue: string }[] = [];

      if (!t.slaResponseMet && t.slaResponseDue) {
        const pct = this.percentElapsed(t.createdAt, t.slaResponseDue, now);
        const next = this.statusFor(pct);
        if (next !== t.slaResponseStatus) {
          data.slaResponseStatus = next;
          auditEntries.push({ fieldName: 'slaResponseStatus', oldValue: t.slaResponseStatus, newValue: next });
          if (next === 'BREACHED') {
            await this.fireResponseBreach(t);
            // 3-level escalation ladder (2026-08-06) — records the exact
            // breach moment (distinct from slaResponseDue, a fixed target)
            // so the ladder below can compute cumulative Level 2/3
            // thresholds from it, and marks tier 1 as fired.
            data.slaResponseBreachedAt = now;
            data.slaResponseEscalationLevel = 1;
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
            data.slaResolutionBreachedAt = now;
            data.slaResolutionEscalationLevel = 1;
          }
        }
      }

      // Escalation advancement — independent of the status-transition checks
      // above (those only fire once, on the ON_TRACK/WARNING_90/BREACHED
      // transition itself), since a ticket already at Level 1 needs to keep
      // being re-checked on every subsequent run to see if enough time has
      // now passed for Level 2/3, without its slaResponse/ResolutionStatus
      // changing again. Effective level after this run's tier-1 detection
      // above (data.slaResponseEscalationLevel ?? t.slaResponseEscalationLevel)
      // — so a ticket that JUST breached this exact run is also eligible to
      // jump straight to Level 2 in the same run if its delay is 0.
      const effectiveResponseLevel = (data.slaResponseEscalationLevel as number | undefined) ?? t.slaResponseEscalationLevel;
      const responseBreachedAt = (data.slaResponseBreachedAt as Date | undefined) ?? t.slaResponseBreachedAt;
      const nextResponseLevel = this.nextEscalationLevel(effectiveResponseLevel, responseBreachedAt, now, t.slaPolicy);
      if (nextResponseLevel) {
        await this.fireEscalationLevel(t, 'RESPONSE', nextResponseLevel);
        data.slaResponseEscalationLevel = nextResponseLevel;
        auditEntries.push({ fieldName: 'slaResponseEscalationLevel', oldValue: String(effectiveResponseLevel), newValue: String(nextResponseLevel) });
      }

      const effectiveResolutionLevel = (data.slaResolutionEscalationLevel as number | undefined) ?? t.slaResolutionEscalationLevel;
      const resolutionBreachedAt = (data.slaResolutionBreachedAt as Date | undefined) ?? t.slaResolutionBreachedAt;
      const nextResolutionLevel = this.nextEscalationLevel(effectiveResolutionLevel, resolutionBreachedAt, now, t.slaPolicy);
      if (nextResolutionLevel) {
        await this.fireEscalationLevel(t, 'RESOLUTION', nextResolutionLevel);
        data.slaResolutionEscalationLevel = nextResolutionLevel;
        auditEntries.push({ fieldName: 'slaResolutionEscalationLevel', oldValue: String(effectiveResolutionLevel), newValue: String(nextResolutionLevel) });
      }

      if (Object.keys(data).length > 0) {
        if (!systemActorId) systemActorId = await this.resolveSystemActorId();
        await this.prisma.ticket.update({ where: { id: t.id }, data });
        for (const entry of auditEntries) {
          await this.prisma.auditLog.create({
            data: {
              entityType: 'TICKET',
              entityId: t.id,
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

  /**
   * 3-level escalation ladder (client request, 2026-08-06) — cumulative
   * delays: Level 2 fires `level2DelayHours` after the breach itself;
   * Level 3 fires `level2DelayHours + level3DelayHours` after the breach
   * (i.e. level3DelayHours after Level 2, not after the original breach
   * directly). Returns the level to escalate TO if its threshold has been
   * crossed and it hasn't already fired, else null. Fires at most one level
   * per call — if a ticket somehow skipped straight past Level 2's window
   * (e.g. the cron missed a run), it advances one level at a time on
   * successive runs rather than jumping straight to Level 3, so Level 2's
   * notification is never silently skipped.
   */
  private nextEscalationLevel(
    currentLevel: number,
    breachedAt: Date | null,
    now: Date,
    policy: { level2DelayHours: number | null; level3DelayHours: number | null } | null,
  ): 2 | 3 | null {
    if (!policy || !breachedAt || currentLevel < 1 || currentLevel >= 3) return null;
    const hoursSinceBreach = (now.getTime() - breachedAt.getTime()) / (1000 * 60 * 60);
    if (currentLevel === 1) {
      if (policy.level2DelayHours != null && hoursSinceBreach >= policy.level2DelayHours) return 2;
      return null;
    }
    // currentLevel === 2
    if (policy.level2DelayHours != null && policy.level3DelayHours != null && hoursSinceBreach >= policy.level2DelayHours + policy.level3DelayHours) {
      return 3;
    }
    return null;
  }

  /**
   * Fires the Level 2/3 escalation notification — recipients are shared
   * between the Response and Resolution ladders (client confirmed: same
   * tiers regardless of which clock breached), resolved the same way as
   * Response/Resolution breach recipients. Not one of the FSD's 23 numbered
   * triggers — same pattern as KPI-BREACH earlier this session (a real
   * alert, just not pre-numbered in the spec).
   */
  private async fireEscalationLevel(
    t: {
      id: string;
      ticketNo: string;
      assignedAsm: { id: string; email: string } | null;
      assignedEngineer: { id: string; email: string } | null;
      customer: { region: Region | null };
    },
    clock: 'RESPONSE' | 'RESOLUTION',
    level: 2 | 3,
  ) {
    const triggerCode = level === 2 ? 'SLA-ESCALATION-L2' : 'SLA-ESCALATION-L3';
    const vars = { ticket_no: t.ticketNo, clock_type: clock === 'RESPONSE' ? 'Response' : 'Resolution' };
    const roles = await this.notificationRules.getEnabledRoles(level === 2 ? 'LEVEL2' : 'LEVEL3');
    const recipients = await this.recipientsForRoles(roles, t);
    await this.sendToAll(triggerCode, recipients, vars, t.id);
  }

  // Region-scoped Manager lookup (client decision, 2026-08-02, reconfirmed
  // 2026-08-04 for SLA breach notifications specifically) — same
  // pattern/fail-safe as TicketsService.managersForRegion(): a null region
  // matches no one, rather than falling back to notifying every Manager.
  private async managersForRegion(region: Region | null) {
    if (!region) return [];
    const regions = await this.prisma.userRegion.findMany({ where: { region, user: { role: 'MANAGER', isActive: true } } });
    if (regions.length === 0) return [];
    return this.prisma.user.findMany({ where: { id: { in: regions.map((r) => r.userId) } } });
  }

  private async usersByRole(role: Role) {
    return this.prisma.user.findMany({ where: { role, isActive: true } });
  }

  /**
   * Resolves the actual recipients for a breach type, given the set of
   * roles Admin has enabled for it (SlaNotificationRuleService). ASM and
   * Engineer resolve to this specific ticket's assignee (or nobody, if
   * unassigned); every other role resolves org-wide except Manager, which
   * stays region-scoped (client confirmed 2026-08-04 — region Manager only).
   */
  private async recipientsForRoles(
    roles: Role[],
    t: {
      assignedAsm: { id: string; email: string } | null;
      assignedEngineer: { id: string; email: string } | null;
      customer: { region: Region | null };
    },
  ): Promise<{ email: string; userId: string }[]> {
    // Deduped by userId — a person can legitimately match more than one
    // enabled role for the same rule (e.g. assigned ASM who is also the
    // region's Manager), and without this they'd receive the same
    // notification once per matching role.
    const recipients = new Map<string, { email: string; userId: string }>();
    for (const role of roles) {
      switch (role) {
        case 'ASM':
          if (t.assignedAsm) recipients.set(t.assignedAsm.id, { email: t.assignedAsm.email, userId: t.assignedAsm.id });
          break;
        case 'ENGINEER':
          if (t.assignedEngineer) recipients.set(t.assignedEngineer.id, { email: t.assignedEngineer.email, userId: t.assignedEngineer.id });
          break;
        case 'MANAGER':
          for (const u of await this.managersForRegion(t.customer.region)) recipients.set(u.id, { email: u.email, userId: u.id });
          break;
        default:
          // CALL_CENTER, ADMIN, CS_SUPPORT, MD — org-wide, no region concept.
          for (const u of await this.usersByRole(role)) recipients.set(u.id, { email: u.email, userId: u.id });
      }
    }
    return [...recipients.values()];
  }

  /** N-15 — SLA response breach: recipients Admin-configured per role, Email + Push. */
  private async fireResponseBreach(t: {
    id: string;
    ticketNo: string;
    priority: string;
    slaResponseDue: Date | null;
    assignedAsm: { id: string; email: string } | null;
    assignedEngineer: { id: string; email: string } | null;
    customer: { region: Region | null };
  }) {
    const vars = { ticket_no: t.ticketNo, priority: t.priority, sla_response_due: t.slaResponseDue?.toISOString() ?? 'N/A' };
    const roles = await this.notificationRules.getEnabledRoles('RESPONSE');
    const recipients = await this.recipientsForRoles(roles, t);
    await this.sendToAll('N-15', recipients, vars, t.id);
  }

  /** N-16 — SLA resolution 90% warning: ASM + Engineer, Push + Email. Not Admin-configurable — this is an early heads-up to the people already on the ticket, not an escalation. */
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

  /** N-17 — SLA resolution breach: recipients Admin-configured per role, Email + Push (WhatsApp needs a phone number, not an email — internal users only have email on file, so this goes out via Email + Push despite the FSD listing WhatsApp; customer-facing WhatsApp triggers like N-01 use the customer's mobile instead). */
  private async fireResolutionBreach(t: {
    id: string;
    ticketNo: string;
    status: string;
    slaResolutionDue: Date | null;
    assignedAsm: { id: string; email: string } | null;
    assignedEngineer: { id: string; email: string } | null;
    customer: { region: Region | null };
  }) {
    const vars = {
      ticket_no: t.ticketNo,
      status: t.status,
      sla_resolution_due: t.slaResolutionDue?.toISOString() ?? 'N/A',
    };
    const roles = await this.notificationRules.getEnabledRoles('RESOLUTION');
    const recipients = await this.recipientsForRoles(roles, t);
    await this.sendToAll('N-17', recipients, vars, t.id);
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
