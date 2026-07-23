import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ChangeSource, Prisma, PendingReason, Role, Ticket, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TICKET_TRANSITIONS } from './workflow.constants';

const REGULARIZE_ROLES: Role[] = ['ADMIN', 'CALL_CENTER'];

/** Lets a caller (e.g. TicketsService.create's own $transaction) fold a transition into its own atomic unit instead of committing separately. */
type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

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
      ticketId,
      fromStatus: ticket.status,
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
      ticketId,
      fromStatus: ticket.status,
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
    ticketId: string;
    fromStatus: TicketStatus;
    targetStatus: TicketStatus;
    actorUserId: string;
    auditNote?: string;
    data: Record<string, unknown>;
    tx?: Prisma.TransactionClient;
  }): Promise<Ticket> {
    const { ticketId, fromStatus, targetStatus, actorUserId, auditNote, data, tx } = params;

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
