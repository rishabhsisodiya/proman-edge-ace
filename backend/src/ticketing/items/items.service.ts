import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ItemSyncService } from '../sync/item-sync.service';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly itemSync: ItemSyncService,
  ) {}

  async list(search?: string, priceListName?: string) {
    const items = await this.prisma.item.findMany({
      where: search
        ? {
            OR: [
              { itemName: { contains: search, mode: 'insensitive' } },
              { itemCode: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      take: 100,
    });
    if (!priceListName) return items.map((i) => ({ ...i, rate: null as number | null }));

    const rates = await this.prisma.itemPriceListRate.findMany({
      where: { priceListName, itemCode: { in: items.map((i) => i.itemCode) } },
    });
    const rateByItem = new Map(rates.map((r) => [r.itemCode, Number(r.rate)]));
    return items.map((i) => ({ ...i, rate: rateByItem.get(i.itemCode) ?? null }));
  }

  /** Item catalog List page (paginated) — separate from list() above, which backs the FSV/Quotation item-picker combobox and stays capped/unpaginated for that use case. */
  async browse(filters: { search?: string; itemGroup?: string; page?: number; pageSize?: number }) {
    const where: Prisma.ItemWhereInput = {};
    if (filters.itemGroup) where.itemGroup = filters.itemGroup;
    if (filters.search) {
      where.OR = [
        { itemName: { contains: filters.search, mode: 'insensitive' } },
        { itemCode: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 20));

    const [items, total] = await Promise.all([
      this.prisma.item.findMany({ where, orderBy: { itemName: 'asc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.item.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /**
   * Used by FSV's "Add Part" item picker. FSV now has its own per-line
   * price-list selector (2026-07-31, matching Quotation's) — pass
   * priceListName to rate against that; falls back to whichever
   * SellingPriceList Admin marked default if omitted.
   */
  async findOne(itemCode: string, priceListName?: string) {
    const item = await this.prisma.item.findUniqueOrThrow({ where: { itemCode }, include: { warehouseStock: true } });
    const resolvedPriceListName =
      priceListName ?? (await this.prisma.sellingPriceList.findFirst({ where: { isDefault: true, isActive: true } }))?.name;
    const priceRate = resolvedPriceListName
      ? await this.prisma.itemPriceListRate.findUnique({
          where: { itemCode_priceListName: { itemCode, priceListName: resolvedPriceListName } },
        })
      : null;
    return { ...item, sellingRate: priceRate ? Number(priceRate.rate) : null };
  }

  /** "Sync from ERP" button on Item Detail — resyncs this item, its warehouse stock, and its price-list rates. */
  async syncFromErp(itemCode: string, priceListName?: string) {
    await this.itemSync.manualRetry(itemCode);
    return this.findOne(itemCode, priceListName);
  }

  /**
   * Fallback warehouse list for FSV's "Add Part" flow (client-reported bug,
   * 2026-08-04) — when an item has no ItemWarehouseStock rows of its own,
   * the warehouse field previously degraded to free text with nothing to
   * pick from. This is every distinct warehouse already synced from
   * ERPNext across all items, not a separate ERPNext Warehouse-doctype
   * sync — the data already exists here (~320 warehouses, confirmed
   * against the dev DB), no new sync needed.
   */
  async listAllWarehouses() {
    const rows = await this.prisma.itemWarehouseStock.findMany({
      distinct: ['warehouse'],
      select: { warehouse: true },
      orderBy: { warehouse: 'asc' },
    });
    return rows.map((r) => r.warehouse);
  }
}
