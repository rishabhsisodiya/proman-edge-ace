import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ChangeSource, Prisma, PendingReason, Role, Ticket, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TICKET_TRANSITIONS } from './workflow.constants';
import { SlaPauseStateService } from '../sla-pause-state/sla-pause-state.service';
import { SLA_TARGET_DATE_SERVICE_TYPES } from '../tickets/sla-policy.constants';

const REGULARIZE_ROLES: Role[] = ['ADMIN', 'CALL_CENTER'];

/** Lets a caller (e.g. TicketsService.create's own $transaction) fold a transition into its own atomic unit instead of committing separately. */
type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly slaPauseStates: SlaPauseStateService,
  ) {}

  /**
   * The only writer of ticket.status. Every transition is validated against
   * TICKET_TRANSITIONS and logged to TicketAuditLog — no direct status writes
   * anywhere else in the codebase.
   */
  async transition(params: {
    ticketId: string;
    targetStatus: TicketStatus;
    actorUserId: string;
    actorRole: Role;
    pendingReason?: PendingReason;
    pendingNotes?: string;
    resolutionSummary?: string;
    /** Optional free-text note from the actor (client request: allow a
     * comment at each stage after Accepted) — folded into the audit log
     * entry, same mechanism `regularize()` already uses for its reason. */
    comment?: string;
    /** Pass the caller's own transaction client to make this transition
     * atomic with whatever else the caller is doing (e.g. ticket creation +
     * auto-assignment) — a failure here then rolls back the whole thing
     * instead of leaving a half-created ticket committed. */
    tx?: Prisma.TransactionClient;
  }): Promise<Ticket> {
    const { ticketId, targetStatus, actorUserId, actorRole, pendingReason, pendingNotes, resolutionSummary, comment, tx } = params;
    const db: Db = tx ?? this.prisma;

    const ticket = await db.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    const rule = TICKET_TRANSITIONS[ticket.status];

    if (!rule.next.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot move ticket from ${ticket.status} to ${targetStatus}`,
      );
    }
    // Admin is a universal bypass everywhere else in the app (RolesGuard) —
    // apply the same convention here instead of listing ADMIN in every
    // TICKET_TRANSITIONS entry individually.
    if (actorRole !== 'ADMIN' && !rule.allowedRoles.includes(actorRole)) {
      throw new ForbiddenException(`Role ${actorRole} cannot trigger this transition`);
    }
    if (targetStatus === 'PENDING' && !pendingReason) {
      throw new BadRequestException('pendingReason is required when moving a ticket to Pending');
    }
    if (targetStatus === 'ENGINEER_RESOLVED' && !resolutionSummary) {
      throw new BadRequestException('resolutionSummary is required to mark a ticket Engineer Resolved');
    }

    return this.applyTransition({
      ticket,
      targetStatus,
      actorUserId,
      auditNote: comment?.trim() || undefined,
      tx,
      data: {
        status: targetStatus,
        closedAt: targetStatus === 'CLOSED' ? new Date() : undefined,
        // Entering PENDING stores the reason/notes; resuming to WORKING clears
        // them (§5.3 pendingReason/pendingNotes are the "current pending
        // state", not a running history — TicketAuditLog keeps that trail).
        pendingReason: targetStatus === 'PENDING' ? pendingReason : null,
        pendingNotes: targetStatus === 'PENDING' ? (pendingNotes ?? null) : null,
        ...(resolutionSummary ? { resolutionSummary } : {}),
        // FSD §14.3: response clock stops at Assigned, resolution clock stops
        // at Engineer Resolved. These two fields existed on the schema since
        // Days 1-3 but were never actually written anywhere until now — the
        // SLA breach cron needs them to know which clocks are still running.
        ...(targetStatus === 'ASSIGNED' ? { slaResponseMet: true, slaResponseStatus: 'ON_TRACK' } : {}),
        ...(targetStatus === 'ENGINEER_RESOLVED' ? { slaResolutionMet: true, slaResolutionStatus: 'ON_TRACK' } : {}),
        // Bounced back to rework (e.g. ASM reject-after-resolved) — the
        // resolution clock restarts, it shouldn't stay marked "met" forever.
        ...(targetStatus === 'ENGINEER_ASSIGNED' && ticket.status === 'ENGINEER_RESOLVED'
          ? { slaResolutionMet: false, slaResolutionStatus: 'ON_TRACK' }
          : {}),
      },
    });
  }

  /**
   * "Regularize Ticket" (§5.4 rule 19) — Admin/Call Center force-move any
   * state to any state, bypassing TICKET_TRANSITIONS entirely. Always
   * requires a reason and is always audit-logged with it, unlike a normal
   * transition.
   */
  async regularize(params: {
    ticketId: string;
    targetStatus: TicketStatus;
    actorUserId: string;
    actorRole: Role;
    reason: string;
  }): Promise<Ticket> {
    const { ticketId, targetStatus, actorUserId, actorRole, reason } = params;
    if (!REGULARIZE_ROLES.includes(actorRole)) {
      throw new ForbiddenException('Only Admin or Call Center can regularize a ticket');
    }
    if (!reason?.trim()) {
      throw new BadRequestException('A reason is required to regularize a ticket');
    }

    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });

    return this.applyTransition({
      ticket,
      targetStatus,
      actorUserId,
      auditNote: `Regularized: ${reason}`,
      data: {
        status: targetStatus,
        closedAt: targetStatus === 'CLOSED' ? new Date() : undefined,
        pendingReason: targetStatus === 'PENDING' ? ticket.pendingReason : null,
        pendingNotes: targetStatus === 'PENDING' ? ticket.pendingNotes : null,
      },
    });
  }

  private async applyTransition(params: {
    ticket: Ticket;
    targetStatus: TicketStatus;
    actorUserId: string;
    auditNote?: string;
    data: Record<string, unknown>;
    tx?: Prisma.TransactionClient;
  }): Promise<Ticket> {
    const { ticket, targetStatus, actorUserId, auditNote, data, tx } = params;
    const ticketId = ticket.id;
    const fromStatus = ticket.status;

    // FSD §14.1 rule 21 — admin-configurable SLA pause-state list. Entering a
    // configured status starts the pause clock; leaving one stops it and
    // pushes the paused duration onto whichever due-dates haven't been met
    // yet, so paused time genuinely doesn't count against the SLA.
    const pausingStatuses = await this.slaPauseStates.listPausingStatuses();
    const wasPaused = pausingStatuses.has(fromStatus);
    const willBePaused = pausingStatuses.has(targetStatus);
    const pauseData: Record<string, unknown> = {};
    if (!wasPaused && willBePaused) {
      pauseData.slaPausedAt = new Date();
    } else if (wasPaused && !willBePaused && ticket.slaPausedAt) {
      const elapsedMs = Date.now() - ticket.slaPausedAt.getTime();
      pauseData.slaPausedAt = null;
      pauseData.slaPausedMinutes = ticket.slaPausedMinutes + Math.max(0, Math.round(elapsedMs / 60000));
      if (!ticket.slaResponseMet && ticket.slaResponseDue) {
        pauseData.slaResponseDue = new Date(ticket.slaResponseDue.getTime() + elapsedMs);
      }
      // SLA Target Date types (Scheduled PM/Technical Audit/Retrofit-Upgrade)
      // — resolution due is a fixed calendar date the client agreed to, not
      // a business-hours offset; client confirmed (2026-07-30) it never
      // moves regardless of how long the ticket was paused.
      const usesTargetDate = ticket.serviceType != null && SLA_TARGET_DATE_SERVICE_TYPES.includes(ticket.serviceType);
      if (!usesTargetDate && !ticket.slaResolutionMet && ticket.slaResolutionDue) {
        pauseData.slaResolutionDue = new Date(ticket.slaResolutionDue.getTime() + elapsedMs);
      }
    }
    Object.assign(data, pauseData);

    const auditData = {
      ticketId,
      fieldName: 'status',
      oldValue: fromStatus,
      newValue: auditNote ? `${targetStatus} (${auditNote})` : targetStatus,
      changedByUserId: actorUserId,
      changeSource: ChangeSource.WEB_UI,
    };

    if (tx) {
      const updated = await tx.ticket.update({ where: { id: ticketId }, data: data as any });
      await tx.ticketAuditLog.create({ data: auditData });
      return updated;
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.ticket.update({ where: { id: ticketId }, data: data as any }),
      this.prisma.ticketAuditLog.create({ data: auditData }),
    ]);

    return updated;
  }
}
