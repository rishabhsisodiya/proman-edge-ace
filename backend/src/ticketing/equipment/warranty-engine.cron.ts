import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { TicketsService } from '../tickets/tickets.service';
import { computeWarrantyStatus, EXPIRING_SOON_DAYS } from './equipment.service';

/**
 * FSD §7.3 Warranty management engine — was ❌ pending entirely (rule 12's
 * nightly recompute never existed — `computeWarrantyStatus()` only ran at
 * create/update time, so a record left untouched for months showed a stale
 * status; rule 15's outreach ticket never existed at all). Rule 14 (Manager
 * override + audit trail) was already built separately, 2026-07-31 — see
 * `TicketsService.overrideWarrantyEligible()`.
 */
@Injectable()
export class WarrantyEngineCron {
  private readonly logger = new Logger(WarrantyEngineCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tickets: TicketsService,
  ) {}

  @Cron('0 1 * * *', { timeZone: 'Asia/Kolkata' }) // 1:00 AM IST daily, per FSD rule 12
  async run() {
    const recomputed = await this.recomputeWarrantyStatuses();
    const outreachCreated = await this.generateOutreachTickets();
    this.logger.log(`Warranty engine cron complete — ${recomputed} status(es) recomputed, ${outreachCreated} outreach ticket(s) created`);
  }

  /** Rule 12 — nightly recompute for every active Equipment record. */
  private async recomputeWarrantyStatuses(): Promise<number> {
    const equipment = await this.prisma.equipment.findMany({ where: { status: 'ACTIVE' } });
    let changed = 0;
    for (const eq of equipment) {
      const next = computeWarrantyStatus(eq.warrantyEndDate);
      if (next !== eq.warrantyStatus) {
        await this.prisma.equipment.update({ where: { id: eq.id }, data: { warrantyStatus: next } });
        changed++;
      }
    }
    return changed;
  }

  /**
   * Rule 15 — 45 days before warrantyEndDate, for equipment with no AMC
   * contract in place (or only a lapsed one — a lapsed AMC is functionally
   * "no AMC" for this purpose). "Once" per expiry cycle, tracked via
   * `warrantyOutreachSentAt` (reset to null on renewal — see
   * EquipmentService.update()).
   */
  private async generateOutreachTickets(): Promise<number> {
    const now = new Date();
    const candidates = await this.prisma.equipment.findMany({
      where: { status: 'ACTIVE', warrantyOutreachSentAt: null },
      include: { amcContracts: true },
    });

    let created = 0;
    for (const eq of candidates) {
      const daysUntilExpiry = (eq.warrantyEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (daysUntilExpiry > EXPIRING_SOON_DAYS) continue;
      // A LAPSED or superseded (RENEWED) contract doesn't count as coverage —
      // if it was genuinely renewed, the new contract row is its own
      // separate entry in this same list and would be caught here instead.
      const hasActiveAmc = eq.amcContracts.some((c) => c.renewalStatus !== 'LAPSED' && c.renewalStatus !== 'RENEWED');
      if (hasActiveAmc) continue;

      try {
        await this.tickets.createFromWarrantyOutreach({
          customerId: eq.customerId,
          equipmentId: eq.id,
          equipmentSerialNo: eq.serialNo,
          warrantyEndDate: eq.warrantyEndDate,
        });
        await this.prisma.equipment.update({ where: { id: eq.id }, data: { warrantyOutreachSentAt: now } });
        created++;
      } catch (err) {
        this.logger.error(`Failed to create warranty outreach ticket for equipment ${eq.id}`, err);
      }
    }
    return created;
  }
}
