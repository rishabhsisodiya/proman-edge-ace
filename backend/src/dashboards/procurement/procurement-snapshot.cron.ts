import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ErpDbService } from '../../erp/erp-db.service';
import { ProcurementSnapshotStore } from './procurement-snapshot.store';

// Ported from PROMAN/backend/src/cron/procurementKpiSnapshot.ts (node-cron ->
// @nestjs/schedule, same schedule/timezone/SQL) — writes today's Procurement
// KPI counts into ProcurementKpiSnapshot once a day.

@Injectable()
export class ProcurementSnapshotCron implements OnModuleInit {
  private readonly logger = new Logger(ProcurementSnapshotCron.name);

  constructor(
    private readonly erpDb: ErpDbService,
    private readonly store: ProcurementSnapshotStore,
  ) {}

  async onModuleInit() {
    const hasData = await this.store.hasAnySnapshot();
    if (!hasData) {
      this.logger.log('No snapshot data found — seeding now…');
      this.captureSnapshot().catch((err) => this.logger.error('Seed failed', err));
    }
  }

  @Cron('55 23 * * *', { timeZone: 'Asia/Kolkata' })
  async captureSnapshot() {
    try {
      const [prsPending, openPOs, overduePOs, criticalStock, spendMtd] = await Promise.all([
        // W-PROC-01: POs awaiting any approval level
        this.erpDb.query<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM \`tabPurchase Order\`
           WHERE workflow_state LIKE 'Awaiting%Approval'`,
        ),

        // W-PROC-02: Open POs (submitted, not fully received)
        this.erpDb.query<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM \`tabPurchase Order\`
           WHERE docstatus = 1
             AND status IN ('To Receive', 'To Receive and Bill')`,
        ),

        // W-PROC-03: Overdue POs
        this.erpDb.query<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM \`tabPurchase Order\`
           WHERE docstatus = 1
             AND status IN ('To Receive', 'To Receive and Bill')
             AND schedule_date < CURDATE()
             AND per_received < 100`,
        ),

        // W-PROC-05: Critical stock alerts (below reorder level + WO-linked)
        this.erpDb.query<{ cnt: number }>(
          `SELECT COUNT(DISTINCT b.item_code) AS cnt
           FROM \`tabBin\` b
           JOIN \`tabItem Reorder\` ir ON ir.parent = b.item_code AND ir.warehouse = b.warehouse
           WHERE ir.warehouse_reorder_level > 0
             AND b.actual_qty < ir.warehouse_reorder_level
             AND EXISTS (
               SELECT 1 FROM \`tabWork Order Item\` woi
               JOIN \`tabWork Order\` wo ON wo.name = woi.parent
                 AND wo.docstatus = 1
                 AND wo.status IN ('Not Started', 'In Process')
               WHERE woi.item_code = b.item_code
             )`,
        ),

        // W-PROC-04: Spend MTD
        this.erpDb.query<{ spend: number }>(
          `SELECT COALESCE(SUM(grand_total), 0) AS spend
           FROM \`tabPurchase Invoice\`
           WHERE docstatus = 1
             AND posting_date BETWEEN DATE_FORMAT(CURDATE(), '%Y-%m-01') AND LAST_DAY(CURDATE())`,
        ),
      ]);

      const today = new Date().toISOString().slice(0, 10);
      await this.store.writeProcurementSnapshot({
        date: today,
        prsPending: prsPending[0].cnt,
        openPOs: openPOs[0].cnt,
        overduePOs: overduePOs[0].cnt,
        criticalStock: criticalStock[0].cnt,
        spendMtd: Number(spendMtd[0].spend),
      });
      this.logger.log(`Snapshot saved for ${today}`);
    } catch (err) {
      this.logger.error('Failed to capture snapshot', err);
    }
  }
}
