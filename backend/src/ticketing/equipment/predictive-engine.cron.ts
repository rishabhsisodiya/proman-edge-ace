import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';

/**
 * FSD §7.4 Predictive maintenance rules, Phase 1 (rule-based triggers) — was
 * ❌ pending entirely, only a stub comment existed. Three independent checks
 * per active equipment record, daily. Each rule guards against re-firing
 * every day once its condition becomes true (see per-rule comments below).
 */
@Injectable()
export class PredictiveEngineCron {
  private readonly logger = new Logger(PredictiveEngineCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
  ) {}

  @Cron('0 3 * * *', { timeZone: 'Asia/Kolkata' }) // 3 AM IST daily, after the AMC/warranty crons
  async run() {
    const equipment = await this.prisma.equipment.findMany({
      where: { status: 'ACTIVE' },
      include: { customer: true },
    });
    const configs = await this.prisma.predictiveRuleConfig.findMany();
    const configByCategory = new Map(configs.map((c) => [c.equipmentCategory, c]));

    let created = 0;
    for (const eq of equipment) {
      try {
        // Rules 1 & 2 both produce a Technical Audit ticket — if one's
        // already open from either cause, don't create a second. Check the
        // more severe cause (breakdown frequency) first.
        const hasOpenTechnicalAudit = await this.hasOpenPredictiveTicket(eq.id, 'TECHNICAL_AUDIT');
        if (!hasOpenTechnicalAudit) {
          const rowConfig = configByCategory.get(eq.equipmentCategory);
          if (rowConfig && (await this.checkBreakdownFrequency(eq.id, rowConfig.breakdownFrequencyThreshold, rowConfig.breakdownFrequencyWindowMonths))) {
            await this.createPredictiveTicket(
              eq,
              'TECHNICAL_AUDIT',
              'HIGH',
              `Breakdown frequency: ${rowConfig.breakdownFrequencyThreshold}+ chargeable breakdowns in the last ${rowConfig.breakdownFrequencyWindowMonths} months.`,
            );
            created++;
          } else {
            const config = configByCategory.get(eq.equipmentCategory);
            if (config && (await this.checkTimeSinceService(eq.id, config.monthsSinceService))) {
              await this.createPredictiveTicket(
                eq,
                'TECHNICAL_AUDIT',
                'MEDIUM',
                `No submitted Field Service Visit in the last ${config.monthsSinceService} months.`,
              );
              created++;
            }
          }
        }

        // Rule 3 — operating hours interval, independent of the above.
        const config = configByCategory.get(eq.equipmentCategory);
        if (config && eq.operatingHoursMeter != null) {
          const checkpoint = eq.predictiveHoursCheckpoint ?? 0;
          if (eq.operatingHoursMeter - checkpoint >= config.operatingHoursInterval) {
            const hasOpenScheduledPm = await this.hasOpenPredictiveTicket(eq.id, 'SCHEDULED_PM');
            if (!hasOpenScheduledPm) {
              await this.createPredictiveTicket(
                eq,
                'SCHEDULED_PM',
                'HIGH',
                `Operating hours meter crossed the ${config.operatingHoursInterval}-hour service interval (currently ${eq.operatingHoursMeter}h).`,
              );
              created++;
            }
            // Advance the checkpoint by whole intervals crossed, not just to
            // the current reading — a meter that jumped several intervals at
            // once (rare, but possible with manual entry) doesn't lose track
            // of how many service intervals have actually passed.
            const intervalsCrossed = Math.floor((eq.operatingHoursMeter - checkpoint) / config.operatingHoursInterval);
            await this.prisma.equipment.update({
              where: { id: eq.id },
              data: { predictiveHoursCheckpoint: checkpoint + intervalsCrossed * config.operatingHoursInterval },
            });
          }
        }
      } catch (err) {
        this.logger.error(`Failed to evaluate predictive rules for equipment ${eq.id}`, err);
      }
    }

    this.logger.log(`Predictive engine cron complete — ${equipment.length} equipment checked, ${created} ticket(s) created`);
  }

  private hasOpenPredictiveTicket(equipmentId: string, serviceType: 'TECHNICAL_AUDIT' | 'SCHEDULED_PM') {
    return this.prisma.ticket
      .findFirst({ where: { equipmentId, serviceType, source: 'PREDICTIVE', status: { not: 'CLOSED' } } })
      .then((t) => t != null);
  }

  private async checkBreakdownFrequency(equipmentId: string, threshold: number, windowMonths: number): Promise<boolean> {
    const since = new Date();
    since.setMonth(since.getMonth() - windowMonths);
    const count = await this.prisma.ticket.count({
      where: { equipmentId, serviceType: 'BREAKDOWN_CHARGEABLE', createdAt: { gte: since } },
    });
    return count >= threshold;
  }

  private async checkTimeSinceService(equipmentId: string, monthsSinceService: number): Promise<boolean> {
    const since = new Date();
    since.setMonth(since.getMonth() - monthsSinceService);
    const recentFsv = await this.prisma.fieldServiceVisit.findFirst({
      where: { status: 'SUBMITTED', ticket: { equipmentId }, submittedAt: { gte: since } },
    });
    return recentFsv == null;
  }

  private async createPredictiveTicket(
    equipment: { id: string; customerId: string; serialNo: string },
    serviceType: 'TECHNICAL_AUDIT' | 'SCHEDULED_PM',
    priority: 'MEDIUM' | 'HIGH',
    reasonNote: string,
  ) {
    await this.tickets.createFromPredictiveTrigger({
      customerId: equipment.customerId,
      equipmentId: equipment.id,
      equipmentSerialNo: equipment.serialNo,
      serviceType,
      priority,
      reasonNote,
    });
  }
}
