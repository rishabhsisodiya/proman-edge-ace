import { Injectable, Logger } from '@nestjs/common';
import { CustomerType, Region } from '@prisma/client';
import { ErpDbService } from '../../erp/erp-db.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RegionMappingService } from '../region-mapping/region-mapping.service';

const MAX_FAILURE_ATTEMPTS = 5;

// Field-for-field per ACE_Master_Data_SQL_Queries.md §5.1.1 — every customer
// is imported regardless of contact completeness; contact fields are simply
// blank when ERPNext has nothing (confirmed: ~81% of real customers have no
// email/mobile, but the spec still imports them, it just leaves those
// fields empty rather than skipping the record).
const CUSTOMER_SELECT = `
  SELECT
      c.name                              AS erpnext_customer_id,
      c.customer_name                     AS customer_name,
      c.customer_type                     AS customer_type,
      c.territory                         AS territory,
      c.mobile_no                         AS primary_contact_mobile,
      c.email_id                          AS primary_contact_email,
      con.first_name                      AS primary_contact_first,
      con.last_name                       AS primary_contact_last,
      sc.first_name                       AS secondary_contact_first,
      sc.last_name                        AS secondary_contact_last,
      sc.mobile_no                        AS secondary_contact_mobile,
      sc.email_id                         AS secondary_contact_email,
      c.payment_terms                     AS credit_terms,
      c.tax_id                            AS gst_number,
      IF(c.disabled = 1, 'Inactive', 'Active') AS account_status,
      c.modified                          AS modified,
      a.address_line1                     AS billing_address_line_1,
      a.address_line2                     AS billing_address_line_2,
      a.city                              AS billing_city,
      a.state                             AS billing_state,
      a.pincode                           AS billing_pin,
      a.country                           AS billing_country
  FROM \`tabCustomer\` c
  LEFT JOIN \`tabAddress\` a  ON a.name  = c.customer_primary_address
  LEFT JOIN \`tabContact\` con ON con.name = c.customer_primary_contact
  LEFT JOIN \`tabContact\` sc ON sc.name = (
      SELECT dl.parent FROM \`tabDynamic Link\` dl
      JOIN \`tabContact\` c2 ON c2.name = dl.parent
      WHERE dl.link_doctype = 'Customer' AND dl.link_name = c.name
        AND dl.parenttype = 'Contact'
        AND (c.customer_primary_contact IS NULL OR c2.name <> c.customer_primary_contact)
      ORDER BY c2.creation LIMIT 1)
`;

interface ErpCustomerRow {
  erpnext_customer_id: string;
  customer_name: string;
  customer_type: string | null;
  territory: string | null;
  primary_contact_mobile: string | null;
  primary_contact_email: string | null;
  primary_contact_first: string | null;
  primary_contact_last: string | null;
  secondary_contact_first: string | null;
  secondary_contact_last: string | null;
  secondary_contact_mobile: string | null;
  secondary_contact_email: string | null;
  credit_terms: string | null;
  gst_number: string | null;
  account_status: 'Active' | 'Inactive';
  modified: Date;
  billing_address_line_1: string | null;
  billing_address_line_2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_pin: string | null;
  billing_country: string | null;
}

function fullName(first: string | null, last: string | null): string | null {
  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || null;
}

/**
 * Nightly sync — the sole writer for Customer create/update (§5.1). Pulls
 * modified-since records from ERPNext via the read-only ErpDbService, never
 * writes back to ERPNext. Every ERPNext customer is imported (per the FSD's
 * query — no skip-on-missing-contact). Two possible non-success outcomes:
 *  - Needs review: Customer created/updated but region and/or customerType
 *    couldn't be resolved cleanly — not a failure, retried every run.
 *  - Failure: genuine technical error (DB constraint, etc) — capped at
 *    MAX_FAILURE_ATTEMPTS nightly attempts, then left for manual retry.
 */
@Injectable()
export class CustomerSyncService {
  private readonly logger = new Logger(CustomerSyncService.name);

  constructor(
    private readonly erpDb: ErpDbService,
    private readonly prisma: PrismaService,
    private readonly regionMappings: RegionMappingService,
  ) {}

