import { Injectable } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WorkflowLabelService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.ticketStatusLabel.findMany({ orderBy: { status: 'asc' } });
  }

  update(status: TicketStatus, label: string) {
    // upsert, not a plain update — guards against a status somehow missing
    // its seeded row (e.g. a future status added to the enum without a
    // matching migration seed row yet).
    return this.prisma.ticketStatusLabel.upsert({
      where: { status },
      create: { status, label },
      update: { label },
    });
  }
}
