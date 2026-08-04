import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * FSD §7.4 Predictive maintenance rules — per-equipment-category thresholds
 * (Admin-configurable, 2026-07-31; previously would have been hardcoded
 * constants). Only 8 rows ever exist (one per EquipCategory), seeded via
 * migration — no create/delete, just update.
 */
@Injectable()
export class PredictiveRuleService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.predictiveRuleConfig.findMany({ orderBy: { equipmentCategory: 'asc' } });
  }

  update(
    id: string,
    monthsSinceService: number,
    operatingHoursInterval: number,
    breakdownFrequencyThreshold: number,
    breakdownFrequencyWindowMonths: number,
    warrantyPmIntervalMonths: number,
  ) {
    return this.prisma.predictiveRuleConfig.update({
      where: { id },
      data: {
        monthsSinceService,
        operatingHoursInterval,
        breakdownFrequencyThreshold,
        breakdownFrequencyWindowMonths,
        warrantyPmIntervalMonths,
      },
    });
  }

  /** Warranty PM ticket-creation look-ahead (2026-08-04) — single-row settings, same pattern as AmcEngineSettings/EngineerUtilizationSettings. */
  async getWarrantyPmLookAheadDays(): Promise<number> {
    const row = await this.prisma.warrantyPmEngineSettings.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    return row.lookAheadDays;
  }

  setWarrantyPmLookAheadDays(lookAheadDays: number) {
    return this.prisma.warrantyPmEngineSettings.upsert({
      where: { id: 1 },
      create: { id: 1, lookAheadDays },
      update: { lookAheadDays },
    });
  }
}
