import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Replaces the old file-based store (backend/data/finance_settings.json) —
// same shape/behavior, now backed by the single-row FinanceSettings table
// (id fixed at 1).

export interface EntitySetting {
  default: number;
  byEntity: Record<string, number>;
}

export interface FinanceSettings {
  grossMarginTargetPct: EntitySetting;
}

const SETTINGS_ID = 1;

@Injectable()
export class FinanceSettingsStore {
  constructor(private readonly prisma: PrismaService) {}

  private async row() {
    return this.prisma.financeSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
  }

  async readFinanceSettings(): Promise<FinanceSettings> {
    const row = await this.row();
    return {
      grossMarginTargetPct: {
        default: row.defaultGmTarget,
        byEntity: (row.gmTargetByEntity as Record<string, number>) ?? {},
      },
    };
  }

  async getGmTargetPct(company: string): Promise<number> {
    const s = await this.readFinanceSettings();
    return s.grossMarginTargetPct.byEntity[company] ?? s.grossMarginTargetPct.default;
  }

  async setGmTargetPct(entity: string | null, value: number): Promise<FinanceSettings> {
    const current = await this.readFinanceSettings();
    if (entity === null) {
      await this.prisma.financeSettings.update({ where: { id: SETTINGS_ID }, data: { defaultGmTarget: value } });
    } else {
      const byEntity = { ...current.grossMarginTargetPct.byEntity, [entity]: value };
      await this.prisma.financeSettings.update({
        where: { id: SETTINGS_ID },
        data: { gmTargetByEntity: byEntity as Prisma.InputJsonValue },
      });
    }
    return this.readFinanceSettings();
  }

  async clearGmTargetPctOverride(entity: string): Promise<FinanceSettings> {
    const current = await this.readFinanceSettings();
    const byEntity = { ...current.grossMarginTargetPct.byEntity };
    delete byEntity[entity];
    await this.prisma.financeSettings.update({
      where: { id: SETTINGS_ID },
      data: { gmTargetByEntity: byEntity as Prisma.InputJsonValue },
    });
    return this.readFinanceSettings();
  }
}
