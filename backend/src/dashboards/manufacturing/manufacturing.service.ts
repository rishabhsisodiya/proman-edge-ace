import { Injectable } from '@nestjs/common';
import { ErpDbService } from '../../erp/erp-db.service';
import { ErpCacheService } from '../../erp/erp-cache.service';
import { ManufacturingSnapshotStore } from './kpi-snapshot.store';
import type {
  ManufacturingHomepageData,
  DelayedWO,
  CompletingWO,
  PipelineStage,
  SubStage,
  MaterialShortage,
  DowntimeMachine,
  PipelineOrder,
} from './manufacturing.types';

// Ported verbatim (SQL unchanged) from PROMAN/backend/src/services/manufacturingServiceDB.ts
// Only the plumbing changed: module-level `query()` -> injected `this.erpDb.query()`,
// and kpiSnapshotService -> kpi-snapshot.store (now DB-backed, see ManufacturingSnapshotStore).

const GRACE_DAYS = 3; // days past due before WO turns red
const ATRISK_DAYS = 5; // days ahead of due date that trigger amber

@Injectable()
export class ManufacturingService {
  constructor(
    private readonly erpDb: ErpDbService,
    private readonly cache: ErpCacheService,
    private readonly snapshotStore: ManufacturingSnapshotStore,
  ) {}

  private erpBaseUrl() {
    return (process.env.FRAPPE_BASE_URL ?? '').replace(/\/$/, '');
  }

  // ── W-MH-01/02/03/04/05 ─────────────────────────────────────────────────────
  private async getKpis() {
    const [active, completed, delayed, atRisk, onHold] = await Promise.all([
      // W-MH-01 Active: submitted, in progress
      this.erpDb.query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM \`tabWork Order\`
         WHERE docstatus = 1 AND status IN ('In Process','Not Started')`,
      ),

      // W-MH-02 Completed today: WOs completed on today's date
      this.erpDb.query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM \`tabWork Order\`
         WHERE docstatus = 1 AND status = 'Completed' AND DATE(modified) = CURDATE()`,
      ),

      // W-MH-03 Delayed (Red): past expected_delivery_date by more than grace days, not on hold
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

      // W-MH-04 At Risk (Amber): not red, not on hold, within at-risk window OR behind production pace
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
             OR EXISTS (
               SELECT 1 FROM \`tabJob Card\` jc
               WHERE jc.work_order = wo.name
                 AND jc.status IN ('Work In Progress', 'Material Transferred')
                 AND jc.expected_end_date > jc.expected_start_date
                 AND jc.total_completed_qty < jc.for_quantity *
                     LEAST(
                       GREATEST(TIMESTAMPDIFF(SECOND, jc.expected_start_date, NOW()), 0)
                       / TIMESTAMPDIFF(SECOND, jc.expected_start_date, jc.expected_end_date),
                       1
                     )
             )
           )`,
        [GRACE_DAYS, GRACE_DAYS, ATRISK_DAYS],
      ),

      // W-MH-05 On Hold: status Stopped OR any Job Card with status On Hold
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

    const activeVal = active[0].cnt;
    const completedVal = Number(completed[0].cnt);
    const delayedVal = delayed[0].cnt;
    const atRiskVal = atRisk[0].cnt;
    const onHoldVal = onHold[0].cnt;
    const greenVal = Math.max(0, activeVal - delayedVal - atRiskVal - onHoldVal);

    const yesterday = await this.snapshotStore.getYesterdaySnapshot();

    return {
      activeWOs: {
        value: activeVal,
        sub: 'Work orders in progress',
        trend: yesterday ? this.snapshotStore.computeTrend(activeVal, yesterday.activeWOs, 'activeWOs') : null,
        red: delayedVal,
        amber: atRiskVal,
        green: greenVal,
        hold: onHoldVal,
      },
      completedToday: {
        value: completedVal,
        sub: "Completed on today's date",
        trend: yesterday ? this.snapshotStore.computeTrend(completedVal, yesterday.completedToday, 'completedToday') : null,
      },
      delayedRed: {
        value: delayedVal,
        sub: 'Needs immediate action',
        trend: yesterday ? this.snapshotStore.computeTrend(delayedVal, yesterday.delayed, 'delayed') : null,
      },
      atRiskAmber: {
        value: atRiskVal,
        sub: `Due within ${ATRISK_DAYS} days`,
        trend: yesterday ? this.snapshotStore.computeTrend(atRiskVal, yesterday.atRisk, 'atRisk') : null,
      },
      onHold: {
        value: onHoldVal,
        sub: 'Active holds',
        trend: yesterday ? this.snapshotStore.computeTrend(onHoldVal, yesterday.onHold, 'onHold') : null,
      },
    };
  }

