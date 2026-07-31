import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, WarrantyStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEquipmentDto, UpdateEquipmentDto } from './dto/equipment.dto';

export const EXPIRING_SOON_DAYS = 45;

/** §7.3 rule 12: Under Warranty / Expiring Soon (45 days) / Out of Warranty —
 * recomputed nightly by WarrantyEngineCron (2026-07-31 — was set on create/
 * update only, never recomputed on a schedule, so a record left untouched
 * for months would show a stale status), also set on create/update so it's
 * never left stale between nightly runs either. */
export function computeWarrantyStatus(warrantyEndDate: Date): WarrantyStatus {
  const daysUntilExpiry = (warrantyEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntilExpiry < 0) return 'OUT_OF_WARRANTY';
  if (daysUntilExpiry <= EXPIRING_SOON_DAYS) return 'EXPIRING_SOON';
  return 'UNDER_WARRANTY';
}

@Injectable()
export class EquipmentService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Paginated + broadened search (2026-07-30 — was an unbounded `findMany`,
   * fine while there were a handful of manually-entered records, not once
   * this became the primary onboarding path per its own doc comment above).
   * `search` matches serial no, item name, or customer name — `serialNo`
   * kept as a separate, narrower filter for any caller that wants exact
   * serial-only matching. Same {data,total,page,pageSize} shape as
   * TicketsService.list(), same 25-default/500-cap.
   */
  list(filters: { search?: string; serialNo?: string; category?: string; customerId?: string; page?: string; pageSize?: string }) {
    const where: Prisma.EquipmentWhereInput = {};
    if (filters.serialNo) where.serialNo = { contains: filters.serialNo, mode: 'insensitive' };
    if (filters.category) where.equipmentCategory = filters.category as any;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.search) {
      where.OR = [
        { serialNo: { contains: filters.search, mode: 'insensitive' } },
        { itemName: { contains: filters.search, mode: 'insensitive' } },
        { customer: { customerName: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    const page = Math.max(1, parseInt(filters.page ?? '1', 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(filters.pageSize ?? '25', 10) || 25));

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.equipment.findMany({
          where,
          include: { customer: true, site: true, possibleDuplicateOf: { select: { id: true, serialNo: true, itemName: true } } },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.equipment.count({ where }),
      ]);
      return { data, total, page, pageSize };
    });
  }

  findOne(id: string) {
    return this.prisma.equipment.findUniqueOrThrow({
      where: { id },
      include: {
        customer: true,
        site: true,
        tickets: true,
        amcContracts: true,
        possibleDuplicateOf: { select: { id: true, serialNo: true, itemName: true } },
      },
    });
  }

  create(dto: CreateEquipmentDto) {
    const warrantyEndDate = new Date(dto.warrantyEndDate);
    return this.prisma.equipment.create({
      data: {
        serialNo: dto.serialNo,
        itemCode: dto.itemCode,
        itemName: dto.itemName,
        equipmentCategory: dto.equipmentCategory,
        modelNumber: dto.modelNumber,
        customerId: dto.customerId,
        siteId: dto.siteId,
        gpsLat: dto.gpsLat,
        gpsLong: dto.gpsLong,
        installationDate: new Date(dto.installationDate),
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
        warrantyStartDate: new Date(dto.warrantyStartDate),
        warrantyEndDate,
        warrantyPeriodMonths: dto.warrantyPeriodMonths,
        warrantyStatus: computeWarrantyStatus(warrantyEndDate),
        operatingHoursMeter: dto.operatingHoursMeter,
        status: dto.status,
        skillTagsRequired: dto.skillTagsRequired ?? [],
        notes: dto.notes,
        amcContracts: dto.amcContractIds ? { connect: dto.amcContractIds.map((id) => ({ id })) } : undefined,
      },
      include: { customer: true, site: true, amcContracts: true },
    });
  }

  async update(id: string, dto: UpdateEquipmentDto) {
    const existing = await this.prisma.equipment.findUniqueOrThrow({ where: { id } });
    const warrantyEndDate = new Date(dto.warrantyEndDate);
    // Warranty renewed/extended — let a future expiry cycle fire its own
    // 45-day outreach ticket again (FSD §7.3 rule 15).
    const renewed = warrantyEndDate.getTime() > existing.warrantyEndDate.getTime();

    return this.prisma.equipment.update({
      where: { id },
      data: {
        warrantyOutreachSentAt: renewed ? null : undefined,
        serialNo: dto.serialNo,
        itemCode: dto.itemCode,
        itemName: dto.itemName,
        equipmentCategory: dto.equipmentCategory,
        modelNumber: dto.modelNumber,
        customerId: dto.customerId,
        siteId: dto.siteId,
        gpsLat: dto.gpsLat,
        gpsLong: dto.gpsLong,
        installationDate: new Date(dto.installationDate),
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
        warrantyStartDate: new Date(dto.warrantyStartDate),
        warrantyEndDate,
        warrantyPeriodMonths: dto.warrantyPeriodMonths,
        warrantyStatus: computeWarrantyStatus(warrantyEndDate),
        operatingHoursMeter: dto.operatingHoursMeter,
        status: dto.status,
        skillTagsRequired: dto.skillTagsRequired ?? [],
        notes: dto.notes,
        amcContracts: dto.amcContractIds ? { set: dto.amcContractIds.map((id) => ({ id })) } : undefined,
      },
      include: { customer: true, site: true, amcContracts: true },
    });
  }

  /**
   * Equipment Tracking sync duplicate flag (2026-07-30, mirrors
   * TicketsService.resolveDuplicate exactly). "Merge" copies the
   * ERP-sourced fields (warranty dates/months/status, delivery date,
   * quantity, tracking status, and model number only if the original
   * doesn't already have one) onto the original record, then deletes this
   * one — safe because a newly-synced row can't have accumulated any
   * Ticket/AmcContract references yet. "Dismiss" just clears the flag,
   * confirming they're genuinely different physical units.
   */
  async resolveDuplicate(id: string, action: 'MERGE' | 'DISMISS') {
    const equipment = await this.prisma.equipment.findUniqueOrThrow({
      where: { id },
      include: { possibleDuplicateOf: true },
    });
    if (!equipment.possibleDuplicateOfId || !equipment.possibleDuplicateOf) {
      throw new BadRequestException('This equipment record has no unresolved duplicate flag');
    }
    if (equipment.duplicateFlagResolved) {
      throw new BadRequestException('This duplicate flag has already been resolved');
    }

    if (action === 'MERGE') {
      const original = equipment.possibleDuplicateOf;
      await this.prisma.$transaction([
        this.prisma.equipment.update({
          where: { id: original.id },
          data: {
            warrantyStartDate: equipment.warrantyStartDate,
            warrantyEndDate: equipment.warrantyEndDate,
            warrantyPeriodMonths: equipment.warrantyPeriodMonths,
            warrantyStatus: equipment.warrantyStatus,
            deliveryDate: equipment.deliveryDate,
            quantity: equipment.quantity,
            erpTrackingStatus: equipment.erpTrackingStatus,
            modelNumber: original.modelNumber ?? equipment.modelNumber,
          },
        }),
        this.prisma.equipment.delete({ where: { id } }),
      ]);
      return this.prisma.equipment.findUniqueOrThrow({ where: { id: original.id } });
    }

    return this.prisma.equipment.update({ where: { id }, data: { duplicateFlagResolved: true } });
  }
}
