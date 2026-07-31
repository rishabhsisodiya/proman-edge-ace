import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * FSD §14.4 rule 29 — "quotation auto-expires on valid_until, CS Support can
 * reactivate by extending" (was ❌ not built — no cron, no status change ever
 * happened). Only DRAFT/SENT quotations are eligible — anything already
 * CUSTOMER_ACCEPTED/PO_RECEIVED/CONVERTED_TO_SALES_ORDER/CANCELLED has moved
 * past the point where "still awaiting a decision" applies, and re-expiring
 * an already-CANCELLED quotation makes no sense either. Reactivation path is
 * QuotationService.update() — extending validUntil past today on an EXPIRED
 * quotation reverts it to SENT (if it had been sent) or DRAFT.
 */
@Injectable()
export class QuotationExpiryCron {
  private readonly logger = new Logger(QuotationExpiryCron.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 2 * * *', { timeZone: 'Asia/Kolkata' }) // 2 AM IST daily
  async run() {
    const result = await this.prisma.quotation.updateMany({
      where: { status: { in: ['DRAFT', 'SENT'] }, validUntil: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
    this.logger.log(`Quotation expiry cron complete — ${result.count} quotation(s) expired`);
  }
}
