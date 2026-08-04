import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ItemsService } from './items.service';

@UseGuards(JwtAuthGuard)
@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  list(@Query('search') search?: string, @Query('priceListName') priceListName?: string) {
    return this.items.list(search, priceListName);
  }

  /** Static route — must stay above `:itemCode` or Nest would try to resolve "browse" as an item code. */
  @Get('browse')
  browse(@Query() filters: { search?: string; itemGroup?: string; page?: string; pageSize?: string }) {
    return this.items.browse({
      search: filters.search,
      itemGroup: filters.itemGroup,
      page: filters.page ? Number(filters.page) : undefined,
      pageSize: filters.pageSize ? Number(filters.pageSize) : undefined,
    });
  }

  /** Static route — must stay above `:itemCode`. Fallback list for FSV's warehouse field when an item has no stock rows of its own. */
  @Get('warehouses')
  listAllWarehouses() {
    return this.items.listAllWarehouses();
  }

  @Get(':itemCode')
  findOne(@Param('itemCode') itemCode: string, @Query('priceListName') priceListName?: string) {
    return this.items.findOne(itemCode, priceListName);
  }

  /** "Sync from ERP" button on Item Detail — resyncs this item, its warehouse stock, and its price-list rates. */
  @Post(':itemCode/sync')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'ADMIN')
  syncFromErp(@Param('itemCode') itemCode: string, @Query('priceListName') priceListName?: string) {
    return this.items.syncFromErp(itemCode, priceListName);
  }
}
