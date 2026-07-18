import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FinanceService } from './finance.service';
import { FinanceSnapshotStore, FinanceKpiSnapshot } from './finance-snapshot.store';

// Ported from PROMAN/backend/src/cron/financeKpiSnapshot.ts (node-cron ->
// @nestjs/schedule, same schedule/timezone/query logic) — writes today's
// Finance KPI totals into FinanceKpiSnapshot once a day, and backfills 6
// months of real historical values on first boot if the table is empty
// (GL Entry / Payment Ledger Entry / Sales Invoice are immutable ledgers, so
// "as of a past date" queries return genuine historical values, not fabricated
// placeholders).

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function iso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function monthStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function lastDayOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

@Injectable()
export class FinanceSnapshotCron implements OnModuleInit {
  private readonly logger = new Logger(FinanceSnapshotCron.name);

  constructor(
    private readonly finance: FinanceService,
    private readonly store: FinanceSnapshotStore,
  ) {}

  async onModuleInit() {
    const hasData = await this.store.hasAnySnapshot();
    if (!hasData) {
      this.logger.log('No snapshot data found — backfilling 6 months now…');
      this.backfillSnapshots().catch((err) => this.logger.error('Backfill failed', err));
    }
  }

  private async snapshotAsOf(companies: string[], asOf: Date, monthStartDate: Date): Promise<FinanceKpiSnapshot> {
    const asOfIso = iso(asOf);
    const [cashBank, overdue, revenue, gst, payables] = await Promise.all([
      this.finance.getCashBankTotalForCompanies(companies, asOfIso),
      this.finance.getOverdueTotalForCompanies(companies, asOfIso),
      this.finance.getRevenueTotalForCompanies(companies, iso(monthStartDate), asOfIso),
      this.finance.getGstTotalForCompanies(companies, iso(monthStartDate), asOfIso),
      this.finance.getPayablesDueTotalForCompanies(companies, asOfIso, 7),
    ]);
    return {
      date: asOfIso,
      cashBank,
      overdueReceivables: overdue.total,
      revenueMtd: revenue,
      gstLiability: gst,
      payablesDue7d: payables.total,
    };
  }

  async backfillSnapshots() {
    try {
      const companies = await this.finance.getCompanies();
      const today = new Date();
      const points: { asOf: Date; monthStart: Date }[] = [];

      for (let i = 5; i >= 1; i--) {
        const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
        points.push({ asOf: lastDayOfMonth(monthDate), monthStart: monthStart(monthDate) });
      }
      points.push({ asOf: today, monthStart: monthStart(today) }); // current month, partial (MTD)

      const snapshots = await Promise.all(points.map((p) => this.snapshotAsOf(companies, p.asOf, p.monthStart)));
      await this.store.writeFinanceSnapshots(snapshots);
      this.logger.log(`Backfilled ${snapshots.length} historical monthly snapshots`);
    } catch (err) {
      this.logger.error('Backfill failed', err);
    }
  }

  @Cron('50 23 * * *', { timeZone: 'Asia/Kolkata' })
  async captureSnapshot() {
    try {
      const companies = await this.finance.getCompanies();
      const today = new Date();
      const snapshot = await this.snapshotAsOf(companies, today, monthStart(today));
      await this.store.writeFinanceSnapshot(snapshot);
      this.logger.log(`Snapshot saved for ${snapshot.date}`);
    } catch (err) {
      this.logger.error('Failed to capture snapshot', err);
    }
  }
}
