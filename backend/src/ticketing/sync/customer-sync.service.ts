import { Injectable, Logger } from '@nestjs/common';
import { CustomerType, Region } from '@prisma/client';
import { ErpDbService } from '../../erp/erp-db.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RegionMappingService } from '../region-mapping/region-mapping.service';

const MAX_FAILURE_ATTEMPTS = 5;

interface ErpCustomerRow {
  name: string;
  customer_name: string;
  territory: string | null;
  email_id: string | null;
  mobile_no: string | null;
  disabled: number;
  gstin: string | null;
  credit_days: number | null;
  modified: Date;
}

/**
 * Nightly sync — the sole writer for Customer create/update (§5.1). Pulls
 * modified-since records from ERPNext via the read-only ErpDbService, never
 * writes back to ERPNext. Three possible outcomes per record:
 *  - Skipped: no email AND no mobile in ERPNext at all (~81% of real
 *    customers) — no Customer row created, tracked in CustomerSyncSkipped
 *    so Admin can see why and hand the list to ERP dev.
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
    let recordsOk = 0;
    let recordsFailed = 0;
    let errorMessage: string | null = null;

    try {
      const watermark = await this.getWatermark();
      const rows = await this.erpDb.query<ErpCustomerRow>(
        `SELECT name, customer_name, territory, email_id, mobile_no, disabled, gstin, credit_days, modified
         FROM \`tabCustomer\`
         WHERE modified > ?
         ORDER BY modified ASC`,
        [watermark.toISOString().slice(0, 19).replace('T', ' ')],
      );

      for (const row of rows) {
        const ok = await this.syncOne(row);
        if (ok) recordsOk++;
        else recordsFailed++;
      }

      await this.recheckSkipped();
      await this.recheckFailures();
    } catch (err: any) {
      errorMessage = err?.message ?? String(err);
      this.logger.error('Customer sync run failed', err);
    }

    await this.prisma.syncLog.create({
      data: {
        syncType: 'SCHEDULED',
        entity: 'Customer',
        erpDoctype: 'Customer',
        status: errorMessage ? 'FAILED' : recordsFailed > 0 ? 'PARTIAL' : 'SUCCESS',
        errorMessage: errorMessage ?? undefined,
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

  private async syncOne(row: ErpCustomerRow): Promise<boolean> {
    try {
      const hasContact = Boolean(row.email_id || row.mobile_no);
      if (!hasContact) {
        await this.prisma.customerSyncSkipped.upsert({
          where: { erpnextCustomerId: row.name },
          create: {
            erpnextCustomerId: row.name,
            customerName: row.customer_name,
            reason: 'No email or mobile in ERPNext',
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

      await this.prisma.customer.upsert({
        where: { erpnextCustomerId: row.name },
        create: {
          erpnextCustomerId: row.name,
          customerName: row.customer_name,
          customerType,
          region: region ?? undefined,
          primaryContactName: row.customer_name,
          primaryContactMobile: row.mobile_no ?? '',
          primaryContactEmail: row.email_id ?? '',
          accountStatus: row.disabled ? 'INACTIVE' : 'ACTIVE',
          gstNumber: row.gstin ?? undefined,
          creditTerms: row.credit_days != null ? String(row.credit_days) : undefined,
          needsReview: needsReviewReasons.length > 0,
          reviewReason: needsReviewReasons.length > 0 ? needsReviewReasons.join('; ') : null,
          lastSyncedAt: new Date(),
        },
        update: {
          customerName: row.customer_name,
          region: region ?? undefined,
          primaryContactMobile: row.mobile_no ?? '',
          primaryContactEmail: row.email_id ?? '',
          accountStatus: row.disabled ? 'INACTIVE' : 'ACTIVE',
          gstNumber: row.gstin ?? undefined,
          creditTerms: row.credit_days != null ? String(row.credit_days) : undefined,
          needsReview: needsReviewReasons.length > 0,
          reviewReason: needsReviewReasons.length > 0 ? needsReviewReasons.join('; ') : null,
          lastSyncedAt: new Date(),
        },
      });

      // Successful sync clears any prior failure/skip tracking for this record.
      await this.prisma.customerSyncFailure.deleteMany({ where: { erpnextCustomerId: row.name } });
      await this.prisma.customerSyncSkipped.deleteMany({ where: { erpnextCustomerId: row.name } });
      return true;
    } catch (err: any) {
      await this.recordFailure(row.name, err?.message ?? String(err));
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

  /** Backfill pass — re-check previously-skipped records in case ERPNext data was fixed since. */
  private async recheckSkipped() {
    const skipped = await this.prisma.customerSyncSkipped.findMany();
    for (const s of skipped) {
      const rows = await this.erpDb.query<ErpCustomerRow>(
        `SELECT name, customer_name, territory, email_id, mobile_no, disabled, gstin, credit_days, modified
         FROM \`tabCustomer\` WHERE name = ?`,
        [s.erpnextCustomerId],
      );
      if (rows[0] && (rows[0].email_id || rows[0].mobile_no)) {
        await this.syncOne(rows[0]);
      } else {
        await this.prisma.customerSyncSkipped.update({
          where: { id: s.id },
          data: { lastCheckedAt: new Date() },
        });
      }
    }
  }

  /** Backfill pass — retry records that failed technically, up to MAX_FAILURE_ATTEMPTS total. */
  private async recheckFailures() {
    const failures = await this.prisma.customerSyncFailure.findMany({
      where: { attemptCount: { lt: MAX_FAILURE_ATTEMPTS } },
    });
    for (const f of failures) {
      const rows = await this.erpDb.query<ErpCustomerRow>(
        `SELECT name, customer_name, territory, email_id, mobile_no, disabled, gstin, credit_days, modified
         FROM \`tabCustomer\` WHERE name = ?`,
        [f.erpnextCustomerId],
      );
      if (rows[0]) await this.syncOne(rows[0]);
    }
  }

  /** Admin-triggered manual retry (W-26) — bypasses the attempt cap for one explicit try. */
  async manualRetry(erpnextCustomerId: string): Promise<boolean> {
    const rows = await this.erpDb.query<ErpCustomerRow>(
      `SELECT name, customer_name, territory, email_id, mobile_no, disabled, gstin, credit_days, modified
       FROM \`tabCustomer\` WHERE name = ?`,
      [erpnextCustomerId],
    );
    if (!rows[0]) return false;
    return this.syncOne(rows[0]);
  }
}
