import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BillingRateService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.billingRate.findMany({ orderBy: { level: 'asc' } });
  }

  async create(level: string, hourlyRate: number) {
    const existing = await this.prisma.billingRate.findUnique({ where: { level } });
    if (existing) throw new ConflictException('A rate for this engineer level already exists');
    return this.prisma.billingRate.create({ data: { level, hourlyRate } });
  }

  update(id: string, hourlyRate: number) {
    return this.prisma.billingRate.update({ where: { id }, data: { hourlyRate } });
  }

  remove(id: string) {
    return this.prisma.billingRate.delete({ where: { id } });
  }

  /** Used by ticket close's labour billing — null if the engineer's level has no configured rate yet. */
  async rateForLevel(level: string | null): Promise<number | null> {
    if (!level) return null;
    const rate = await this.prisma.billingRate.findUnique({ where: { level } });
    return rate ? Number(rate.hourlyRate) : null;
  }

  /** §6.2 Engineer Utilization KPI's "configurable work_hours_per_day" — used by both the Engineer Performance Report and the KPI Matrix. */
  async getUtilizationHoursPerDay(): Promise<number> {
    const row = await this.prisma.engineerUtilizationSettings.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
    });
    return row.hoursPerDay;
  }

  async setUtilizationHoursPerDay(hoursPerDay: number) {
    return this.prisma.engineerUtilizationSettings.upsert({
      where: { id: 1 },
      create: { id: 1, hoursPerDay },
      update: { hoursPerDay },
    });
  }
}
