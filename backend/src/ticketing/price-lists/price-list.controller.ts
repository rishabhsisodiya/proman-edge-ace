import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { PriceListService } from './price-list.service';
import { CreatePriceListDto, UpdatePriceListDto } from './dto/price-list.dto';

// GET is open to any authenticated ticketing role (Quotation creation form
// dropdown needs it) — only create/update/remove are Admin-only.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/price-lists')
export class PriceListController {
  constructor(private readonly priceLists: PriceListService) {}

  @Get()
  list() {
    return this.priceLists.list();
  }

  // Static route — must stay above nothing here (no `:id` GET exists), but
  // kept as its own clearly-named endpoint regardless for the same reason
  // other admin screens keep ERP-sourced lookups separate from the local
  // CRUD list.
  @Roles('ADMIN')
  @Get('erp-options')
  fetchErpOptions() {
    return this.priceLists.fetchErpSellingPriceLists();
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreatePriceListDto) {
    return this.priceLists.create(dto.name, dto.isDefault);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePriceListDto) {
    return this.priceLists.update(id, dto);
  }

  @Roles('ADMIN')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.priceLists.remove(id);
  }
}
