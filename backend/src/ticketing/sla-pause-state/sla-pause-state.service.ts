import { Injectable, ConflictException } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * FSD §14.1 rule 21 — admin-configurable list of ticket statuses that pause
 * the SLA clock (default: empty, matching "SLA does not pause in Pending
 * (Reason) state" unless Admin explicitly adds it or another status here).
 * Read by WorkflowService.applyTransition() on every status change.
 */
@Injectable()
export class SlaPauseStateService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.slaPauseState.findMany({ orderBy: { status: 'asc' } });
  }

  async create(status: TicketStatus) {
    const existing = await this.prisma.slaPauseState.findUnique({ where: { status } });
    if (existing) throw new ConflictException('This status is already on the SLA pause list');
    return this.prisma.slaPauseState.create({ data: { status } });
  }

  remove(id: string) {
    return this.prisma.slaPauseState.delete({ where: { id } });
  }

  /** Used by WorkflowService — not exposed via the controller. */
  async listPausingStatuses(): Promise<Set<TicketStatus>> {
    const rows = await this.prisma.slaPauseState.findMany({ select: { status: true } });
    return new Set(rows.map((r) => r.status));
  }
}
