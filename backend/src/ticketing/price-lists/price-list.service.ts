import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PriceListService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.sellingPriceList.findMany({ orderBy: { name: 'asc' } });
  }

  async create(name: string, isDefault?: boolean) {
    const existing = await this.prisma.sellingPriceList.findUnique({ where: { name } });
    if (existing) throw new ConflictException('A price list with this name already exists');
    if (isDefault) await this.prisma.sellingPriceList.updateMany({ data: { isDefault: false } });
    return this.prisma.sellingPriceList.create({ data: { name, isDefault: !!isDefault } });
  }

  async update(id: string, dto: { isDefault?: boolean; isActive?: boolean }) {
    if (dto.isDefault) await this.prisma.sellingPriceList.updateMany({ data: { isDefault: false } });
    return this.prisma.sellingPriceList.update({ where: { id }, data: dto });
  }

  remove(id: string) {
    return this.prisma.sellingPriceList.delete({ where: { id } });
  }

  /** Used by Quotation creation when no priceListName is explicitly picked. */
  async defaultName(): Promise<string | null> {
    const found = await this.prisma.sellingPriceList.findFirst({ where: { isDefault: true, isActive: true } });
    return found?.name ?? null;
  }
}
