import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Service Types Tier 1 (2026-08-02, client-agreed scope) — Admin CRUD for
 * `ServiceTypeConfig`. No hard delete: system-managed rows (AMC, Warranty
 * Renewal Outreach) and any row already referenced by real tickets must stay
 * addressable, so "remove" is always `isActive: false` (hides it from the
 * ticket-creation dropdown, keeps it valid for existing tickets that already
 * have it set).
 */
@Injectable()
export class ServiceTypeConfigService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.serviceTypeConfig.findMany({ orderBy: { code: 'asc' } });
  }

  /** Active-only list, for the ticket-creation dropdown and any other selectable-list use. */
  listActive() {
    return this.prisma.serviceTypeConfig.findMany({ where: { isActive: true }, orderBy: { label: 'asc' } });
  }

  async create(code: string, label: string) {
    const existing = await this.prisma.serviceTypeConfig.findUnique({ where: { code } });
    if (existing) throw new ConflictException(`Service type "${code}" already exists`);
    return this.prisma.serviceTypeConfig.create({ data: { code, label } });
  }

  update(code: string, label: string | undefined, isActive: boolean | undefined) {
    return this.prisma.serviceTypeConfig.update({ where: { code }, data: { label, isActive } });
  }

  /** Used by TicketsService to validate a serviceType value at creation/update, replacing the old `Object.values(ServiceType).includes(...)` enum check. */
  async isValidActiveCode(code: string): Promise<boolean> {
    const row = await this.prisma.serviceTypeConfig.findUnique({ where: { code } });
    return !!row?.isActive;
  }
}
