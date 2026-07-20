import { Injectable, ConflictException } from '@nestjs/common';
import { Region } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Admin-maintained mapping from ERPNext's territory field (state-level,
 * ~33 messy values e.g. "Tamilnadu" vs "Tamil Nadu") onto the app's 6-value
 * Region enum. Read by the nightly Customer Sync job (§5.1) to resolve
 * Customer.region — never synced from ERPNext itself, since ERPNext has no
 * concept of this app's Region enum.
 */
@Injectable()
export class RegionMappingService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.regionMapping.findMany({ orderBy: { erpTerritory: 'asc' } });
  }

  async create(erpTerritory: string, region: Region) {
    const existing = await this.prisma.regionMapping.findUnique({ where: { erpTerritory } });
    if (existing) throw new ConflictException('A mapping for this territory already exists');
    return this.prisma.regionMapping.create({ data: { erpTerritory, region } });
  }

  update(id: string, region: Region) {
    return this.prisma.regionMapping.update({ where: { id }, data: { region } });
  }

  remove(id: string) {
    return this.prisma.regionMapping.delete({ where: { id } });
  }

  /** Used by the Customer Sync job — not exposed via the controller. */
  async resolve(erpTerritory: string): Promise<Region | null> {
    const mapping = await this.prisma.regionMapping.findUnique({ where: { erpTerritory } });
    return mapping?.region ?? null;
  }
}
