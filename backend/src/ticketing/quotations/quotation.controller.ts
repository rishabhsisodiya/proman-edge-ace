import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { QuotationService } from './quotation.service';
import { AddQuotationItemDto, CreateQuotationDto, UpdateDeliveryDto, UpdateQuotationDto } from './dto/quotation.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class QuotationController {
  constructor(private readonly quotations: QuotationService) {}

  @Get('tickets/:ticketId/quotations')
  listForTicket(@Param('ticketId') ticketId: string) {
    return this.quotations.listForTicket(ticketId);
  }

  @Get('tickets/:ticketId/chargeable')
  isChargeable(@Param('ticketId') ticketId: string) {
    return this.quotations.getChargeability(ticketId);
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER')
  @Post('tickets/:ticketId/quotation')
  create(@Param('ticketId') ticketId: string, @Body() dto: CreateQuotationDto, @Req() req: any) {
    return this.quotations.create(ticketId, dto, { userId: req.user.userId, role: req.user.role });
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER')
  @Post('tickets/:ticketId/direct-sales-order')
  createDirectSalesOrder(@Param('ticketId') ticketId: string) {
    return this.quotations.createDirectSalesOrder(ticketId);
  }

  @Get('tickets/:ticketId/deliveries')
  listDeliveries(@Param('ticketId') ticketId: string) {
    return this.quotations.listDeliveriesForTicket(ticketId);
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER')
  @Post('deliveries/:id/retry-erpnext')
  retryDirectSalesOrder(@Param('id') id: string) {
    return this.quotations.retryDirectSalesOrder(id);
  }

  @Get('quotations/:id')
  findOne(@Param('id') id: string) {
    return this.quotations.findOne(id);
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER')
  @Patch('quotations/:id')
  update(@Param('id') id: string, @Body() dto: UpdateQuotationDto) {
    return this.quotations.update(id, dto);
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER')
  @Post('quotations/:id/items')
  addItem(@Param('id') id: string, @Body() dto: AddQuotationItemDto) {
    return this.quotations.addItem(id, dto);
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER')
  @Delete('quotations/:id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.quotations.removeItem(id, itemId);
  }

  /** Creates the DRAFT Quotation in ERPNext — from here, negotiation happens there, not in ACE. */
  @Roles('CALL_CENTER', 'ASM', 'MANAGER')
  @Post('quotations/:id/push-to-erpnext')
  pushToErpNext(@Param('id') id: string) {
    return this.quotations.pushToErpNext(id);
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER')
  @Patch('deliveries/:id')
  updateDelivery(@Param('id') id: string, @Body() dto: UpdateDeliveryDto) {
    return this.quotations.updateDelivery(id, dto);
  }
}
