import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const SETTINGS_ID = 1;

/**
 * AMC engine settings (2026-08-03) — currently just the look-ahead window
 * for AmcVisitCron's auto-ticket-creation job, single-row table (same
 * pattern as FinanceSettingsStore). Admin-editable via
 * PATCH /admin/amc-engine-settings.
 */
@Injectable()
export class AmcEngineSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    return this.prisma.amcEngineSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
  }

  async getLookAheadDays(): Promise<number> {
    return (await this.get()).lookAheadDays;
  }

  update(lookAheadDays: number) {
    return this.prisma.amcEngineSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, lookAheadDays },
      update: { lookAheadDays },
    });
  }
}
