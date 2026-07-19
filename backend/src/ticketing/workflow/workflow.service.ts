import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ChangeSource, PendingReason, Role, Ticket, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TICKET_TRANSITIONS } from './workflow.constants';

const REGULARIZE_ROLES: Role[] = ['ADMIN', 'CALL_CENTER'];

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
  }): Promise<Ticket> {
    const { ticketId, targetStatus, actorUserId, actorRole, pendingReason, pendingNotes, resolutionSummary } = params;

    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
    const rule = TICKET_TRANSITIONS[ticket.status];

    if (!rule.next.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot move ticket from ${ticket.status} to ${targetStatus}`,
      );
    }
    if (!rule.allowedRoles.includes(actorRole)) {
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
  }): Promise<Ticket> {
    const { ticketId, fromStatus, targetStatus, actorUserId, auditNote, data } = params;

    const [updated] = await this.prisma.$transaction([
      this.prisma.ticket.update({ where: { id: ticketId }, data: data as any }),
      this.prisma.ticketAuditLog.create({
        data: {
          ticketId,
          fieldName: 'status',
          oldValue: fromStatus,
          newValue: auditNote ? `${targetStatus} (${auditNote})` : targetStatus,
          changedByUserId: actorUserId,
          changeSource: ChangeSource.WEB_UI,
        },
      }),
    ]);

    return updated;
  }
}
