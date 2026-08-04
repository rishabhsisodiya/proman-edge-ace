import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { PredictiveRuleService } from '../predictive-rules/predictive-rule.service';

/**
 * Warranty-period PM visit schedule (2026-08-04, new requirement — not in
 * the original FSD §7.3 warranty rules; client clarified via direct
 * discussion). For every active equipment record with NO active AMC
 * contract (AMC already has its own scheduled-visit mechanism — this would
 * double up), auto-generates a set of PM visit dates spaced
 * `warrantyPmIntervalMonths` apart (per equipment-category, Admin-
 * configurable on the Predictive Rules screen — default 3) starting from
 * `warrantyStartDate`, for as long as they land on/before `warrantyEndDate`.
 * Visit count is NOT fixed at 4 — however many intervals actually fit in
 * this equipment's real warranty window is how many get generated, so a
 * 6-month or 18-month warranty still gets sensible coverage.
 *
 * Runs daily, two passes, same split as the AMC visit mechanism
 * (AmcContractService.generateScheduledVisits + AmcVisitCron), just folded
 * into one cron here since generation is self-healing/idempotent (only
 * equipment with zero existing WarrantyPmVisit rows gets a schedule) rather
 * than a one-time action at contract creation:
 *   1. Generate: equipment with no WarrantyPmVisit rows yet gets its schedule created.
 *   2. Raise tickets: any visit with no ticket yet (`linkedTicketId: null`)
 *      whose plannedDate falls within the look-ahead window (today through
 *      today + N days, Admin-configurable via WarrantyPmEngineSettings,
 *      default 7) gets a real Ticket — same `linkedTicketId: null` filter
 *      AmcVisitCron uses (not a status check), for the identical reason
 *      documented there (a rescheduled/edited visit must not be silently
 *      excluded forever).
 *
 * Duplicate guard against the Predictive Engine's own Scheduled PM ticket
 * (operating-hours-interval rule, §7.4 rule 3) — both mechanisms can
 * produce a `serviceType=SCHEDULED_PM` ticket for the same equipment.
 * Checks for ANY open Scheduled PM ticket regardless of source before
 * creating one, mirroring PredictiveEngineCron.hasOpenScheduledPmTicket()
 * exactly (that method was widened the same day, for the same reason).
 */
@Injectable()
export class WarrantyPmCron {
  private readonly logger = new Logger(WarrantyPmCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
    private readonly predictiveRules: PredictiveRuleService,
  ) {}

  @Cron('30 3 * * *', { timeZone: 'Asia/Kolkata' }) // 3:30 AM IST daily, after the Predictive Engine cron (3 AM)
  async run() {
    const generated = await this.generateSchedules();
    const ticketsCreated = await this.raiseDueTickets();
    this.logger.log(`Warranty PM cron complete — ${generated} equipment record(s) scheduled, ${ticketsCreated} ticket(s) created`);
  }

  private async generateSchedules(): Promise<number> {
    const configs = await this.prisma.predictiveRuleConfig.findMany();
    const intervalByCategory = new Map(configs.map((c) => [c.equipmentCategory, c.warrantyPmIntervalMonths]));

    const candidates = await this.prisma.equipment.findMany({
      where: { status: 'ACTIVE', warrantyPmVisits: { none: {} } },
      include: { amcContracts: true },
    });

    let generated = 0;
    for (const eq of candidates) {
      try {
        // Same "active AMC coverage" condition as WarrantyEngineCron's
        // outreach-ticket skip — AMC already runs its own scheduled-visit
        // mechanism for this equipment, don't also run this one.
        const hasActiveAmc = eq.amcContracts.some((c) => c.renewalStatus !== 'LAPSED' && c.renewalStatus !== 'RENEWED');
        if (hasActiveAmc) continue;

        const intervalMonths = intervalByCategory.get(eq.equipmentCategory) ?? 3;
        const plannedDates: Date[] = [];
        let seq = 1;
        while (true) {
          const d = new Date(eq.warrantyStartDate);
          d.setMonth(d.getMonth() + intervalMonths * seq);
          if (d > eq.warrantyEndDate) break;
          plannedDates.push(d);
          seq++;
        }
        if (plannedDates.length === 0) continue;

        await this.prisma.warrantyPmVisit.createMany({
          data: plannedDates.map((plannedDate, i) => ({ equipmentId: eq.id, visitSeqNo: i + 1, plannedDate })),
        });
        generated++;
      } catch (err) {
        this.logger.error(`Failed to generate warranty PM schedule for equipment ${eq.id}`, err);
      }
    }
    return generated;
  }

  private async raiseDueTickets(): Promise<number> {
    const lookAheadDays = await this.predictiveRules.getWarrantyPmLookAheadDays();
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() + lookAheadDays);

    const dueVisits = await this.prisma.warrantyPmVisit.findMany({
      where: { linkedTicketId: null, plannedDate: { lte: windowEnd } },
      include: { equipment: true },
    });

    let created = 0;
    for (const visit of dueVisits) {
      try {
        const hasOpenScheduledPm = await this.prisma.ticket.findFirst({
          where: { equipmentId: visit.equipmentId, serviceType: 'SCHEDULED_PM', status: { not: 'CLOSED' } },
        });
        if (hasOpenScheduledPm) continue;

        const ticket = await this.tickets.createFromWarrantyPmSchedule({
          customerId: visit.equipment.customerId,
          equipmentId: visit.equipmentId,
          equipmentSerialNo: visit.equipment.serialNo,
          visitSeqNo: visit.visitSeqNo,
          plannedDate: visit.plannedDate,
        });
        await this.prisma.warrantyPmVisit.update({
          where: { id: visit.id },
          data: { status: 'TICKET_RAISED', linkedTicketId: ticket.id },
        });
        created++;
      } catch (err) {
        this.logger.error(`Failed to raise ticket for warranty PM visit ${visit.id}`, err);
      }
    }
    return created;
  }
}