  async run(): Promise<void> {
    const startedAt = new Date();
    // Keyed by erpnextCustomerId so a customer touched by more than one pass
    // in the same run (e.g. pulled by the main modified-since query while
    // also still sitting in CustomerSyncSkipped from before) is only counted
    // once — the last pass to touch it wins.
    const results = new Map<string, boolean>();
    let errorMessage: string | null = null;

    try {
      const watermark = await this.getWatermark();
      const rows = await this.erpDb.query<ErpCustomerRow>(
        `${CUSTOMER_SELECT} WHERE c.modified > ? ORDER BY c.modified ASC`,
        [watermark.toISOString().slice(0, 19).replace('T', ' ')],
      );

      for (const row of rows) {
        results.set(row.erpnext_customer_id, await this.syncOne(row));
      }

      await this.recheckSkipped(results);
      await this.recheckFailures(results);
    } catch (err: any) {
      errorMessage = err?.message ?? String(err);
      this.logger.error('Customer sync run failed', err);
    }

    const recordsOk = [...results.values()].filter(Boolean).length;
    const recordsFailed = results.size - recordsOk;

    await this.prisma.syncLog.create({
      data: {
        syncType: 'SCHEDULED',
        entity: 'Customer',
        erpDoctype: 'Customer',
        status: errorMessage ? 'FAILED' : recordsFailed > 0 ? 'PARTIAL' : 'SUCCESS',
        errorMessage: errorMessage ?? undefined,
        payload: { recordsOk, recordsFailed },
        startedAt,
        completedAt: new Date(),
      },
    });
    this.logger.log(`Customer sync complete — ok: ${recordsOk}, failed: ${recordsFailed}`);
  }

  /** Modified-since watermark — last successful sync's completion time, or epoch for a first run. */
  private async getWatermark(): Promise<Date> {
    const lastRun = await this.prisma.syncLog.findFirst({
      where: { entity: 'Customer', status: { in: ['SUCCESS', 'PARTIAL'] } },
      orderBy: { startedAt: 'desc' },
    });
    return lastRun?.startedAt ?? new Date(0);
  }

  /** True if there's no usable contact info anywhere — checks all 4 fields, not just the 2 primary ones. */
  private hasAnyContact(row: ErpCustomerRow): boolean {
    return Boolean(
      row.primary_contact_mobile || row.primary_contact_email || row.secondary_contact_mobile || row.secondary_contact_email,
    );
  }

  private async syncOne(row: ErpCustomerRow): Promise<boolean> {
    try {
      if (!this.hasAnyContact(row)) {
        // No usable contact info anywhere (checked all 4 fields) — don't
        // import, track in CustomerSyncSkipped instead so Admin can hand the
        // list to ERP dev. Self-correcting: if this customer already exists
        // as a real Customer row (e.g. from before this check existed, or
        // their contact info was since removed in ERPNext), move it back.
        const existing = await this.prisma.customer.findUnique({ where: { erpnextCustomerId: row.erpnext_customer_id } });
        if (existing) await this.prisma.customer.delete({ where: { id: existing.id } });
        await this.prisma.customerSyncSkipped.upsert({
          where: { erpnextCustomerId: row.erpnext_customer_id },
          create: {
            erpnextCustomerId: row.erpnext_customer_id,
            customerName: row.customer_name,
            reason: 'No email or mobile in ERPNext (primary or secondary contact)',
          },
          update: { lastCheckedAt: new Date() },
        });
        return true;
      }

      const region = row.territory ? await this.regionMappings.resolve(row.territory) : null;
      const needsReviewReasons: string[] = [];
      if (!region) needsReviewReasons.push(`Territory "${row.territory ?? '(none)'}" not mapped to a Region`);

      // ERPNext has no field corresponding to our CustomerType classification
      // (DIRECT/DEALER/OEM_PARTNER/GOVERNMENT/PSU) — defaults to DIRECT,
      // flagged for Admin to correct manually.
      const customerType: CustomerType = 'DIRECT';
      needsReviewReasons.push('customerType defaulted to DIRECT — not derivable from ERPNext');

      const primaryContactName = fullName(row.primary_contact_first, row.primary_contact_last) ?? row.customer_name;
      const secondaryContactName = fullName(row.secondary_contact_first, row.secondary_contact_last);

      const shared = {
        customerName: row.customer_name,
        region: region ?? undefined,
        primaryContactMobile: row.primary_contact_mobile ?? '',
        primaryContactEmail: row.primary_contact_email ?? '',
        secondaryContactName: secondaryContactName ?? undefined,
        secondaryContactMobile: row.secondary_contact_mobile ?? undefined,
        secondaryContactEmail: row.secondary_contact_email ?? undefined,
        billingAddressLine1: row.billing_address_line_1 ?? undefined,
        billingAddressLine2: row.billing_address_line_2 ?? undefined,
        billingCity: row.billing_city ?? undefined,
        billingState: row.billing_state ?? undefined,
        billingPin: row.billing_pin ?? undefined,
        billingCountry: row.billing_country ?? undefined,
        accountStatus: row.account_status === 'Inactive' ? ('INACTIVE' as const) : ('ACTIVE' as const),
        gstNumber: row.gst_number ?? undefined,
        creditTerms: row.credit_terms ?? undefined,
        needsReview: needsReviewReasons.length > 0,
        reviewReason: needsReviewReasons.length > 0 ? needsReviewReasons.join('; ') : null,
        lastSyncedAt: new Date(),
      };

      await this.prisma.customer.upsert({
        where: { erpnextCustomerId: row.erpnext_customer_id },
        create: {
          erpnextCustomerId: row.erpnext_customer_id,
          customerType,
          primaryContactName,
          ...shared,
        },
        update: {
          ...shared,
        },
      });

      // Successful sync clears any prior failure/skip tracking for this record.
      await this.prisma.customerSyncFailure.deleteMany({ where: { erpnextCustomerId: row.erpnext_customer_id } });
      await this.prisma.customerSyncSkipped.deleteMany({ where: { erpnextCustomerId: row.erpnext_customer_id } });
      return true;
    } catch (err: any) {
      await this.recordFailure(row.erpnext_customer_id, err?.message ?? String(err));
      return false;
    }
  }

