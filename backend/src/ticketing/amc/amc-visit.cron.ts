import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { AmcEngineSettingsService } from './amc-engine-settings.service';

/**
 * Build plan's "AMC engine: nightly auto-ticket job" (was ❌ pending —
 * the AmcScheduledVisit rows existed via generateScheduledVisits() but
 * nothing ever turned a due one into a real Ticket). Runs once daily —
 * finds every visit with no ticket raised yet (`linkedTicketId: null`)
 * whose plannedDate falls within the look-ahead window (today through
 * today + N days, Admin-configurable via AmcEngineSettings, default 7 —
 * 2026-08-03 fix: this previously only picked up already-due/overdue
 * visits, no forward-looking range at all) and raises a Ticket for it.
 *
 * Filters on `linkedTicketId: null` (2026-08-03 fix), not `status:
 * 'SCHEDULED_PENDING'` as it did before — a real bug found via live
 * testing: rescheduleVisit() (amc-contract.service.ts) sets a visit's
 * status to `RESCHEDULED` when its planned date is edited, and nothing
 * ever moves it back to `SCHEDULED_PENDING` — so a rescheduled visit was
 * silently excluded from ever getting a ticket auto-created, forever.
 * `linkedTicketId: null` is the actually-correct condition (matches the
 * literal spec wording too): only `TICKET_RAISED` visits ever get a
 * `linkedTicketId` set (confirmed — `COMPLETED` is a schema-only status,
 * never actually written anywhere in the code), so this naturally covers
 * both `SCHEDULED_PENDING` and `RESCHEDULED` alike.
 */
@Injectable()
export class AmcVisitCron {
  private readonly logger = new Logger(AmcVisitCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
    private readonly settings: AmcEngineSettingsService,
  ) {}

  @Cron('0 1 * * *', { timeZone: 'Asia/Kolkata' }) // 1:00 AM IST daily
  async run() {
    const lookAheadDays = await this.settings.getLookAheadDays();
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() + lookAheadDays);

    const dueVisits = await this.prisma.amcScheduledVisit.findMany({
      where: { linkedTicketId: null, plannedDate: { lte: windowEnd } },
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
          plannedDate: visit.plannedDate,
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
