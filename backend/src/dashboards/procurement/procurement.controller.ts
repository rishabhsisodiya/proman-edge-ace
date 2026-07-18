import { Body, Controller, Get, NotFoundException, Param, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { ProcurementService } from './procurement.service';

// Mirrors PROMAN/backend/src/routes/procurement.ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PROCUREMENT_HEAD')
@Controller('dashboards/procurement')
export class ProcurementController {
  constructor(private readonly procurement: ProcurementService) {}

  @Get('homepage')
  async homepage(@Query('fy_start') fyStart?: string, @Query('fy_end') fyEnd?: string) {
    if ((fyStart && !fyEnd) || (!fyStart && fyEnd)) {
      throw new BadRequestException('fy_start and fy_end must be provided together');
    }
    const data = await this.procurement.getProcurementHomepage(fyStart, fyEnd);
    return { success: true, data };
  }

  @Get('po/:id')
  async po(@Param('id') id: string) {
    const detail = await this.procurement.getPODetail(id);
    if (!detail) throw new NotFoundException({ success: false, error: 'Purchase Order not found' });
    return { success: true, data: detail };
  }

  @Post('po/:id/approve')
  async approve(@Param('id') id: string) {
    const result = await this.procurement.approvePO(id);
    return { success: true, data: result };
  }

  @Post('po/:id/return')
  async returnPo(@Param('id') id: string, @Body() body: { reason?: string }) {
    if (!body.reason?.trim()) throw new BadRequestException('reason is required');
    const result = await this.procurement.returnPO(id, body.reason.trim());
    return { success: true, data: result };
  }

  @Post('po/:id/followup')
  async followup(@Param('id') id: string, @Body() body: { comment?: string }) {
    if (!body.comment?.trim()) throw new BadRequestException('comment is required');
    const result = await this.procurement.logFollowUp(id, body.comment);
    return { success: true, data: result };
  }

  @Post('po/:id/grn')
  async grn(@Param('id') id: string) {
    const result = await this.procurement.makeGRN(id);
    return { success: true, data: result };
  }
}
