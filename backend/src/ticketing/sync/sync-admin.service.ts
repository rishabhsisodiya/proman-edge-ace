import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerSyncService } from './customer-sync.service';
import { ItemSyncService } from './item-sync.service';

/** Backs the W-26 Sync Monitor admin screen (§12.5/§10.1). */
@Injectable()
export class SyncAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerSync: CustomerSyncService,
    private readonly itemSync: ItemSyncService,
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

  /**
   * Manual on-demand run of the full night job — Customer (+ CustomerSite)
   * then Item, same sequence NightlySyncCron fires automatically at 1:30 AM.
   * @param force Ignores each sync's modified-since watermark and reprocesses
   * every record from scratch — for one-off full resyncs, not routine use.
   */
  async triggerRun(force = false) {
    await this.customerSync.run(force);
    await this.itemSync.run(force);
    return { ok: true };
  }
}
