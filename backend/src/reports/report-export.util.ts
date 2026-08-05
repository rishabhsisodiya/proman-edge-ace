// esModuleInterop is off in this project — namespace imports for both CJS
// packages (see CLAUDE.md; xlsx already used this way in dashboards/finance).
import * as XLSX from 'xlsx';
import * as PDFDocument from 'pdfkit';

// `link`/`linkId` (2026-08-05, client request — "every ID in a report
// should be clickable") — when set, the frontend renders this column's
// cells as a link to that entity's detail page, reading the actual target
// id from `row[\`${key}__linkId\`]` (a hidden field alongside the display
// value, since most display values here are ticketNo/serialNo/contractRef,
// not the DB id the detail route actually needs).
export type ReportLinkType = 'ticket' | 'customer' | 'equipment' | 'amc' | 'item';

export interface ReportColumn {
  key: string;
  label: string;
  link?: ReportLinkType;
}

/** Shared Excel export — every report uses the same {columns, rows} shape. */
export function toExcelBuffer(columns: ReportColumn[], rows: Record<string, unknown>[]): Buffer {
  const data = rows.map((row) => {
    const ordered: Record<string, unknown> = {};
    for (const col of columns) ordered[col.label] = row[col.key] ?? '';
    return ordered;
  });
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/**
 * Shared PDF export — a plain tabular layout (not a designed report), same
 * navy/orange branding as the Quotation PDF. Reports with a genuinely
 * different shape (Ticket Status Timeline is vertical, not tabular) build
 * their own PDF instead of calling this — see reports.service.ts.
 */
export function toPdfBuffer(title: string, columns: ReportColumn[], rows: Record<string, unknown>[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: columns.length > 6 ? 'landscape' : 'portrait', margin: 30 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.rect(0, 0, doc.page.width, 50).fill('#2a2f69');
  doc.fillColor('#ffffff').fontSize(14).font('Helvetica-Bold').text(title, 30, 18);
  doc.fillColor('#000000').font('Helvetica').fontSize(8);

  const usableWidth = doc.page.width - 60;
  const colWidth = usableWidth / columns.length;
  let y = 70;
  doc.font('Helvetica-Bold');
  columns.forEach((col, i) => doc.text(col.label, 30 + i * colWidth, y, { width: colWidth - 4 }));
  y += 16;
  doc.moveTo(30, y).lineTo(30 + usableWidth, y).strokeColor('#2a2f69').stroke();
  y += 6;
  doc.font('Helvetica');

  for (const row of rows) {
    // Bug fix (2026-08-05, client-reported — long Subject/Customer/Equipment
    // text made rows overlap into unreadable garbage) — row height was a
    // fixed 14pt regardless of how many lines a cell actually wrapped to.
    // PDFKit wraps long text within the given `width` automatically but
    // never reports that back on its own, so the fixed advance ran the next
    // row straight through the current one's still-unfinished lines.
    // Measure each cell's real wrapped height first, advance by the tallest.
    const cellTexts = columns.map((col) => {
      const value = row[col.key];
      return value == null ? '' : String(value);
    });
    const rowHeight = Math.max(14, ...cellTexts.map((text) => doc.heightOfString(text, { width: colWidth - 4 })));

    if (y + rowHeight > doc.page.height - 40) {
      doc.addPage({ size: 'A4', layout: columns.length > 6 ? 'landscape' : 'portrait', margin: 30 });
      y = 30;
    }
    columns.forEach((_col, i) => {
      doc.text(cellTexts[i], 30 + i * colWidth, y, { width: colWidth - 4 });
    });
    y += rowHeight + 4;
  }

  doc.end();
  return done;
}
