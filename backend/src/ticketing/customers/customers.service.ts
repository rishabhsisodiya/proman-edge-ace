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

  /**
   * §10.1 W-17 Customer List (Call Center/ASM/Manager) — paginated browse of
   * every customer alphabetically by default (client decision 2026-08-04:
   * a real "List" screen should show something on load, not require typing
   * first); search/region just narrow the same paginated result set.
   */
  async browse(filters: { region?: string; accountStatus?: string; search?: string; page?: number; pageSize?: number }) {
    const where: Prisma.CustomerWhereInput = {};
    if (filters.region) where.region = filters.region as any;
    if (filters.accountStatus) where.accountStatus = filters.accountStatus as any;
    if (filters.search) where.customerName = { contains: filters.search, mode: 'insensitive' };

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 20));

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({ where, orderBy: { customerName: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /** §10.1 W-18 Customer Detail — customer fields, site addresses, equipment list, ticket history, AMC list. */
  async findOne(id: string) {
    const customer = await this.prisma.customer.findUniqueOrThrow({
      where: { id },
      include: { sites: true, equipment: true },
    });
    const [tickets, amcContracts] = await Promise.all([
      this.prisma.ticket.findMany({
        where: { customerId: id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, ticketNo: true, status: true, serviceType: true, priority: true, createdAt: true, closedAt: true },
      }),
      this.prisma.amcContract.findMany({ where: { customerId: id }, orderBy: { startDate: 'desc' } }),
    ]);
    return { ...customer, tickets, amcContracts };
  }

  equipmentFor(id: string) {
    return this.prisma.equipment.findMany({ where: { customerId: id } });
  }
}
