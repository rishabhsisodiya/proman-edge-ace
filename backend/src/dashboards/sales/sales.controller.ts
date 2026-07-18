import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { SalesService } from './sales.service';

// Mirrors PROMAN/backend/src/routes/sales.ts. The original product had a
// single "Sales Head" role; our schema splits this into two successor roles
// (Aggregate / IM-BMH) per BUILD-Role-based Homepages.html — both granted
// access here pending a decision on whether they need separate dashboards.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SALES_HEAD_AGGREGATE', 'SALES_HEAD_IM_BMH')
@Controller('dashboards/sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get('homepage')
  async homepage(@Query('companies') companies?: string) {
    const company = (companies ?? 'PISPL').split(',')[0].trim();
    const data = await this.sales.getSalesHomepage(company);
    return { success: true, data };
  }

  @Get('quotation/:id')
  async quotation(@Param('id') id: string) {
    const data = await this.sales.getQuotationDetail(id);
    return { success: true, data };
  }

  @Post('quotation/:id/extend')
  async extend(@Param('id') id: string, @Body() body: { valid_till?: string; days?: number }) {
    const result = await this.sales.extendQuotation(id, body);
    return { success: true, ...result };
  }

  @Post('quotation/:id/convert')
  async convert(@Param('id') id: string, @Body() body: { delivery_date?: string }) {
    const result = await this.sales.convertToSalesOrder(id, body.delivery_date);
    return { success: true, ...result };
  }

  @Post('quotation/:id/followup')
  async followup(@Param('id') id: string, @Body() body: { message?: string; sendEmail?: boolean }) {
    if (!body.message?.trim()) throw new BadRequestException('message is required');
    const result = await this.sales.logFollowUp(id, body.message.trim(), body.sendEmail !== false);
    return { success: true, data: result };
  }
}
