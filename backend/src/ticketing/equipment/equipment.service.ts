import { Injectable } from '@nestjs/common';
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
    return this.prisma.equipment.findMany({ where, include: { customer: true, site: true } });
  }

  findOne(id: string) {
    return this.prisma.equipment.findUniqueOrThrow({
      where: { id },
      include: { customer: true, site: true, tickets: true, amcContracts: true },
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
}
