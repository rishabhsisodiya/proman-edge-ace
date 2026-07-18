import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ErpDbService } from '../../erp/erp-db.service';
import { ManufacturingSnapshotStore } from './kpi-snapshot.store';

// Ported from PROMAN/backend/src/cron/kpiSnapshot.ts (node-cron -> @nestjs/schedule,
// same schedule/timezone, same SQL) — writes today's Manufacturing KPI counts into
// ManufacturingKpiSnapshot once a day so the homepage's "vs yesterday" trend has
// something to compare against.

const GRACE_DAYS = 3;
const ATRISK_DAYS = 5;

@Injectable()
export class ManufacturingSnapshotCron implements OnModuleInit {
  private readonly logger = new Logger(ManufacturingSnapshotCron.name);

  constructor(
    private readonly erpDb: ErpDbService,
    private readonly store: ManufacturingSnapshotStore,
  ) {}

  async onModuleInit() {
    const hasData = await this.store.hasAnySnapshot();
    if (!hasData) {
      this.logger.log('No snapshot data found — seeding today\'s snapshot now…');
      this.captureSnapshot().catch((err) => this.logger.error('Seed failed', err));
    }
  }

  @Cron('55 23 * * *', { timeZone: 'Asia/Kolkata' })
  async captureSnapshot() {
    try {
      const [active, completed, delayed, atRisk, onHold] = await Promise.all([
        this.erpDb.query<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM \`tabWork Order\`
           WHERE docstatus = 1 AND status IN ('In Process','Not Started')`,
        ),
        this.erpDb.query<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM \`tabWork Order\`
           WHERE docstatus = 1 AND status = 'Completed' AND DATE(modified) = CURDATE()`,
        ),
        this.erpDb.query<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM \`tabWork Order\` wo
           WHERE wo.docstatus = 1 AND wo.status IN ('In Process','Not Started')
             AND wo.expected_delivery_date IS NOT NULL
             AND DATEDIFF(CURDATE(), wo.expected_delivery_date) > ?
             AND NOT EXISTS (
               SELECT 1 FROM \`tabJob Card\` jc
               WHERE jc.work_order = wo.name AND jc.status = 'On Hold'
             )`,
          [GRACE_DAYS],
        ),
        this.erpDb.query<{ cnt: number }>(
          `SELECT COUNT(DISTINCT wo.name) AS cnt
           FROM \`tabWork Order\` wo
           WHERE wo.docstatus = 1 AND wo.status IN ('In Process','Not Started')
             AND DATEDIFF(CURDATE(), wo.expected_delivery_date) <= ?
             AND NOT EXISTS (
               SELECT 1 FROM \`tabJob Card\` jc
               WHERE jc.work_order = wo.name AND jc.status = 'On Hold'
             )
             AND (
               DATEDIFF(CURDATE(), wo.expected_delivery_date) BETWEEN 1 AND ?
               OR wo.expected_delivery_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
             )`,
          [GRACE_DAYS, GRACE_DAYS, ATRISK_DAYS],
        ),
        this.erpDb.query<{ cnt: number }>(
          `SELECT COUNT(*) AS cnt FROM \`tabWork Order\` wo
           WHERE wo.docstatus = 1
             AND (
               wo.status = 'Stopped'
               OR EXISTS (
                 SELECT 1 FROM \`tabJob Card\` jc
                 WHERE jc.work_order = wo.name AND jc.status = 'On Hold'
               )
             )`,
        ),
      ]);

      const today = new Date().toISOString().slice(0, 10);
      await this.store.writeSnapshot({
        date: today,
        activeWOs: active[0].cnt,
        completedToday: Number(completed[0].cnt),
        delayed: delayed[0].cnt,
        atRisk: atRisk[0].cnt,
        onHold: onHold[0].cnt,
      });
      this.logger.log(`Snapshot saved for ${today}`);
    } catch (err) {
      this.logger.error('Failed to capture snapshot', err);
    }
  }
}
