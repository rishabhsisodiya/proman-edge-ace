import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  list(filters: { region?: string; search?: string }) {
    const where: Prisma.CustomerWhereInput = {};
    if (filters.region) where.region = filters.region as any;
    if (filters.search) where.customerName = { contains: filters.search, mode: 'insensitive' };
    return this.prisma.customer.findMany({ where, orderBy: { customerName: 'asc' } });
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