  // ── W-MH-06 Delayed WOs list ─────────────────────────────────────────────────
  private async getDelayedWOs(): Promise<DelayedWO[]> {
    const rows = await this.erpDb.query<{
      name: string;
      customer_name: string;
      expected_delivery_date: string;
      status: string;
    }>(
      `SELECT
         wo.name,
         COALESCE(so.customer_name, wo.sales_order, '—') AS customer_name,
         wo.status,
         wo.expected_delivery_date
       FROM \`tabWork Order\` wo
       LEFT JOIN \`tabSales Order\` so ON so.name = wo.sales_order
       WHERE wo.docstatus = 1
         AND wo.status IN ('In Process','Not Started','Stopped')
         AND wo.expected_delivery_date IS NOT NULL
         AND (
           DATEDIFF(CURDATE(), wo.expected_delivery_date) > 0
           OR wo.status = 'Stopped'
           OR EXISTS (
             SELECT 1 FROM \`tabJob Card\` jc
             WHERE jc.work_order = wo.name AND jc.docstatus = 1
               AND jc.for_quantity > 0
               AND jc.expected_start_date IS NOT NULL
               AND jc.expected_end_date IS NOT NULL
               AND jc.expected_end_date > jc.expected_start_date
               AND NOW() BETWEEN jc.expected_start_date AND jc.expected_end_date
               AND (jc.total_completed_qty / jc.for_quantity)
                   < (TIMESTAMPDIFF(SECOND, jc.expected_start_date, NOW())
                      / TIMESTAMPDIFF(SECOND, jc.expected_start_date, jc.expected_end_date))
           )
         )
       ORDER BY
         CASE WHEN wo.status = 'Stopped' THEN 2
              WHEN DATEDIFF(CURDATE(), wo.expected_delivery_date) > ? THEN 0
              ELSE 1 END,
         wo.expected_delivery_date ASC
       LIMIT 10`,
      [GRACE_DAYS],
    );

    return rows.map((r) => {
      const daysOver = Math.floor((Date.now() - new Date(r.expected_delivery_date).getTime()) / 86_400_000);
      let rag: 'red' | 'amber' | 'green';
      let label: string;
      if (r.status === 'Stopped') {
        rag = 'amber';
        label = 'On hold';
      } else if (daysOver > GRACE_DAYS) {
        rag = 'red';
        label = `${daysOver}d over`;
      } else {
        rag = 'amber';
        label = 'At risk';
      }
      return {
        wo: r.name,
        customer: r.customer_name,
        status: r.status,
        daysOver: rag === 'red' ? daysOver : 0,
        rag,
        label,
      };
    });
  }

  // ── W-MH-07 Mfg sub-stages ──────────────────────────────────────────────────
  private async getMfgSubStages(): Promise<SubStage[]> {
    const rows = await this.erpDb.query<{
      sub_stage: string;
      red: number;
      amber: number;
      green: number;
      hold: number;
    }>(
      `SELECT
         b.sub_stage,
         COUNT(jc.name)                       AS total,
         COALESCE(SUM(jc.rag = 'red'),   0)   AS red,
         COALESCE(SUM(jc.rag = 'amber'), 0)   AS amber,
         COALESCE(SUM(jc.rag = 'green'), 0)   AS green,
         COALESCE(SUM(jc.rag = 'hold'),  0)   AS hold
       FROM (
         SELECT 'Fabrication' AS sub_stage UNION ALL
         SELECT 'Machining'               UNION ALL
         SELECT 'Assembly'                UNION ALL
         SELECT 'Paint'
       ) b
       LEFT JOIN (
         SELECT
           j.name,
           CASE
             WHEN j.operation IN (
               'Pre Fabrication','Post Fabrication','casting','Welding',
               'Hard Face welding','Material handling'
             ) THEN 'Fabrication'
             WHEN j.operation IN ('Maching','Machining','Grinding') THEN 'Machining'
             WHEN j.operation IN (
               'Assembly','Bearing Cartidlge Assembly','Final Assembly','Test Run'
             ) THEN 'Assembly'
             WHEN j.operation IN ('Pre Painting','Final Painting','Painting') THEN 'Paint'
           END AS sub_stage,
           CASE
             WHEN j.status = 'On Hold'                                       THEN 'hold'
             WHEN j.expected_end_date IS NOT NULL AND j.expected_end_date < NOW() THEN 'red'
             WHEN j.expected_start_date IS NULL OR j.expected_end_date IS NULL
                  OR j.expected_end_date <= j.expected_start_date            THEN 'green'
             WHEN j.total_completed_qty * TIMESTAMPDIFF(SECOND, j.expected_start_date, j.expected_end_date)
                  >= j.for_quantity * GREATEST(TIMESTAMPDIFF(SECOND, j.expected_start_date, NOW()), 1)
                                                                             THEN 'green'
             WHEN j.for_quantity > 0 AND j.total_completed_qty >= 0.9 * j.for_quantity THEN 'amber'
             ELSE 'red'
           END AS rag
         FROM \`tabJob Card\` j
         JOIN \`tabWork Order\` wo ON wo.name = j.work_order AND wo.docstatus = 1
         WHERE j.status IN ('Work In Progress','Material Transferred','On Hold')
       ) jc ON jc.sub_stage = b.sub_stage
       GROUP BY b.sub_stage
       ORDER BY FIELD(b.sub_stage, 'Fabrication', 'Machining', 'Assembly', 'Paint')`,
    );

    return rows.map((r) => ({
      label: r.sub_stage,
      red: Number(r.red),
      amber: Number(r.amber),
      green: Number(r.green),
      hold: Number(r.hold),
    }));
  }

