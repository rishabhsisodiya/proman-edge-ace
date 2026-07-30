import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * FSD §14.3 note — "Public holidays excluded (holiday list configurable by
 * Admin)." One-off literal dates, bulk-uploaded via CSV once a year (Admin
 * downloads a template, fills it in Excel, re-uploads as CSV) with
 * individual add/remove still available for one-off corrections through the
 * year. Read by TicketsService/business-hours.util.ts to skip these dates
 * exactly like weekly off-days are already skipped.
 */
@Injectable()
export class HolidayService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.holiday.findMany({ orderBy: { date: 'asc' } });
  }

  async create(date: string, label: string) {
    const normalized = normalizeDate(date);
    const existing = await this.prisma.holiday.findUnique({ where: { date: normalized } });
    if (existing) throw new ConflictException('A holiday is already set for this date');
    return this.prisma.holiday.create({ data: { date: normalized, label } });
  }

  remove(id: string) {
    return this.prisma.holiday.delete({ where: { id } });
  }

  /** Used by TicketsService/business-hours computation — not exposed via the controller. */
  async listDateSet(): Promise<Set<string>> {
    const rows = await this.prisma.holiday.findMany({ select: { date: true } });
    return new Set(rows.map((r) => dateKey(r.date)));
  }

  /**
   * Bulk upload (CSV columns: date,label). Duplicates against existing rows
   * are skipped and reported, not treated as a hard failure — the rest of
   * the file still imports. Mirrors TicketsService.bulkImport()'s per-row
   * results shape.
   */
  async bulkUpload(csvBuffer: Buffer) {
    let rows: Record<string, string>[];
    try {
      rows = parse(csvBuffer, { columns: true, skip_empty_lines: true, trim: true });
    } catch (err: any) {
      throw new BadRequestException(`Could not parse CSV: ${err?.message ?? err}`);
    }
    if (rows.length === 0) {
      throw new BadRequestException('CSV has no data rows');
    }

    const results: { row: number; date?: string; error?: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +1 for 0-index, +1 for the header row
      try {
        if (!row.date?.trim()) throw new Error('Missing "date"');
        if (!row.label?.trim()) throw new Error('Missing "label"');
        const normalized = normalizeDate(row.date.trim());
        const existing = await this.prisma.holiday.findUnique({ where: { date: normalized } });
        if (existing) throw new Error(`A holiday already exists for ${row.date.trim()}`);
        await this.prisma.holiday.create({ data: { date: normalized, label: row.label.trim() } });
        results.push({ row: rowNum, date: row.date.trim() });
      } catch (err: any) {
        results.push({ row: rowNum, error: err?.message ?? String(err) });
      }
    }

    return {
      total: rows.length,
      succeeded: results.filter((r) => r.date).length,
      failed: results.filter((r) => r.error).length,
      results,
    };
  }

  /** CSV Admin downloads, fills in, and re-uploads via bulkUpload() above. */
  downloadTemplate(): string {
    return ['date,label', '2026-01-26,Republic Day', '2026-08-15,Independence Day'].join('\n');
  }
}

// Local-date components throughout (not UTC) — matches how the rest of this
// codebase treats server-local time as IST (e.g. business-hours.util.ts's
// cursor.getHours()/getDay() calls, the AMC/SLA crons' explicit
// Asia/Kolkata timeZone), so a holiday's stored date-key lines up exactly
// with the local dates addBusinessHours() walks through.
function normalizeDate(date: string): Date {
  const d = new Date(date);
  if (isNaN(d.getTime())) throw new BadRequestException(`Invalid date: "${date}"`);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
