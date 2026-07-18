import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { SparkPoint } from './procurement.types';

// Replaces the old file-based store (backend/data/procurement_kpi_snapshots.json)
// — same logic, now backed by the ProcurementKpiSnapshot table. Written daily
// by ProcurementSnapshotCron (see procurement-snapshot.cron.ts).

export interface ProcurementKpiSnapshot {
  date: string;
  prsPending: number;
  openPOs: number;
  overduePOs: number;
  criticalStock: number;
  spendMtd: number;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

@Injectable()
export class ProcurementSnapshotStore {
  constructor(private readonly prisma: PrismaService) {}

  async readProcurementSnapshots(): Promise<ProcurementKpiSnapshot[]> {
    const rows = await this.prisma.procurementKpiSnapshot.findMany({ orderBy: { date: 'asc' } });
    return rows.map((r) => ({
      date: r.date,
      prsPending: r.prsPending,
      openPOs: r.openPOs,
      overduePOs: r.overduePOs,
      criticalStock: r.criticalStock,
      spendMtd: Number(r.spendMtd),
    }));
  }

  async hasAnySnapshot(): Promise<boolean> {
    const count = await this.prisma.procurementKpiSnapshot.count();
    return count > 0;
  }

  async writeProcurementSnapshot(snapshot: ProcurementKpiSnapshot): Promise<void> {
    await this.prisma.procurementKpiSnapshot.upsert({
      where: { date: snapshot.date },
      create: snapshot,
      update: snapshot,
    });
  }

  async getProcurementSparkline(field: keyof Omit<ProcurementKpiSnapshot, 'date'>): Promise<SparkPoint[]> {
    const snapshots = await this.readProcurementSnapshots();
    if (!snapshots.length) return [];

    const byMonth = new Map<string, ProcurementKpiSnapshot>();
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
