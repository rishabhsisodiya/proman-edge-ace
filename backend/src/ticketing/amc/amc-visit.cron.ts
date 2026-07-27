import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';

/**
 * Build plan's "AMC engine: nightly auto-ticket job" (was ❌ pending —
 * the AmcScheduledVisit rows existed via generateScheduledVisits() but
 * nothing ever turned a due one into a real Ticket). Runs once daily —
 * finds every SCHEDULED_PENDING visit whose plannedDate has arrived (today
 * or earlier — covers a missed run) and raises a Ticket for it.
 */
@Injectable()
export class AmcVisitCron {
  private readonly logger = new Logger(AmcVisitCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
  ) {}

  @Cron('15 17 * * *', { timeZone: 'Asia/Kolkata' }) // TEMP: 4:24 PM IST for testing — revert to '0 1 * * *' after
  async run() {
    const dueVisits = await this.prisma.amcScheduledVisit.findMany({
      where: { status: 'SCHEDULED_PENDING', plannedDate: { lte: new Date() } },
      include: { contract: true },
    });

    for (const visit of dueVisits) {
      try {
        const ticket = await this.tickets.createFromAmcSchedule({
          contractId: visit.contractId,
          customerId: visit.contract.customerId,
          equipmentId: visit.equipmentId,
          visitSeqNo: visit.visitSeqNo,
          contractReferenceNo: visit.contract.contractReferenceNo,
        });
        await this.prisma.amcScheduledVisit.update({
          where: { id: visit.id },
          data: { status: 'TICKET_RAISED', linkedTicketId: ticket.id },
        });
      } catch (err) {
        this.logger.error(`Failed to raise ticket for scheduled visit ${visit.id}`, err);
      }
    }
    this.logger.log(`AMC visit cron complete — ${dueVisits.length} due visit(s) processed`);
  }
}
