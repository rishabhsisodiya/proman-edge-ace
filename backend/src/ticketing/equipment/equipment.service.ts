import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

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
      include: { customer: true, site: true, tickets: true },
    });
  }
}
