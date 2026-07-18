import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ItemsService } from './items.service';

@UseGuards(JwtAuthGuard)
@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  list(@Query('search') search?: string) {
    return this.items.list(search);
  }

  @Get(':itemCode')
  findOne(@Param('itemCode') itemCode: string) {
    return this.items.findOne(itemCode);
  }
}
