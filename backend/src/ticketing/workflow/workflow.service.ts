import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ChangeSource, PendingReason, Role, Ticket, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TICKET_TRANSITIONS } from './workflow.constants';

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
  }): Promise<Ticket> {
    const { ticketId, targetStatus, actorUserId, actorRole, pendingReason, pendingNotes } = params;

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

    // Entering PENDING stores the reason/notes; resuming to WORKING clears them
    // (§5.3 pendingReason/pendingNotes are the "current pending state", not a
    // running history — TicketAuditLog already keeps the historical trail).
    const [updated] = await this.prisma.$transaction([
      this.prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: targetStatus,
          closedAt: targetStatus === 'CLOSED' ? new Date() : undefined,
          pendingReason: targetStatus === 'PENDING' ? pendingReason : null,
          pendingNotes: targetStatus === 'PENDING' ? (pendingNotes ?? null) : null,
        },
      }),
      this.prisma.ticketAuditLog.create({
        data: {
          ticketId,
          fieldName: 'status',
          oldValue: ticket.status,
          newValue: targetStatus,
          changedByUserId: actorUserId,
          changeSource: ChangeSource.WEB_UI,
        },
      }),
    ]);

    return updated;
  }
}
