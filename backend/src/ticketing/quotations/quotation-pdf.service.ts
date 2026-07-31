import { Injectable, NotFoundException } from '@nestjs/common';
// esModuleInterop is off in this project (see CLAUDE.md) — a default import
// of this CJS package passes typecheck but crashes at runtime. Namespace
// import gives the raw module.exports (the PDFDocument class) instead.
import * as PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';

const NAVY = '#2a2f69';
const ORANGE = '#ff7604';
const LABOUR_HSN_CODE = '9987'; // FSD §14.4 rule 28 — labour HSN, "Finance to confirm" per the FSD's own note.

/**
 * FSD §14.4 rule 27 — Quotation PDF (letterhead, both GSTINs, itemized list,
 * HSN codes, validity, T&Cs). Renders directly from ACE's own quotation data
 * — for the pre-ERPNext-push Draft/Sent stage. Once a quotation is pushed to
 * ERPNext (`erpnextQuotationId` set), that instance's own tax computation
 * takes over for the Sales Order/Invoice; this PDF is the customer-facing
 * document for the negotiation stage before that handoff, using ACE's own
 * brand colors (navy/orange) rather than ERPNext's print format.
 */
@Injectable()
export class QuotationPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(id: string): Promise<Buffer> {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { items: true, customer: true, ticket: true },
    });
    if (!quotation) throw new NotFoundException('Quotation not found');

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    // Letterhead
    doc.rect(0, 0, doc.page.width, 70).fill(NAVY);
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold').text('PROMAN', 40, 22, { continued: true });
    doc.fillColor(ORANGE).text(' EDGE', { continued: false });
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica').text('ACE Service Division', 40, 46);
    doc.fillColor('#000000');

    doc.moveDown(3);
    doc.fontSize(16).font('Helvetica-Bold').fillColor(NAVY).text(`Quotation ${quotation.quotationNo}`, 40, 90);
    doc.fontSize(9).font('Helvetica').fillColor('#555555');
    doc.text(`Date: ${quotation.quotationDate.toISOString().slice(0, 10)}    Valid Until: ${quotation.validUntil.toISOString().slice(0, 10)}`);
    doc.moveDown(1);

    // Both GSTINs (FSD requirement) — Proman's own is env-configured, not guessable.
    const companyGstin = process.env.ACE_COMPANY_GSTIN ?? 'Not configured';
    doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold').text('From:', 40, doc.y);
    doc.font('Helvetica').text('Proman Infrastructure Services Pvt. Ltd.');
    doc.text(`GSTIN: ${companyGstin}`);
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').text('To:');
    doc.font('Helvetica').text(quotation.customer.customerName);
    doc.text(`GSTIN: ${quotation.customer.gstNumber ?? 'Not on file'}`);
    doc.moveDown(1);

    // Itemized table
    const tableTop = doc.y;
    const cols = { item: 40, hsn: 220, qty: 300, rate: 360, tax: 430, total: 500 };
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY);
    doc.text('Item', cols.item, tableTop);
    doc.text('HSN', cols.hsn, tableTop);
    doc.text('Qty', cols.qty, tableTop);
    doc.text('Rate', cols.rate, tableTop);
    doc.text('Tax', cols.tax, tableTop);
    doc.text('Total', cols.total, tableTop);
    doc.moveTo(40, tableTop + 14).lineTo(555, tableTop + 14).strokeColor(NAVY).stroke();

    let y = tableTop + 20;
    doc.font('Helvetica').fontSize(9).fillColor('#000000');
    for (const item of quotation.items) {
      doc.text(item.itemName, cols.item, y, { width: 170 });
      doc.text('—', cols.hsn, y); // Parts HSN not modeled yet — Item has no hsnCode field (separate, larger ERPNext-sync gap).
      doc.text(item.qty.toString(), cols.qty, y);
      doc.text(Number(item.unitPrice).toFixed(2), cols.rate, y);
      doc.text(Number(item.taxAmount).toFixed(2), cols.tax, y);
      doc.text(Number(item.lineTotal).toFixed(2), cols.total, y);
      y += 18;
    }
    if (quotation.labourCharges != null) {
      doc.text('Field Service Labour', cols.item, y, { width: 170 });
      doc.text(LABOUR_HSN_CODE, cols.hsn, y);
      doc.text('1', cols.qty, y);
      doc.text(Number(quotation.labourCharges).toFixed(2), cols.rate, y);
      doc.text('—', cols.tax, y);
      doc.text(Number(quotation.labourCharges).toFixed(2), cols.total, y);
      y += 18;
    }

    y += 10;
    doc.moveTo(40, y).lineTo(555, y).strokeColor('#cccccc').stroke();
    y += 10;
    doc.font('Helvetica-Bold');
    doc.text(`Subtotal: ${Number(quotation.subtotal ?? 0).toFixed(2)}`, 400, y);
    y += 14;
    doc.text(`Tax: ${Number(quotation.taxAmount ?? 0).toFixed(2)}`, 400, y);
    y += 14;
    doc.fontSize(11).fillColor(NAVY).text(`Grand Total: INR ${Number(quotation.grandTotal ?? 0).toFixed(2)}`, 400, y);
    doc.fillColor('#000000').fontSize(9).font('Helvetica');

    if (quotation.notesToCustomer) {
      doc.moveDown(3);
      doc.font('Helvetica-Bold').text('Notes:');
      doc.font('Helvetica').text(quotation.notesToCustomer);
    }
    if (quotation.termsAndConditions) {
      doc.moveDown(1);
      doc.font('Helvetica-Bold').text('Terms & Conditions:');
      doc.font('Helvetica').text(quotation.termsAndConditions);
    }

    doc.end();
    return done;
  }
}
