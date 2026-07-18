import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SparkPoint } from './finance.types';

// Replaces the old file-based store (backend/data/finance_kpi_snapshots.json)
// — same logic, now backed by the FinanceKpiSnapshot table. Written daily by
// FinanceSnapshotCron (see finance-snapshot.cron.ts).

export interface FinanceKpiSnapshot {
  date: string;
  cashBank: number;
  overdueReceivables: number;
  revenueMtd: number;
  gstLiability: number;
  payablesDue7d: number;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Injectable()
export class FinanceSnapshotStore {
  constructor(private readonly prisma: PrismaService) {}

  async readFinanceSnapshots(): Promise<FinanceKpiSnapshot[]> {
    const rows = await this.prisma.financeKpiSnapshot.findMany({ orderBy: { date: 'asc' } });
    return rows.map((r) => ({
      date: r.date,
      cashBank: Number(r.cashBank),
      overdueReceivables: Number(r.overdueReceivables),
      revenueMtd: Number(r.revenueMtd),
      gstLiability: Number(r.gstLiability),
      payablesDue7d: Number(r.payablesDue7d),
    }));
  }

  async hasAnySnapshot(): Promise<boolean> {
    const count = await this.prisma.financeKpiSnapshot.count();
    return count > 0;
  }

  async writeFinanceSnapshot(snapshot: FinanceKpiSnapshot): Promise<void> {
    await this.prisma.financeKpiSnapshot.upsert({
      where: { date: snapshot.date },
      create: snapshot,
      update: snapshot,
    });
  }

  async writeFinanceSnapshots(snapshots: FinanceKpiSnapshot[]): Promise<void> {
    for (const s of snapshots) await this.writeFinanceSnapshot(s);
  }

  async getFinanceSparkline(field: keyof Omit<FinanceKpiSnapshot, 'date'>): Promise<SparkPoint[]> {
    const snapshots = await this.readFinanceSnapshots();
    if (!snapshots.length) return [];

    const byMonth = new Map<string, FinanceKpiSnapshot>();
    for (const s of snapshots) {
      byMonth.set(s.date.slice(0, 7), s);
    }

    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([key, s]) => ({
        label: MONTH_LABELS[parseInt(key.slice(5, 7), 10) - 1],
        value: s[field] as number,
      }));
  }
}
