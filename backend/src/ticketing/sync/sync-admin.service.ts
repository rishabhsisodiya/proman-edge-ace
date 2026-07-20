import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerSyncService } from './customer-sync.service';

/** Backs the W-26 Sync Monitor admin screen (§12.5/§10.1). */
@Injectable()
export class SyncAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerSync: CustomerSyncService,
  ) {}

  runs(entity?: string) {
    return this.prisma.syncLog.findMany({
      where: entity ? { entity } : undefined,
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  }

  failures() {
    return this.prisma.customerSyncFailure.findMany({ orderBy: { lastAttemptAt: 'desc' } });
  }

  skipped() {
    return this.prisma.customerSyncSkipped.findMany({ orderBy: { firstSeenAt: 'desc' } });
  }

  needsReview() {
    return this.prisma.customer.findMany({
      where: { needsReview: true },
      orderBy: { lastSyncedAt: 'desc' },
      select: { id: true, customerName: true, erpnextCustomerId: true, region: true, reviewReason: true, lastSyncedAt: true },
    });
  }

  async retryFailure(id: string) {
    const failure = await this.prisma.customerSyncFailure.findUnique({ where: { id } });
    if (!failure) throw new NotFoundException('Failure record not found');
    const ok = await this.customerSync.manualRetry(failure.erpnextCustomerId);
    return { ok };
  }

  /** Manual on-demand run — the nightly Cron fires the same method automatically. */
  async triggerRun() {
    await this.customerSync.run();
    return { ok: true };
  }
}
