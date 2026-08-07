import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DASHBOARD_KEYS, DashboardKey } from './dashboard-registry';

/** Roles relevant to business-dashboard access — excludes the ACE ticketing-only roles (CALL_CENTER, ASM, ENGINEER, MANAGER, CS_SUPPORT), which have nothing to do with these dashboards. ADMIN is excluded too since it's a universal bypass, never gated by this table. */
const RELEVANT_ROLES: Role[] = [
  'MD',
  'SALES_HEAD_AGGREGATE',
  'SALES_HEAD_IM_BMH',
  'ENGINEERING_DESIGN_HEAD',
  'MANUFACTURING_HEAD',
  'PROCUREMENT_HEAD',
  'STORES_HEAD',
  'QMS_HEAD',
  'DISPATCH_HEAD',
  'SERVICE_AFTERSALES_HEAD',
  'FINANCE_HEAD',
];

/**
 * Seeded defaults (2026-08-07) — matches what was previously hardcoded in
 * each dashboard controller's @Roles() decorator. MD gets no default access
 * (client request) — Admin grants it explicitly if needed. Dashboards with
 * no corresponding head role yet (none currently) default every role to
 * false until Admin configures them.
 */
const DEFAULT_ENABLED: Record<DashboardKey, Role[]> = {
  SALES: ['SALES_HEAD_AGGREGATE', 'SALES_HEAD_IM_BMH'],
  DISPATCH: ['DISPATCH_HEAD'],
  STORES: ['STORES_HEAD'],
  MANUFACTURING: ['MANUFACTURING_HEAD'],
  PROCUREMENT: ['PROCUREMENT_HEAD'],
  FINANCE: ['FINANCE_HEAD'],
};

@Injectable()
export class DashboardAccessService {
  constructor(private readonly prisma: PrismaService) {}

  // In-memory cache — dashboard pages fire many API calls per load (each
  // widget is its own endpoint), so checking Postgres on every single one
  // adds real overhead. Invalidated on every write via setEnabled().
  private cache: Map<string, boolean> | null = null;

  private cacheKey(role: Role, dashboardKey: string) {
    return `${role}__${dashboardKey}`;
  }

  /** Self-healing seed — creates any missing (role, dashboardKey) row with its default `enabled`, so first-time deploys and a newly-added dashboard both work correctly even before Admin has opened this settings screen. */
  private async ensureSeeded() {
    const existing = await this.prisma.dashboardAccessRule.findMany();
    const existingKeys = new Set(existing.map((r) => this.cacheKey(r.role, r.dashboardKey)));
    const missing: { role: Role; dashboardKey: string; enabled: boolean }[] = [];
    for (const dashboardKey of DASHBOARD_KEYS) {
      for (const role of RELEVANT_ROLES) {
        if (!existingKeys.has(this.cacheKey(role, dashboardKey))) {
          missing.push({ role, dashboardKey, enabled: DEFAULT_ENABLED[dashboardKey].includes(role) });
        }
      }
    }
    if (missing.length > 0) {
      await this.prisma.dashboardAccessRule.createMany({ data: missing });
    }
  }

  private async loadCache(): Promise<Map<string, boolean>> {
    if (this.cache) return this.cache;
    await this.ensureSeeded();
    const rows = await this.prisma.dashboardAccessRule.findMany();
    const cache = new Map<string, boolean>();
    for (const r of rows) cache.set(this.cacheKey(r.role, r.dashboardKey), r.enabled);
    this.cache = cache;
    return cache;
  }

  async list() {
    await this.ensureSeeded();
    return this.prisma.dashboardAccessRule.findMany({ orderBy: [{ dashboardKey: 'asc' }, { role: 'asc' }] });
  }

  async setEnabled(role: Role, dashboardKey: string, enabled: boolean) {
    const result = await this.prisma.dashboardAccessRule.upsert({
      where: { role_dashboardKey: { role, dashboardKey } },
      create: { role, dashboardKey, enabled },
      update: { enabled },
    });
    this.cache = null; // invalidate — next read rebuilds from DB
    return result;
  }

  /** Used by DashboardAccessGuard — ADMIN bypass is handled in the guard itself, not here. */
  async isAllowed(role: Role, dashboardKey: string): Promise<boolean> {
    const cache = await this.loadCache();
    return cache.get(this.cacheKey(role, dashboardKey)) ?? false;
  }
}
