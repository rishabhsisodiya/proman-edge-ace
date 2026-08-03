import { BadRequestException, Injectable } from '@nestjs/common';
import { CustomerType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerSyncService } from '../sync/customer-sync.service';
import { EquipmentTrackingSyncService } from '../sync/equipment-tracking-sync.service';

export interface CustomersRequestActor {
  userId: string;
  role: Role;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerSync: CustomerSyncService,
    private readonly equipmentTrackingSync: EquipmentTrackingSyncService,
  ) {}

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
   *
   * Manager is region-scoped (client decision 2026-08-04) — same pattern as
   * TicketsService.list()'s Manager/ASM scoping: looked up here via
   * UserRegion, not passed in by the caller, so no controller can forget to
   * scope it. An unassigned Manager (no UserRegion rows) sees nothing,
   * rather than silently falling back to full visibility. Call Center/ASM/
   * Admin stay unscoped — client only asked for Manager here.
   */
  async browse(
    filters: { region?: string; accountStatus?: string; search?: string; page?: number; pageSize?: number },
    actor: CustomersRequestActor,
  ) {
    const where: Prisma.CustomerWhereInput = {};
    if (actor.role === 'MANAGER') {
      const regions = await this.prisma.userRegion.findMany({ where: { userId: actor.userId } });
      const allowed = regions.map((r) => r.region);
      // Explicit region filter narrows within the Manager's own allowed set
      // rather than overriding it — picking a region they're not scoped to
      // returns nothing, not a scope escape.
      where.region = filters.region ? { in: allowed.filter((r) => r === filters.region) } : { in: allowed };
    } else if (filters.region) {
      where.region = filters.region as any;
    }
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

  /**
   * Manual "Sync from ERP" button on Customer Detail (2026-08-04) — resyncs
   * this one customer (+ its Site Addresses, same call CustomerSyncService's
   * syncOne already makes) and its Equipment Tracking rows, bypassing both
   * syncs' delta watermarks for just this record. Doesn't touch Item/
   * Employee sync — those aren't customer-scoped.
   */
  async syncFromErp(id: string) {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id } });
    if (!customer.erpnextCustomerId) {
      throw new BadRequestException('This customer has no ERPNext Customer ID to sync from.');
    }
    await this.customerSync.manualRetry(customer.erpnextCustomerId);
    await this.equipmentTrackingSync.manualRetryForCustomer(customer.customerName);
    return this.findOne(id);
  }

  /**
   * Admin confirms the real Customer Type from the Detail page (2026-08-04)
   * — ERPNext has no equivalent field, so sync always defaults new customers
   * to DIRECT and flags them for review (see CustomerSyncService.syncOne()).
   * Setting customerTypeConfirmed here stops that specific reason from being
   * re-added on future syncs; needsReview/reviewReason are recomputed from
   * whatever's left (e.g. an unmapped territory can still keep it flagged).
   */
  async setCustomerType(id: string, customerType: CustomerType) {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id } });
    const remainingReasons = (customer.reviewReason ?? '')
      .split(';')
      .map((r) => r.trim())
      .filter((r) => r && !r.startsWith('customerType defaulted'));

    await this.prisma.customer.update({
      where: { id },
      data: {
        customerType,
        customerTypeConfirmed: true,
        needsReview: remainingReasons.length > 0,
        reviewReason: remainingReasons.length > 0 ? remainingReasons.join('; ') : null,
      },
    });
    // Detail page needs the full shape (sites/equipment/tickets/amcContracts),
    // not just the updated Customer row — same reason syncFromErp() above
    // returns findOne(id) instead of the raw update/upsert result.
    return this.findOne(id);
  }
}
