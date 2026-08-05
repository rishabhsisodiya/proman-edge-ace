import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../../prisma/prisma.service';
import { ErpDbService } from '../../erp/erp-db.service';

interface ErpFiscalYearRow {
  fiscal_year: string;
  year_start_date: Date;
  year_end_date: Date;
  disabled: number;
}

interface ErpHolidayRow {
  holiday_list: string;
  holiday_date: Date;
  weekly_off: number;
  description: string | null;
}

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly erpDb: ErpDbService,
  ) {}

  list() {
    return this.prisma.holiday.findMany({ orderBy: { date: 'asc' } });
  }

  /**
   * Fiscal years available in ERPNext (client request, 2026-08-05 — "Fetch
   * holiday list from ERP - Fiscal year option to fetch"), Shivam handoff
   * §A-Q1. Indian FY runs Apr–Mar; ERPNext's own Holiday Lists run calendar
   * year (Jan–Dec), so one FY overlaps two holiday-list years — handled in
   * fetchAndMergeErpHolidays() below via date-range JOIN, not here.
   */
  async fetchErpFiscalYears(): Promise<{ fiscalYear: string; yearStart: Date; yearEnd: Date; disabled: boolean }[]> {
    const rows = await this.erpDb.query<ErpFiscalYearRow>(
      `SELECT name AS fiscal_year, year_start_date, year_end_date, disabled
       FROM \`tabFiscal Year\`
       ORDER BY year_start_date DESC`,
    );
    return rows.map((r) => ({ fiscalYear: r.fiscal_year, yearStart: r.year_start_date, yearEnd: r.year_end_date, disabled: !!r.disabled }));
  }

  /**
   * Fetches every real holiday (weekly_off=0 — Sundays already excluded
   * separately via BUSINESS_HOURS.workDays, confirmed 2026-08-05, so
   * pulling them in here too would just be redundant, not wrong, but
   * skipped to keep the list to actual public holidays) inside the chosen
   * fiscal year (Shivam handoff §A-Q3, date-range join — no FK from Holiday
   * List to Fiscal Year exists in ERPNext) and merges them into the local
   * Holiday table. "Merge," not "replace" (client confirmed, 2026-08-05) —
   * existing manual/CSV entries are kept; a date already on file is
   * skipped, not overwritten, same as bulkUpload()'s own dedup rule.
   */
  async fetchAndMergeErpHolidays(fiscalYear: string) {
    const rows = await this.erpDb.query<ErpHolidayRow>(
      `SELECT h.parent AS holiday_list, h.holiday_date, h.weekly_off, h.description
       FROM \`tabHoliday\` h
       JOIN \`tabHoliday List\` hl ON hl.name = h.parent
       JOIN \`tabFiscal Year\` fy ON fy.name = ?
       WHERE h.holiday_date BETWEEN fy.year_start_date AND fy.year_end_date
         AND h.weekly_off = 0
       ORDER BY h.holiday_date`,
      [fiscalYear],
    );

    const results: { date: string; label: string; skipped?: boolean; error?: string }[] = [];
    for (const row of rows) {
      const dateStr = row.holiday_date.toISOString().slice(0, 10);
      // Bug found in live verification (2026-08-05) — ERPNext's `description`
      // is a rich-text field; some rows come back as raw HTML (e.g.
      // '<div class="ql-editor read-mode"><p>Third Saturday</p></div>')
      // instead of plain text. Strip tags before using it as the label.
      const plainDescription = row.description?.replace(/<[^>]*>/g, '').trim();
      const label = plainDescription || row.holiday_list;
      try {
        const normalized = normalizeDate(dateStr);
        const existing = await this.prisma.holiday.findUnique({ where: { date: normalized } });
        if (existing) {
          results.push({ date: dateStr, label, skipped: true });
          continue;
        }
        await this.prisma.holiday.create({ data: { date: normalized, label } });
        results.push({ date: dateStr, label });
      } catch (err: any) {
        results.push({ date: dateStr, label, error: err?.message ?? String(err) });
      }
    }

    return {
      total: rows.length,
      added: results.filter((r) => !r.skipped && !r.error).length,
      skipped: results.filter((r) => r.skipped).length,
      failed: results.filter((r) => r.error).length,
      results,
    };
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
