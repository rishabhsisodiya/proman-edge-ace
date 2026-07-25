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

  findOne(itemCode: string) {
    return this.prisma.item.findUniqueOrThrow({ where: { itemCode }, include: { warehouseStock: true } });
  }
}
