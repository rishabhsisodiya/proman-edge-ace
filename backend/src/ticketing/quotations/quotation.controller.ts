import { Body, Controller, Delete, Get, Param, Patch, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { QuotationService } from './quotation.service';
import { QuotationPdfService } from './quotation-pdf.service';
import {
  AddQuotationItemDto,
  CreateQuotationDto,
  UpdateDeliveryDto,
  UpdateQuotationDto,
  UpdateQuotationItemDto,
} from './dto/quotation.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class QuotationController {
  constructor(
    private readonly quotations: QuotationService,
    private readonly quotationPdf: QuotationPdfService,
  ) {}

  @Get('tickets/:ticketId/quotations')
  listForTicket(@Param('ticketId') ticketId: string) {
    return this.quotations.listForTicket(ticketId);
  }

  @Get('tickets/:ticketId/chargeable')
  isChargeable(@Param('ticketId') ticketId: string) {
    return this.quotations.getChargeability(ticketId);
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ENGINEER')
  @Post('tickets/:ticketId/quotation')
  create(@Param('ticketId') ticketId: string, @Body() dto: CreateQuotationDto, @Req() req: any) {
    return this.quotations.create(ticketId, dto, { userId: req.user.userId, role: req.user.role });
  }

  // CS_SUPPORT added 2026-08-01, per client decision that warranty direct-SO
  // creation is manually triggered by CS Support/ASM/Engineer.
  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ENGINEER', 'CS_SUPPORT')
  @Post('tickets/:ticketId/direct-sales-order')
  createDirectSalesOrder(@Param('ticketId') ticketId: string) {
    return this.quotations.createDirectSalesOrder(ticketId);
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ENGINEER', 'CS_SUPPORT')
  @Post('tickets/:ticketId/direct-invoice')
  createDirectInvoice(@Param('ticketId') ticketId: string) {
    return this.quotations.createDirectInvoice(ticketId);
  }

  @Get('tickets/:ticketId/deliveries')
  listDeliveries(@Param('ticketId') ticketId: string) {
    return this.quotations.listDeliveriesForTicket(ticketId);
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ENGINEER')
  @Post('deliveries/:id/retry-erpnext')
  retryDirectSalesOrder(@Param('id') id: string) {
    return this.quotations.retryDirectSalesOrder(id);
  }

  @Get('quotations/:id')
  findOne(@Param('id') id: string) {
    return this.quotations.findOne(id);
  }

  @Get('quotations/:id/pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.quotationPdf.generate(id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="quotation-${id}.pdf"` });
    res.send(buffer);
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ENGINEER')
  @Patch('quotations/:id')
  update(@Param('id') id: string, @Body() dto: UpdateQuotationDto) {
    return this.quotations.update(id, dto);
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ENGINEER')
  @Post('quotations/:id/items')
  addItem(@Param('id') id: string, @Body() dto: AddQuotationItemDto) {
    return this.quotations.addItem(id, dto);
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ENGINEER')
  @Patch('quotations/:id/items/:itemId')
  updateItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() dto: UpdateQuotationItemDto) {
    return this.quotations.updateItem(id, itemId, dto);
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ENGINEER')
  @Delete('quotations/:id/items/:itemId')
  removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    return this.quotations.removeItem(id, itemId);
  }

  /** Creates the DRAFT Quotation in ERPNext — from here, negotiation happens there, not in ACE. */
  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ENGINEER')
  @Post('quotations/:id/push-to-erpnext')
  pushToErpNext(@Param('id') id: string) {
    return this.quotations.pushToErpNext(id);
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ENGINEER')
  @Patch('deliveries/:id')
  updateDelivery(@Param('id') id: string, @Body() dto: UpdateDeliveryDto) {
    return this.quotations.updateDelivery(id, dto);
  }

  /** Manual button — replaces the removed 5-minute polling cron (2026-07-25). */
  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ENGINEER')
  @Post('quotations/:id/create-sales-order')
  createSalesOrder(@Param('id') id: string) {
    return this.quotations.createSalesOrder(id);
  }

  /** Manual button — replaces the removed 5-minute polling cron (2026-07-25). */
  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ENGINEER')
  @Post('quotations/:id/create-invoice')
  createInvoice(@Param('id') id: string) {
    return this.quotations.createInvoice(id);
  }

  /** Manual button — Delivery Note is always raised manually in ERPNext; this just fetches its id (2026-07-25). */
  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ENGINEER')
  @Post('quotations/:id/check-delivery-note')
  checkDeliveryNote(@Param('id') id: string) {
    return this.quotations.checkDeliveryNote(id);
  }
}
