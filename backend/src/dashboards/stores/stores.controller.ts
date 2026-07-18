import { Body, Controller, Get, Post, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { StoresService } from './stores.service';

// Mirrors PROMAN/backend/src/routes/stores.ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('STORES_HEAD')
@Controller('dashboards/stores')
export class StoresController {
  constructor(private readonly stores: StoresService) {}

  @Get('homepage')
  async homepage(@Query('fy_start') fyStart?: string, @Query('fy_end') fyEnd?: string) {
    if ((fyStart && !fyEnd) || (!fyStart && fyEnd)) {
      throw new BadRequestException('fy_start and fy_end must be provided together');
    }
    const data = await this.stores.getStoresHomepage(fyStart, fyEnd);
    return { success: true, data };
  }

  @Post('grn/:id/submit')
  async submitGrn(@Param('id') id: string, @Body() body: { action?: string }) {
    const result = await this.stores.submitGrn(id, body.action);
    return { success: true, data: result };
  }

  @Post('material-request')
  async materialRequest(@Body() body: { itemCode?: string; qty?: number; warehouse?: string }) {
    if (!body.itemCode || !body.qty) {
      throw new BadRequestException('itemCode and qty are required');
    }
    const result = await this.stores.createMaterialRequest(body.itemCode, body.qty, body.warehouse);
    return { success: true, data: result };
  }

  @Post('purchase-order-from-mr')
  async purchaseOrderFromMr(@Body() body: { materialRequest?: string; supplier?: string }) {
    if (!body.materialRequest) {
      throw new BadRequestException('materialRequest is required');
    }
    const result = await this.stores.createPoFromMr(body.materialRequest, body.supplier);
    return { success: true, data: result };
  }
}
