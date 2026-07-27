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
   * Used by FSV's "Add Part" item picker, which — unlike the Quotation
   * picker — has no per-line price-list selection of its own, so this
   * auto-fills the selling rate from whichever SellingPriceList Admin
   * marked default (same fix as the Quotation item search's rate join,
   * 2026-07-25 — FSV parts had the identical "rate never comes through" gap).
   */
  async findOne(itemCode: string) {
    const item = await this.prisma.item.findUniqueOrThrow({ where: { itemCode }, include: { warehouseStock: true } });
    const defaultPriceList = await this.prisma.sellingPriceList.findFirst({ where: { isDefault: true, isActive: true } });
    const priceRate = defaultPriceList
      ? await this.prisma.itemPriceListRate.findUnique({
          where: { itemCode_priceListName: { itemCode, priceListName: defaultPriceList.name } },
        })
      : null;
    return { ...item, sellingRate: priceRate ? Number(priceRate.rate) : null };
  }
}
