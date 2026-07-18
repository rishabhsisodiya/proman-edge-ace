import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KpiTrend } from './manufacturing.types';

// Replaces the old file-based store (backend/data/kpi_snapshots.json) — same
// logic, now backed by the ManufacturingKpiSnapshot table. Written daily by
// ManufacturingSnapshotCron (see manufacturing-snapshot.cron.ts).

export interface KpiSnapshot {
  date: string; // YYYY-MM-DD
  activeWOs: number;
  completedToday: number;
  delayed: number;
  atRisk: number;
  onHold: number;
}

// dir and colour semantics differ per card:
// active: up=good(green), down=neutral, completed: up=good, delayed/atRisk/onHold: up=bad(red)
type CardKey = 'activeWOs' | 'completedToday' | 'delayed' | 'atRisk' | 'onHold';

const TREND_LABELS: Record<CardKey, string> = {
  activeWOs: 'vs yesterday',
  completedToday: 'vs yesterday',
  delayed: 'needs action',
  atRisk: 'monitor',
  onHold: 'active holds',
};

@Injectable()
export class ManufacturingSnapshotStore {
  constructor(private readonly prisma: PrismaService) {}

  async writeSnapshot(snapshot: KpiSnapshot): Promise<void> {
    await this.prisma.manufacturingKpiSnapshot.upsert({
      where: { date: snapshot.date },
      create: snapshot,
      update: snapshot,
    });
  }

  async hasAnySnapshot(): Promise<boolean> {
    const count = await this.prisma.manufacturingKpiSnapshot.count();
    return count > 0;
  }

  async getYesterdaySnapshot(): Promise<KpiSnapshot | null> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);
    return this.prisma.manufacturingKpiSnapshot.findUnique({ where: { date: dateStr } });
  }

  computeTrend(todayVal: number, yesterdayVal: number, card: CardKey): KpiTrend {
    const diff = todayVal - yesterdayVal;
    const absDiff = Math.abs(diff);
    const label = TREND_LABELS[card];

    if (diff === 0) {
      return { dir: 'neutral', delta: `– 0`, label };
    }

    const isIncreaseBad = card === 'delayed' || card === 'atRisk' || card === 'onHold';

    if (diff > 0) {
      return {
        dir: isIncreaseBad ? 'down' : 'up',
        delta: `▲ ${absDiff}`,
        label,
      };
    } else {
      return {
        dir: isIncreaseBad ? 'up' : 'down',
        delta: `▼ ${absDiff}`,
        label,
      };
    }
  }
}
