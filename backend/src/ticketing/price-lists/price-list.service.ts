import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ErpDbService } from '../../erp/erp-db.service';

interface ErpPriceListRow {
  price_list: string;
  price_list_name: string;
  selling: number;
  buying: number;
  enabled: number;
  currency: string;
}

// Fake demo-data price lists to always exclude (Shivam handoff §B, 2026-08-05)
// — "Test price"/"Test buying" are dummy random rates loaded on the demo
// box, not real pricing.
const FAKE_PRICE_LISTS = ['Test price', 'Test buying'];

@Injectable()
export class PriceListService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly erpDb: ErpDbService,
  ) {}

  /**
   * Live fetch of real ERPNext selling price lists (client request,
   * 2026-08-05 — "Admin will get the list and select it instead of typing
   * the exact name"). Live, not synced/cached — this is just a dropdown
   * population call, no need to persist ERPNext's own list locally; the
   * existing nightly Item Price rate sync (item-sync.service.ts) already
   * picks up rates for whatever price list name Admin actually saves via
   * create() below. Selling lists only (buying lists like "Standard
   * Buying" aren't relevant to Quotation/FSV rates), enabled only, fake
   * Test lists excluded.
   */
  async fetchErpSellingPriceLists(): Promise<{ name: string; currency: string }[]> {
    const rows = await this.erpDb.query<ErpPriceListRow>(
      `SELECT name AS price_list, price_list_name, selling, buying, enabled, currency
       FROM \`tabPrice List\`
       WHERE enabled = 1 AND selling = 1
       ORDER BY name`,
    );
    return rows.filter((r) => !FAKE_PRICE_LISTS.includes(r.price_list)).map((r) => ({ name: r.price_list, currency: r.currency }));
  }

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
