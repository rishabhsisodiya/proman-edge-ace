import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, WarrantyStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEquipmentDto, UpdateEquipmentDto } from './dto/equipment.dto';

const EXPIRING_SOON_DAYS = 45;

/** §7.3: Under Warranty / Expiring Soon (45 days) / Out of Warranty — recomputed nightly, but also set on create/update so it's never left stale between runs. */
function computeWarrantyStatus(warrantyEndDate: Date): WarrantyStatus {
  const daysUntilExpiry = (warrantyEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntilExpiry < 0) return 'OUT_OF_WARRANTY';
  if (daysUntilExpiry <= EXPIRING_SOON_DAYS) return 'EXPIRING_SOON';
  return 'UNDER_WARRANTY';
}

@Injectable()
export class EquipmentService {
  constructor(private readonly prisma: PrismaService) {}

  list(filters: { serialNo?: string; category?: string; customerId?: string }) {
    const where: Prisma.EquipmentWhereInput = {};
    if (filters.serialNo) where.serialNo = { contains: filters.serialNo, mode: 'insensitive' };
    if (filters.category) where.equipmentCategory = filters.category as any;
    if (filters.customerId) where.customerId = filters.customerId;
    return this.prisma.equipment.findMany({
      where,
      include: { customer: true, site: true, possibleDuplicateOf: { select: { id: true, serialNo: true, itemName: true } } },
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

  update(id: string, dto: UpdateEquipmentDto) {
    const warrantyEndDate = new Date(dto.warrantyEndDate);
    return this.prisma.equipment.update({
      where: { id },
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
