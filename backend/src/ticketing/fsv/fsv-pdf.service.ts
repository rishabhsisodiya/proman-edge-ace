import { Injectable, NotFoundException } from '@nestjs/common';
// esModuleInterop is off in this project (see CLAUDE.md) — namespace imports
// for both CJS packages, same pattern as QuotationPdfService/report-export.util.
import * as PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.service';

const NAVY = '#2a2f69';
const ORANGE = '#ff7604';
const FSV_SIGNATURE_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'fsv-signatures');

/**
 * Client feedback (2026-08-01) — "download FSV PDF" option. Not the
 * separately-uploaded scanned Service Report (`visitReportUrl`, a physical
 * document the engineer attaches) — this is a fresh PDF rendered from the
 * FSV's own data, same navy/orange letterhead as the Quotation PDF, for
 * whoever wants a printable/shareable summary of the visit.
 */
@Injectable()
export class FsvPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(id: string): Promise<Buffer> {
    const visit = await this.prisma.fieldServiceVisit.findUnique({
      where: { id },
      include: { parts: true, photos: true, engineer: true, ticket: { include: { customer: true, equipment: true } } },
    });
    if (!visit) throw new NotFoundException('Field Service Visit not found');

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    // Letterhead — same as QuotationPdfService
    doc.rect(0, 0, doc.page.width, 70).fill(NAVY);
    doc.fillColor('#ffffff').fontSize(20).font('Helvetica-Bold').text('PROMAN', 40, 22, { continued: true });
    doc.fillColor(ORANGE).text(' EDGE', { continued: false });
    doc.fillColor('#ffffff').fontSize(9).font('Helvetica').text('ACE Service Division', 40, 46);
    doc.fillColor('#000000');

    doc.moveDown(3);
    doc.fontSize(16).font('Helvetica-Bold').fillColor(NAVY).text(`Field Service Visit ${visit.visitNo}`, 40, 90);
    doc.fontSize(9).font('Helvetica').fillColor('#555555');
    doc.text(`Visit #${visit.visitNumber}    Date: ${visit.visitDate.toISOString().slice(0, 10)}    Status: ${visit.status}`);
    doc.moveDown(1);

    doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold').text('Ticket:', 40, doc.y, { continued: true });
    doc.font('Helvetica').text(` ${visit.ticket.ticketNo} — ${visit.ticket.subject}`);
    doc.font('Helvetica-Bold').text('Customer:', { continued: true });
    doc.font('Helvetica').text(` ${visit.ticket.customer.customerName}`);
    doc.font('Helvetica-Bold').text('Equipment:', { continued: true });
    doc.font('Helvetica').text(` ${visit.ticket.equipment?.itemName ?? 'N/A'}`);
    doc.font('Helvetica-Bold').text('Engineer:', { continued: true });
    doc.font('Helvetica').text(` ${visit.engineer.fullName}`);
    doc.moveDown(1);

    // Timestamps
    const fmt = (d: Date | null) => (d ? d.toLocaleString() : '—');
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('Timeline');
    doc.font('Helvetica').fillColor('#000000').fontSize(9);
    doc.text(`Travel Start: ${fmt(visit.travelStartTime)}    Site Arrival: ${fmt(visit.siteArrivalTime)}`);
    doc.text(`Work Start: ${fmt(visit.workStartTime)}    Work End: ${fmt(visit.workEndTime)}`);
    if (visit.gpsLatAtCheckin != null && visit.gpsLongAtCheckin != null) {
      doc.text(`GPS at check-in: ${visit.gpsLatAtCheckin}, ${visit.gpsLongAtCheckin}`);
    }
    doc.moveDown(1);

    // Work details
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('Work Performed');
    doc.font('Helvetica').fillColor('#000000').fontSize(9).text(visit.workPerformed ?? '—');
    doc.moveDown(0.5);
    if (visit.findingsRootCause) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('Findings / Root Cause');
      doc.font('Helvetica').fillColor('#000000').fontSize(9).text(visit.findingsRootCause);
      doc.moveDown(0.5);
    }
    if (visit.recommendations) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('Recommendations');
      doc.font('Helvetica').fillColor('#000000').fontSize(9).text(visit.recommendations);
      doc.moveDown(0.5);
    }

    // Parts consumed
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('Parts Consumed');
    if (visit.noPartsUsed || visit.parts.length === 0) {
      doc.font('Helvetica').fillColor('#000000').fontSize(9).text(visit.noPartsUsed ? 'No parts were used on this visit.' : 'None logged.');
    } else {
      const tableTop = doc.y + 4;
      const cols = { item: 40, qty: 300, uom: 350, warehouse: 400, amount: 500 };
      doc.font('Helvetica-Bold').fontSize(9);
      doc.text('Item', cols.item, tableTop);
      doc.text('Qty', cols.qty, tableTop);
      doc.text('UOM', cols.uom, tableTop);
      doc.text('Warehouse', cols.warehouse, tableTop);
      doc.text('Amount', cols.amount, tableTop);
      doc.moveTo(40, tableTop + 14).lineTo(555, tableTop + 14).strokeColor(NAVY).stroke();
      let y = tableTop + 20;
      doc.font('Helvetica').fontSize(9);
      for (const p of visit.parts) {
        doc.text(p.itemName, cols.item, y, { width: 250 });
        doc.text(p.qty.toString(), cols.qty, y);
        doc.text(p.uom, cols.uom, y);
        doc.text(p.warehouse, cols.warehouse, y, { width: 90 });
        doc.text(Number(p.amount).toFixed(2), cols.amount, y);
        y += 16;
      }
      doc.y = y;
    }
    doc.moveDown(1);

    // Customer sign-off
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text('Customer Sign-off');
    doc.font('Helvetica').fillColor('#000000').fontSize(9);
    doc.text(`Representative: ${visit.customerRepName ?? '—'}${visit.customerRepDesignation ? ` (${visit.customerRepDesignation})` : ''}`);
    doc.text(`Confirmed: ${visit.customerSignOff ? 'Yes' : 'No'}`);
    if (visit.customerSignatureUrl) {
      const filename = visit.customerSignatureUrl.split('/').pop();
      const localPath = filename ? path.join(FSV_SIGNATURE_UPLOAD_DIR, filename) : null;
      if (localPath && fs.existsSync(localPath)) {
        doc.moveDown(0.5);
        doc.image(localPath, doc.x, doc.y, { width: 120, height: 60 });
        doc.moveDown(4);
      }
    }

    if (visit.photos.length > 0) {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text(`Photos (${visit.photos.length})`);
      doc.font('Helvetica').fillColor('#000000').fontSize(9);
      for (const p of visit.photos) doc.text(`• ${p.caption ?? p.url}`);
    }

    if (visit.submittedAt) {
      doc.moveDown(1);
      doc.font('Helvetica').fontSize(8).fillColor('#555555').text(`Submitted ${visit.submittedAt.toLocaleString()} by ${visit.engineer.fullName}`);
    }

    doc.end();
    return done;
  }
}
