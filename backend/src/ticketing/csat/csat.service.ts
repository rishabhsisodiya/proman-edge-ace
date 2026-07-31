import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Public (unauthenticated) CSAT capture — N-14 (FSD §9), the first
 * customer-facing surface in this app that doesn't require a login. The
 * survey link uses the ticket's own id (already an unguessable UUID) rather
 * than a separate token — same reasoning most one-time survey links use.
 */
@Injectable()
export class CsatService {
  constructor(private readonly prisma: PrismaService) {}

  /** Minimal, public-safe info for the survey page to render itself — no PII beyond the ticket number. */
  async getSurveyState(ticketId: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { ticketNo: true, status: true, csatScore: true, csatResponseText: true },
    });
    if (!ticket) throw new NotFoundException('Survey link is invalid or has expired');
    return {
      ticketNo: ticket.ticketNo,
      alreadySubmitted: ticket.csatScore != null,
      score: ticket.csatScore,
      responseText: ticket.csatResponseText,
    };
  }

  async submit(ticketId: string, score: number, responseText?: string) {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId }, select: { status: true, csatScore: true } });
    if (!ticket) throw new NotFoundException('Survey link is invalid or has expired');
    if (ticket.status !== 'CLOSED') {
      throw new BadRequestException('This ticket is not yet closed — the survey isn\'t available until then');
    }
    if (ticket.csatScore != null) {
      throw new BadRequestException('Feedback has already been submitted for this ticket');
    }

    await this.prisma.ticket.update({
      where: { id: ticketId },
      data: { csatScore: score, csatResponseText: responseText },
    });
    return { ok: true };
  }
}