  // ── W-MH-08 Material shortages ───────────────────────────────────────────────
  private async getMaterialShortages(): Promise<MaterialShortage[]> {
    const rows = await this.erpDb.query<{
      wo: string;
      item_name: string;
      qty: number;
      received_qty: number;
      uom: string;
      schedule_date: string;
      eta: string | null;
      earliest_jc_start: string | null;
    }>(
      `SELECT
         COALESCE(wo.name, mr.name, '—') AS wo,
         mri.item_name,
         mri.qty,
         mri.received_qty,
         mri.uom,
         mri.schedule_date,
         poi.expected_delivery_date        AS eta,
         MIN(jc.expected_start_date)       AS earliest_jc_start
       FROM \`tabMaterial Request\`     mr
       JOIN \`tabMaterial Request Item\` mri ON mri.parent = mr.name
       LEFT JOIN \`tabWork Order\`       wo  ON wo.sales_order = mri.sales_order
                                            AND wo.docstatus   = 1
                                            AND wo.status IN ('In Process','Not Started')
       LEFT JOIN \`tabJob Card\`         jc  ON jc.work_order = wo.name AND jc.docstatus = 1
       LEFT JOIN \`tabPurchase Order Item\` poi
         ON poi.material_request      = mr.name
        AND poi.material_request_item = mri.name
        AND poi.docstatus             = 1
       WHERE mr.docstatus = 1
         AND mr.material_request_type = 'Purchase'
         AND mri.received_qty < mri.qty
       GROUP BY mr.name, mri.name
       ORDER BY wo.expected_delivery_date ASC
       LIMIT 10`,
    );

    return rows.map((r) => {
      const short = r.qty - r.received_qty;
      const etaStr = r.eta ?? r.schedule_date ?? '';
      const etaMs = etaStr ? new Date(etaStr).getTime() : null;
      const jcStartMs = r.earliest_jc_start ? new Date(r.earliest_jc_start).getTime() : null;
      const isBlocking = etaMs && jcStartMs ? etaMs > jcStartMs : false;
      return {
        wo: r.wo,
        item: r.item_name,
        short: `${Math.ceil(short)} ${r.uom || 'units'}`,
        eta: etaStr ? new Date(etaStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—',
        rag: (isBlocking ? 'red' : 'amber') as 'red' | 'amber' | 'green',
      };
    });
  }

  // ── W-MH-09 Operations pipeline ──────────────────────────────────────────────
  private async getPipelineStages(): Promise<PipelineStage[]> {
    const STAGE_COLORS: Record<string, string> = {
      S0: '#AAB0DC', S1: '#AAB0DC', S2: '#AAB0DC', S3: '#AAB0DC', S4: '#AAB0DC',
      S5: '#2A2F69', S6: '#FF7604', S7: '#2A2F69', S8: '#2A2F69', S9: '#2A2F69',
    };
    const STAGE_NAMES: Record<string, string> = {
      S0: 'Draft', S1: 'Eng & Design', S2: 'Production Plan', S3: 'Procurement',
      S4: 'Vendor Dev', S5: 'Stores', S6: 'Manufacturing', S7: 'Quality',
      S8: 'Dispatch', S9: 'Installation',
    };

    const rows = await this.erpDb.query<{
      stage_code: string;
      orders: number;
      red: number;
      amber: number;
      green: number;
    }>(
      `SELECT st.name AS stage_code,
         COUNT(op.name) AS orders,
         SUM(so.delivery_date IS NOT NULL AND so.delivery_date < CURDATE()) AS red,
         SUM(so.delivery_date IS NOT NULL AND so.delivery_date BETWEEN CURDATE() AND CURDATE()+INTERVAL ? DAY) AS amber,
         SUM(op.name IS NOT NULL AND (so.delivery_date IS NULL OR so.delivery_date > CURDATE()+INTERVAL ? DAY)) AS green
       FROM \`tabOrder Pipeline Stage\` st
       LEFT JOIN \`tabOrder Pipeline\` op ON op.stage_name LIKE CONCAT('%', st.stage_name, '%')
       LEFT JOIN \`tabSales Order\` so ON so.name = op.sales_order_id
       WHERE st.name <> 'S0'
       GROUP BY st.name, st.stage_name
       ORDER BY st.name`,
      [ATRISK_DAYS, ATRISK_DAYS],
    );

    const map = new Map(rows.map((r) => [r.stage_code, r]));
    return ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'].map((s) => {
      const r = map.get(s);
      return {
        label: STAGE_NAMES[s],
        short: s,
        color: STAGE_COLORS[s],
        red: r ? Number(r.red) : 0,
        amber: r ? Number(r.amber) : 0,
        green: r ? Number(r.green) : 0,
        hold: 0,
      };
    });
  }

  // ── W-MH-11 Machine downtime today ──────────────────────────────────────────
  private async getDowntime(): Promise<{ totalHrs: number; machines: DowntimeMachine[] }> {
    const rows = await this.erpDb.query<{
      machine: string;
      downtime: number;
      reason: string;
      to_time: string | null;
    }>(
      `SELECT
         workstation AS machine,
         downtime,
         COALESCE(NULLIF(TRIM(remarks), ''), stop_reason, '') AS reason,
         to_time
       FROM \`tabDowntime Entry\`
       WHERE DATE(from_time) = CURDATE()
       ORDER BY from_time DESC`,
    );

    const machines: DowntimeMachine[] = rows.map((r) => ({
      machine: r.machine,
      hrs: Math.round((r.downtime / 60) * 10) / 10,
      reason: r.reason,
      status: r.to_time ? 'resolved' : 'open',
    }));

    const totalHrs = Math.round(machines.reduce((s, m) => s + m.hrs, 0) * 10) / 10;
    return { totalHrs, machines };
  }

  // ── W-MH-12 WOs completing this week ────────────────────────────────────────
  private async getCompletingThisWeek(): Promise<CompletingWO[]> {
    const rows = await this.erpDb.query<{
      name: string;
      customer_name: string;
      production_item: string;
      expected_delivery_date: string;
      status: string;
      qty: number;
      produced_qty: number;
    }>(
      `SELECT
         wo.name,
         wo.status,
         COALESCE(so.customer_name, '—')    AS customer_name,
         wo.production_item,
         wo.expected_delivery_date,
         wo.qty,
         wo.produced_qty
       FROM \`tabWork Order\`    wo
       LEFT JOIN \`tabSales Order\` so ON so.name = wo.sales_order
       WHERE wo.docstatus = 1
         AND wo.status NOT IN ('Closed', 'Cancelled', 'Draft')
         AND wo.expected_delivery_date BETWEEN
             DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
             AND DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 6 DAY)
       ORDER BY wo.expected_delivery_date ASC
       LIMIT 10`,
    );

    return rows.map((r) => {
      const completion = r.qty > 0 ? Math.round((r.produced_qty / r.qty) * 100) : 0;
      const isOverdue = new Date(r.expected_delivery_date).getTime() < Date.now();
      const rag: 'red' | 'amber' | 'green' = isOverdue ? 'red' : completion >= 95 ? 'green' : 'amber';
      return {
        wo: r.name,
        customer: r.customer_name,
        product: r.production_item,
        due: new Date(r.expected_delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        status: r.status,
        completion,
        rag,
      };
    });
  }

  // ── Attendance (W-MH-10 — from HRMS) ────────────────────────────────────────
  private async getAttendance() {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const rows = await this.erpDb.query<{ department: string; status: string; cnt: number }>(
        `SELECT department, status, COUNT(*) AS cnt
         FROM tabAttendance
         WHERE attendance_date = ? AND docstatus = 1
           AND status IN ('Present','Half Day','Absent','On Leave','Work From Home')
         GROUP BY department, status`,
        [today],
      );

      const deptMap: Record<string, { present: number; total: number }> = {};
      let present = 0,
        onLeave = 0,
        total = 0;

      rows.forEach((r) => {
        const dept = r.department.replace(/\s*-\s*PISPL$/i, '').trim();
        if (!deptMap[dept]) deptMap[dept] = { present: 0, total: 0 };
        deptMap[dept].total += r.cnt;
        total += r.cnt;
        if (r.status === 'Present' || r.status === 'Work From Home') {
          deptMap[dept].present += r.cnt;
          present += r.cnt;
        } else if (r.status === 'Half Day') {
          deptMap[dept].present += r.cnt * 0.5;
          present += r.cnt * 0.5;
        } else if (r.status === 'On Leave') {
          onLeave += r.cnt;
        }
      });

      const byDept = Object.entries(deptMap)
        .map(([dept, d]) => ({ dept, present: Math.round(d.present), total: d.total }))
        .sort((a, b) => b.total - a.total);

      const absent = total - present - onLeave;
      return {
        present: Math.round(present),
        absent: Math.round(absent),
        onLeave,
        pct: total > 0 ? Math.round((present / total) * 100) : 0,
        byDept,
      };
    } catch {
      return { present: 0, absent: 0, onLeave: 0, pct: 0, byDept: [] };
    }
  }

  // ── W-MH-13 Quality rejections / rework today ───────────────────────────────
  private async getQualityRejections() {
    const rows = await this.erpDb.query<{
      name: string;
      item_code: string;
      status: string;
      inspection_type: string;
      reference_type: string;
      reference_name: string;
      wo_no: string | null;
    }>(
      `SELECT
         qi.name, qi.item_code, qi.status, qi.inspection_type,
         qi.reference_type, qi.reference_name,
         COALESCE(
           (SELECT se.work_order FROM \`tabStock Entry\` se
            WHERE se.name = qi.reference_name AND qi.reference_type = 'Stock Entry'),
           (SELECT jc.work_order FROM \`tabJob Card\` jc
            WHERE jc.name = qi.reference_name AND qi.reference_type = 'Job Card')
         ) AS wo_no
       FROM \`tabQuality Inspection\` qi
       WHERE qi.report_date = CURDATE()
         AND qi.docstatus = 1
         AND qi.status IN ('Rejected','Rework')
       ORDER BY qi.creation DESC
       LIMIT 10`,
    );

    const rejections = rows.filter((r) => r.status === 'Rejected').length;
    const rework = rows.filter((r) => r.status === 'Rework').length;

    return {
      rejections,
      rework,
      items: rows.map((r) => ({
        wo: r.wo_no ?? `${r.reference_type} ${r.reference_name}`,
        product: r.item_code,
        stage: r.inspection_type ?? '—',
        defect: '—',
        disposition: r.status,
        rag: (r.status === 'Rejected' ? 'red' : 'amber') as 'red' | 'amber',
      })),
    };
  }

  // ── Material Request detail ───────────────────────────────────────────────────
  async getMaterialRequestDetail(mrName: string) {
    const [mrRows, itemRows] = await Promise.all([
      this.erpDb.query<{
        name: string;
        status: string;
        transaction_date: string;
        schedule_date: string;
        requested_by: string;
        purpose: string;
      }>(
        `SELECT name, status, transaction_date, schedule_date, requested_by, purpose
         FROM \`tabMaterial Request\` WHERE name = ? LIMIT 1`,
        [mrName],
      ),
      this.erpDb.query<{ item_code: string; item_name: string; qty: number; received_qty: number; uom: string; eta: string | null }>(
        `SELECT mri.item_code, mri.item_name, mri.qty, mri.received_qty, mri.uom,
                poi.expected_delivery_date AS eta
         FROM \`tabMaterial Request Item\` mri
         LEFT JOIN \`tabPurchase Order Item\` poi
           ON poi.material_request = mri.parent AND poi.material_request_item = mri.name AND poi.docstatus = 1
         WHERE mri.parent = ?
         ORDER BY mri.idx`,
        [mrName],
      ),
    ]);
    if (!mrRows.length) return null;
    const mr = mrRows[0];
    return {
      mr: mr.name,
      status: mr.status,
      purpose: mr.purpose,
      requestDate: mr.transaction_date,
      requiredBy: mr.schedule_date,
      requestedBy: mr.requested_by,
      items: itemRows.map((r) => ({
        itemCode: r.item_code,
        itemName: r.item_name || r.item_code,
        qty: r.qty,
        receivedQty: r.received_qty,
        short: Math.max(0, r.qty - r.received_qty),
        uom: r.uom,
        eta: r.eta ? new Date(r.eta).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—',
      })),
    };
  }

  // ── Work Order detail ────────────────────────────────────────────────────────
  async getWorkOrderDetail(woName: string) {
    const rows = await this.erpDb.query<{
      name: string;
      status: string;
      production_item: string;
      item_name: string;
      qty: number;
      produced_qty: number;
      expected_delivery_date: string;
      sales_order: string;
      customer: string;
      company: string;
      pipeline_stage: string;
      pipeline_stage_name: string;
    }>(
      `SELECT wo.name, wo.status, wo.production_item, wo.item_name,
              wo.qty, wo.produced_qty, wo.expected_delivery_date,
              wo.sales_order, so.customer_name AS customer, wo.company,
              op.stage AS pipeline_stage, op.stage_name AS pipeline_stage_name
       FROM \`tabWork Order\` wo
       LEFT JOIN \`tabSales Order\`    so ON so.name           = wo.sales_order
       LEFT JOIN \`tabOrder Pipeline\` op ON op.sales_order_id = wo.sales_order
       WHERE wo.name = ?
       LIMIT 1`,
      [woName],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      wo: r.name,
      status: r.status,
      product: r.item_name || r.production_item,
      qty: r.qty,
      producedQty: r.produced_qty,
      completion: r.qty > 0 ? Math.round((r.produced_qty / r.qty) * 100) : 0,
      dueDate: r.expected_delivery_date,
      salesOrder: r.sales_order,
      customer: r.customer ?? '—',
      company: r.company,
      stage: r.pipeline_stage_name || r.pipeline_stage || '—',
    };
  }

  // Stage -> WO status mapping (mirrors getPipelineStages tile logic)
  private readonly STAGE_WO_STATUS: Record<string, string[]> = {
    S5: ['Draft', 'Not Started'],
    S6: ['In Process'],
    S7: ['Completed'],
    S8: ['Closed'],
  };
  private readonly PRE_WO_STAGES = new Set(['S1', 'S2', 'S3', 'S4']);

  // ── Pipeline orders by stage ─────────────────────────────────────────────────
  async getPipelineOrdersByStage(stageId: string): Promise<PipelineOrder[]> {
    let rows: Array<{
      sales_order: string;
      customer: string;
      production_item: string;
      expected_delivery_date: string | null;
      wo_status: string | null;
    }>;

    const ALL_STAGES = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'];
    const stageIdx = ALL_STAGES.indexOf(stageId);

    const woStageMap = (status: string, hasDN: number) => {
      if (status === 'Closed') return hasDN ? 'S8' : 'S7';
      if (status === 'Completed') return 'S7';
      if (status === 'In Process') return 'S6';
      return 'S5';
    };

    if (this.PRE_WO_STAGES.has(stageId)) {
      rows = await this.erpDb.query(
        `SELECT
           op.sales_order_id                        AS sales_order,
           COALESCE(so.customer_name, '—')          AS customer,
           '—'                                      AS production_item,
           NULL                                     AS expected_delivery_date,
           NULL                                     AS wo_status
         FROM \`tabOrder Pipeline\` op
         LEFT JOIN \`tabSales Order\` so ON so.name = op.sales_order_id
         LEFT JOIN (
           SELECT DISTINCT sales_order AS so FROM \`tabWork Order\`
           WHERE docstatus < 2 AND status <> 'Cancelled' AND sales_order <> ''
         ) hw ON hw.so = op.sales_order_id
         WHERE op.stage = ? AND hw.so IS NULL
         ORDER BY op.name ASC
         LIMIT 10`,
        [stageId],
      );

      return rows.map((r) => ({
        salesOrder: r.sales_order ?? '—',
        customer: r.customer,
        product: r.production_item,
        dueDate: '—',
        woStatus: '—',
        completedStages: stageIdx > 0 ? ALL_STAGES.slice(0, stageIdx) : [],
        activeStages: [stageId],
      }));
    }

    const statuses = this.STAGE_WO_STATUS[stageId];
    if (!statuses) return [];

    const placeholders = statuses.map(() => '?').join(',');
    const s8Filter =
      stageId === 'S8'
        ? `AND EXISTS (
             SELECT 1 FROM \`tabDelivery Note Item\` di
             JOIN \`tabDelivery Note\` dn ON dn.name = di.parent AND dn.docstatus = 1
             WHERE di.against_sales_order = wo.sales_order
           )`
        : '';

    const woRows = await this.erpDb.query<{
      wo_name: string;
      sales_order: string;
      customer: string;
    }>(
      `SELECT
         wo.name                                    AS wo_name,
         wo.sales_order,
         COALESCE(so.customer_name, '—')            AS customer
       FROM \`tabWork Order\` wo
       LEFT JOIN \`tabSales Order\` so ON so.name = wo.sales_order
       WHERE wo.docstatus < 2
         AND wo.status IN (${placeholders})
         AND wo.sales_order IS NOT NULL AND wo.sales_order <> ''
         ${s8Filter}
       ORDER BY wo.expected_delivery_date ASC
       LIMIT 10`,
      [...statuses],
    );

    const soNames = woRows.map((r) => r.sales_order).filter((s) => s && s !== '');
    const siblingMap: Map<string, string[]> = new Map();

    if (soNames.length > 0) {
      const soPlaceholders = soNames.map(() => '?').join(',');
      const siblings = await this.erpDb.query<{ sales_order: string; status: string; has_dn: number }>(
        `SELECT
           wo.sales_order,
           wo.status,
           EXISTS (
             SELECT 1 FROM \`tabDelivery Note Item\` di
             JOIN \`tabDelivery Note\` dn ON dn.name = di.parent AND dn.docstatus = 1
             WHERE di.against_sales_order = wo.sales_order
           ) AS has_dn
         FROM \`tabWork Order\` wo
         WHERE wo.docstatus < 2 AND wo.status <> 'Cancelled'
           AND wo.sales_order IN (${soPlaceholders})`,
        soNames,
      );
      for (const s of siblings) {
        const stage = woStageMap(s.status, s.has_dn);
        const arr = siblingMap.get(s.sales_order) ?? [];
        if (!arr.includes(stage)) arr.push(stage);
        siblingMap.set(s.sales_order, arr);
      }
    }

    return woRows.map((r) => {
      const activeStages = siblingMap.get(r.sales_order) ?? [stageId];
      const minActiveIdx = Math.min(...activeStages.map((s) => ALL_STAGES.indexOf(s)));
      return {
        salesOrder: r.sales_order,
        customer: r.customer,
        product: '—',
        dueDate: '—',
        woStatus: '—',
        completedStages: minActiveIdx > 0 ? ALL_STAGES.slice(0, minActiveIdx) : [],
        activeStages,
      };
    });
  }

  // ── All pipeline orders (paginated) ──────────────────────────────────────────
  async getAllPipelineOrders(page: number, search = ''): Promise<PipelineOrder[]> {
    const ALL_STAGES = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'];
    const limit = 10;
    const offset = (page - 1) * limit;

    const woStageMap = (status: string, hasDN: number) => {
      if (status === 'Closed') return hasDN ? 'S8' : 'S7';
      if (status === 'Completed') return 'S7';
      if (status === 'In Process') return 'S6';
      return 'S5';
    };

    const searchFilter = search ? `AND (op.sales_order_id LIKE ? OR so.customer_name LIKE ?)` : '';
    const woSearchFilter = search ? `AND (wo.sales_order LIKE ? OR so.customer_name LIKE ?)` : '';
    const s = `%${search}%`;

    const rows = await this.erpDb.query<{ sales_order: string; customer: string; source: string }>(
      `(SELECT op.sales_order_id AS sales_order, COALESCE(so.customer_name,'—') AS customer, 'pre_wo' AS source
        FROM \`tabOrder Pipeline\` op
        LEFT JOIN \`tabSales Order\` so ON so.name = op.sales_order_id
        LEFT JOIN (SELECT DISTINCT sales_order AS s FROM \`tabWork Order\`
                   WHERE docstatus<2 AND status<>'Cancelled' AND sales_order<>'') hw ON hw.s=op.sales_order_id
        WHERE hw.s IS NULL ${searchFilter})
       UNION ALL
       (SELECT DISTINCT wo.sales_order, COALESCE(so.customer_name,'—') AS customer, 'wo' AS source
        FROM \`tabWork Order\` wo
        LEFT JOIN \`tabSales Order\` so ON so.name = wo.sales_order
        WHERE wo.docstatus<2 AND wo.status<>'Cancelled'
          AND wo.sales_order IS NOT NULL AND wo.sales_order<>'' ${woSearchFilter})
       LIMIT ? OFFSET ?`,
      search ? [s, s, s, s, limit, offset] : [limit, offset],
    );

    if (rows.length === 0) return [];

    const soNames = [...new Set(rows.map((r) => r.sales_order))];
    const soPlaceholders = soNames.map(() => '?').join(',');

    const siblings = await this.erpDb.query<{ sales_order: string; status: string; has_dn: number }>(
      `SELECT wo.sales_order, wo.status,
         EXISTS (SELECT 1 FROM \`tabDelivery Note Item\` di
                 JOIN \`tabDelivery Note\` dn ON dn.name=di.parent AND dn.docstatus=1
                 WHERE di.against_sales_order=wo.sales_order) AS has_dn
       FROM \`tabWork Order\` wo
       WHERE wo.docstatus<2 AND wo.status<>'Cancelled'
         AND wo.sales_order IN (${soPlaceholders})`,
      soNames,
    );

    const opStages = await this.erpDb.query<{ sales_order_id: string; stage: string }>(
      `SELECT sales_order_id, stage FROM \`tabOrder Pipeline\`
       WHERE sales_order_id IN (${soPlaceholders})`,
      soNames,
    );

    const siblingMap = new Map<string, string[]>();
    for (const s of siblings) {
      const stage = woStageMap(s.status, s.has_dn);
      const arr = siblingMap.get(s.sales_order) ?? [];
      if (!arr.includes(stage)) arr.push(stage);
      siblingMap.set(s.sales_order, arr);
    }

    const opStageMap = new Map<string, string>();
    for (const o of opStages) opStageMap.set(o.sales_order_id, o.stage);

    return rows.map((r) => {
      const activeStages = siblingMap.get(r.sales_order) ?? [opStageMap.get(r.sales_order) ?? 'S1'];
      const maxActiveIdx = Math.max(...activeStages.map((s) => ALL_STAGES.indexOf(s)));
      return {
        salesOrder: r.sales_order,
        customer: r.customer,
        product: '—',
        dueDate: '—',
        woStatus: '—',
        completedStages: ALL_STAGES.slice(0, maxActiveIdx).filter((s) => !activeStages.includes(s)),
        activeStages,
      };
    });
  }

  // ── Main export ──────────────────────────────────────────────────────────────
  // Cached — same pattern as Stores/Dispatch: several of these queries scan
  // large ERPNext tables, so Redis absorbs the cost across the frontend's
  // 5-minute poll window instead of recomputing on every request.
  async getManufacturingHomepage(): Promise<ManufacturingHomepageData> {
    const cacheKey = 'manufacturing:homepage';
    const cached = await this.cache.get<ManufacturingHomepageData>(cacheKey);
    if (cached) return cached;

    const data = await this.computeManufacturingHomepage();
    await this.cache.set(cacheKey, data, 300);
    return data;
  }

  private async computeManufacturingHomepage(): Promise<ManufacturingHomepageData> {
    const [
      kpis,
      pipelineStages,
      delayedWOs,
      mfgSubStages,
      materialShortages,
      downtime,
      attendance,
      completingThisWeek,
      qualityRejections,
    ] = await Promise.all([
      this.getKpis(),
      this.getPipelineStages(),
      this.getDelayedWOs(),
      this.getMfgSubStages(),
      this.getMaterialShortages(),
      this.getDowntime(),
      this.getAttendance(),
      this.getCompletingThisWeek(),
      this.getQualityRejections(),
    ]);

    const delayedCount = kpis.delayedRed.value;
    return {
      syncedAt: new Date().toISOString(),
      erpBaseUrl: this.erpBaseUrl(),
      alert: delayedCount > 0 ? `${delayedCount} work order${delayedCount > 1 ? 's are' : ' is'} past the delivery date` : '',
      kpis,
      pipelineStages,
      delayedWOs,
      mfgSubStages,
      materialShortages,
      downtime,
      attendance,
      completingThisWeek,
      qualityRejections,
    };
  }
}
