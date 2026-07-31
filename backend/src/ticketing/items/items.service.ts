import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

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
}