  private async recordFailure(erpnextCustomerId: string, message: string) {
    const existing = await this.prisma.customerSyncFailure.findUnique({ where: { erpnextCustomerId } });
    if (existing && existing.attemptCount >= MAX_FAILURE_ATTEMPTS) {
      // Cap reached — stop retrying automatically, stays visible for manual retry (W-26).
      return;
    }
    await this.prisma.customerSyncFailure.upsert({
      where: { erpnextCustomerId },
      create: { erpnextCustomerId, lastError: message },
      update: { attemptCount: { increment: 1 }, lastError: message, lastAttemptAt: new Date() },
    });
  }

  /**
   * Backfill pass — re-check every currently-skipped record against live
   * ERPNext data. syncOne is self-correcting in both directions: if any of
   * the 4 contact fields now has data, it imports the customer and clears
   * the skip record; if still all blank, it just refreshes lastCheckedAt.
   */
  private async recheckSkipped(results: Map<string, boolean>): Promise<void> {
    const skipped = await this.prisma.customerSyncSkipped.findMany();
    for (const s of skipped) {
      const rows = await this.erpDb.query<ErpCustomerRow>(`${CUSTOMER_SELECT} WHERE c.name = ?`, [
        s.erpnextCustomerId,
      ]);
      if (rows[0]) results.set(s.erpnextCustomerId, await this.syncOne(rows[0]));
    }
  }

  /** Backfill pass — retry records that failed technically, up to MAX_FAILURE_ATTEMPTS total. */
  private async recheckFailures(results: Map<string, boolean>): Promise<void> {
    const failures = await this.prisma.customerSyncFailure.findMany({
      where: { attemptCount: { lt: MAX_FAILURE_ATTEMPTS } },
    });
    for (const f of failures) {
      const rows = await this.erpDb.query<ErpCustomerRow>(`${CUSTOMER_SELECT} WHERE c.name = ?`, [
        f.erpnextCustomerId,
      ]);
      if (rows[0]) results.set(f.erpnextCustomerId, await this.syncOne(rows[0]));
    }
  }

  /** Admin-triggered manual retry (W-26) — bypasses the attempt cap for one explicit try. */
  async manualRetry(erpnextCustomerId: string): Promise<boolean> {
    const rows = await this.erpDb.query<ErpCustomerRow>(`${CUSTOMER_SELECT} WHERE c.name = ?`, [erpnextCustomerId]);
    if (!rows[0]) return false;
    return this.syncOne(rows[0]);
  }
}
