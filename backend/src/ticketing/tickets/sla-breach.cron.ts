import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SlaClockStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * SLA breach monitoring cron (2026-07-28, FSD §14.3 — was ❌ pending in the
 * build plan). "90% elapsed → early warning; 100% → breach" per the FSD's
 * own wording, checked independently for the response clock (stops at
 * Assigned) and the resolution clock (stops at Engineer Resolved, does NOT
 * pause during Pending — counts against SLA).
 *
 * Does NOT send any real notification — the gateway/dispatch service is
 * entirely unbuilt (0 of 23 triggers wired, per the build plan). Each place
 * a notification would fire is marked with a TODO and a log line instead,
 * so wiring the real one later is a matter of replacing that one line, not
 * rebuilding the detection logic. State is persisted on the ticket
 * (slaResponseStatus/slaResolutionStatus) so it's badge-able/filterable in
 * the UI without a notification ever needing to exist.
 */
@Injectable()
export class SlaBreachCron {
  private readonly logger = new Logger(SlaBreachCron.name);

  constructor(private readonly prisma: PrismaService) {}

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
          // TODO(notification): wire to the real gateway once built — this is
          // trigger N-## "SLA response 90%/breach" from the FSD's 23-trigger
          // table. For now, just a log line + Timeline audit entry mark the spot.
          this.logger.warn(`TODO: notification trigger — SLA response ${next} for ticket ${t.ticketNo}`);
        }
      }

      if (!t.slaResolutionMet && t.slaResolutionDue) {
        const pct = this.percentElapsed(t.createdAt, t.slaResolutionDue, now);
        const next = this.statusFor(pct);
        if (next !== t.slaResolutionStatus) {
          data.slaResolutionStatus = next;
          auditEntries.push({ fieldName: 'slaResolutionStatus', oldValue: t.slaResolutionStatus, newValue: next });
          // TODO(notification): wire to the real gateway once built — this is
          // trigger N-## "SLA resolution 90%/breach" from the FSD's 23-trigger
          // table. For now, just a log line + Timeline audit entry mark the spot.
          this.logger.warn(`TODO: notification trigger — SLA resolution ${next} for ticket ${t.ticketNo}`);
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
