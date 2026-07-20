import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Client flagged: 4,500+ real customers means an unfiltered list (or a
   * blank search) can't just return everyone — capped to 20 results, and a
   * blank search returns nothing rather than the first 20 alphabetically
   * (which wouldn't be useful for finding a specific customer anyway).
   */
  list(filters: { region?: string; search?: string }) {
    const where: Prisma.CustomerWhereInput = {};
    if (filters.region) where.region = filters.region as any;
    if (filters.search) where.customerName = { contains: filters.search, mode: 'insensitive' };

    if (!filters.search && !filters.region) return [];

    return this.prisma.customer.findMany({ where, orderBy: { customerName: 'asc' }, take: 20 });
  }

  findOne(id: string) {
    return this.prisma.customer.findUniqueOrThrow({
      where: { id },
      include: { sites: true },
    });
  }

  equipmentFor(id: string) {
    return this.prisma.equipment.findMany({ where: { customerId: id } });
  }
}
