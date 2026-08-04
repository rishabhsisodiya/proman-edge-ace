import { Injectable } from '@nestjs/common';
import { Role, SlaBreachType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Roles relevant to SLA breach notifications — excludes the Proman Edge dashboard-only roles (Sales Head, Manufacturing Head, etc.), which have nothing to do with ticket SLAs. */
const RELEVANT_ROLES: Role[] = ['CALL_CENTER', 'ASM', 'ENGINEER', 'MANAGER', 'ADMIN', 'CS_SUPPORT', 'MD'];

/** Seeded defaults — matches what was previously hardcoded in SlaBreachCron, plus MD (client request, 2026-08-04). */
const DEFAULT_ENABLED: Record<SlaBreachType, Role[]> = {
  RESPONSE: ['ASM', 'CALL_CENTER', 'MANAGER', 'MD'],
  RESOLUTION: ['ASM', 'MANAGER', 'MD'],
};

@Injectable()
export class SlaNotificationRuleService {
  constructor(private readonly prisma: PrismaService) {}

  /** Self-healing seed — creates any missing (breachType, role) row with its default `enabled`, so first-time deploys and the cron both work correctly even before Admin has ever opened this settings screen. */
  private async ensureSeeded() {
    const existing = await this.prisma.slaNotificationRule.findMany();
    const existingKeys = new Set(existing.map((r) => `${r.breachType}__${r.role}`));
    const missing: { breachType: SlaBreachType; role: Role; enabled: boolean }[] = [];
    for (const breachType of ['RESPONSE', 'RESOLUTION'] as SlaBreachType[]) {
      for (const role of RELEVANT_ROLES) {
        if (!existingKeys.has(`${breachType}__${role}`)) {
          missing.push({ breachType, role, enabled: DEFAULT_ENABLED[breachType].includes(role) });
        }
      }
    }
    if (missing.length > 0) {
      await this.prisma.slaNotificationRule.createMany({ data: missing });
    }
  }

  async list() {
    await this.ensureSeeded();
    return this.prisma.slaNotificationRule.findMany({ orderBy: [{ breachType: 'asc' }, { role: 'asc' }] });
  }

  async setEnabled(breachType: SlaBreachType, role: Role, enabled: boolean) {
    return this.prisma.slaNotificationRule.upsert({
      where: { breachType_role: { breachType, role } },
      create: { breachType, role, enabled },
      update: { enabled },
    });
  }

  /** Used by SlaBreachCron to resolve which roles get notified for a given breach type. */
  async getEnabledRoles(breachType: SlaBreachType): Promise<Role[]> {
    await this.ensureSeeded();
    const rows = await this.prisma.slaNotificationRule.findMany({ where: { breachType, enabled: true } });
    return rows.map((r) => r.role);
  }
}
