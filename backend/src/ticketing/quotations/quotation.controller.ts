import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Request, Response } from 'express';
import * as path from 'path';
import * as crypto from 'crypto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { QuotationService } from './quotation.service';
import { QuotationPdfService } from './quotation-pdf.service';
import {
  AddQuotationItemDto,
  CreateQuotationDto,
  UpdateCustomerPoDto,
  UpdateDeliveryDto,
  UpdateQuotationDto,
  UpdateQuotationItemDto,
} from './dto/quotation.dto';

const CUSTOMER_PO_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'customer-po-documents');
const ALLOWED_CUSTOMER_PO_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'application/pdf']);

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

  // Customer PO capture (client decision, 2026-08-01: manual entry in ACE,
  // not synced from ERPNext) — CS_SUPPORT included since chasing/recording
  // customer POs is their dashboard's whole purpose (§CS Support Dashboard).
  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ENGINEER', 'CS_SUPPORT')
  @Patch('quotations/:id/customer-po')
  updateCustomerPo(@Param('id') id: string, @Body() dto: UpdateCustomerPoDto) {
    return this.quotations.updateCustomerPo(id, dto.customerPoNumber, dto.customerPoDate);
  }

  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ENGINEER', 'CS_SUPPORT')
  @Post('quotations/:id/customer-po/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: CUSTOMER_PO_UPLOAD_DIR,
        filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`),
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_CUSTOMER_PO_MIME_TYPES.has(file.mimetype)) {
          cb(new BadRequestException('Customer PO document must be a JPEG, PNG, or PDF file'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadCustomerPoDocument(@Param('id') id: string, @UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('No file uploaded');
    const url = `${req.protocol}://${req.get('host')}/uploads/customer-po-documents/${file.filename}`;
    return this.quotations.uploadCustomerPoDocument(id, url);
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

  /**
   * Manual button — replaces the removed 5-minute polling cron (2026-07-25).
   * poNumber/poDate (2026-08-05) — the frontend prompts for these here if
   * they weren't already captured via the Customer PO section; both are
   * optional in the request since an already-saved PO doesn't need
   * resupplying, but the service throws if neither is present at all.
   */
  @Roles('CALL_CENTER', 'ASM', 'MANAGER', 'ENGINEER')
  @Post('quotations/:id/create-sales-order')
  createSalesOrder(@Param('id') id: string, @Body('poNumber') poNumber?: string, @Body('poDate') poDate?: string) {
    return this.quotations.createSalesOrder(id, poNumber, poDate);
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
