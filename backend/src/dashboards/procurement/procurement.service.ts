import { Injectable } from '@nestjs/common';
import { ErpDbService } from '../../erp/erp-db.service';
import { ErpCacheService } from '../../erp/erp-cache.service';
import { FrappeRpcService } from '../../erp/frappe-rpc.service';
import { ProcurementSnapshotStore } from './procurement-snapshot.store';
import {
  ProcurementHomepageData,
  ProcurementKpis,
  ApprovalQueueItem,
  OverduePO,
  CriticalShortage,
  VendorBar,
  VendorMode,
  SpendGauge,
  SpendCategory,
  ActionQueue,
  ExpectedReceipt,
  AlertBanner,
  PODetail,
  ProcurementActionResult,
  Rag,
  SpendKpiTile,
  SpendModeStat,
} from './procurement.types';

// Ported verbatim (SQL/logic unchanged) from PROMAN/backend/src/services/procurementServiceDB.ts

@Injectable()
export class ProcurementService {
  constructor(
    private readonly erpDb: ErpDbService,
    private readonly cache: ErpCacheService,
    private readonly frappe: FrappeRpcService,
    private readonly snapshotStore: ProcurementSnapshotStore,
  ) {}

  private erpBaseUrl() {
    return (process.env.FRAPPE_BASE_URL ?? '').replace(/\/$/, '');
  }

  private ragFromOverdue(days: number): Rag {
    return days > 7 ? 'red' : days >= 3 ? 'amber' : 'green';
  }

  private ragFromPct(pct: number): Rag {
    return pct > 95 ? 'red' : pct >= 75 ? 'amber' : 'green';
  }

  private fyQuarterLabel(date: Date): string {
    const m = date.getMonth();
    const y = date.getFullYear();
    const fy = m >= 3 ? y : y - 1;
    const q = m >= 3 ? Math.floor((m - 3) / 3) + 1 : 4;
    return `Q${q} FY${String(fy + 1).slice(-2)}`;
  }

  private currentFiscalYearRange(): { fyStart: string; fyEnd: string } {
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return { fyStart: `${y}-04-01`, fyEnd: `${y + 1}-03-31` };
  }

  // ── KPI tiles ────────────────────────────────────────────────────────────────

  private async getKpis(fyStart: string, fyEnd: string): Promise<ProcurementKpis> {
    const now = new Date();
    const month = now.toLocaleString('default', { month: 'long' });
    const year = now.getFullYear();

    const [prsPending, openPOs, overduePOs, criticalStock, spendMtd, spendTrend, budgetAll, poRaisedTrend] = await Promise.all([
      this.erpDb.query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM \`tabPurchase Order\`
         WHERE workflow_state LIKE 'Awaiting%Approval'
           AND transaction_date BETWEEN ? AND ?`,
        [fyStart, fyEnd],
      ),
      this.erpDb.query<{ cnt: number; total: number }>(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(grand_total), 0) AS total
         FROM \`tabPurchase Order\`
         WHERE docstatus = 1 AND status IN ('To Receive', 'To Receive and Bill')
           AND transaction_date BETWEEN ? AND ?`,
        [fyStart, fyEnd],
      ),
      this.erpDb.query<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM \`tabPurchase Order\`
         WHERE docstatus = 1
           AND status IN ('To Receive', 'To Receive and Bill')
           AND schedule_date < CURDATE()
           AND per_received < 100`,
      ),
      this.erpDb.query<{ cnt: number }>(
        `SELECT COUNT(DISTINCT b.item_code) AS cnt
         FROM \`tabBin\` b
         JOIN \`tabItem Reorder\` ir ON ir.parent = b.item_code AND ir.warehouse = b.warehouse
         WHERE ir.warehouse_reorder_level > 0
           AND b.actual_qty < ir.warehouse_reorder_level
           AND EXISTS (
             SELECT 1 FROM \`tabWork Order Item\` woi
             JOIN \`tabWork Order\` wo ON wo.name = woi.parent
               AND wo.docstatus = 1 AND wo.status IN ('Not Started','In Process')
             WHERE woi.item_code = b.item_code
           )`,
      ),
      this.erpDb.query<{ spend: number }>(
        `SELECT COALESCE(SUM(grand_total), 0) AS spend FROM \`tabPurchase Invoice\`
         WHERE docstatus = 1
           AND posting_date BETWEEN DATE_FORMAT(CURDATE(),'%Y-%m-01') AND LAST_DAY(CURDATE())`,
      ),
      this.erpDb.query<{ month: string; spend: number }>(
        `SELECT DATE_FORMAT(posting_date,'%Y-%m') AS month, SUM(grand_total) AS spend
         FROM \`tabPurchase Invoice\`
         WHERE docstatus = 1
           AND posting_date >= DATE_FORMAT(CURDATE() - INTERVAL 11 MONTH,'%Y-%m-01')
         GROUP BY month ORDER BY month`,
      ),
      this.erpDb.query<{ budget: number }>(
        `SELECT COALESCE(SUM(budget_amount), 0) AS budget
         FROM \`tabProcurement Budget\`
         WHERE month = ? AND year = ?`,
        [month, year],
      ),
      this.erpDb.query<{ month: string; cnt: number }>(
        `SELECT DATE_FORMAT(transaction_date,'%Y-%m') AS month, COUNT(*) AS cnt
         FROM \`tabPurchase Order\`
         WHERE docstatus = 1
           AND transaction_date >= DATE_FORMAT(CURDATE() - INTERVAL 11 MONTH,'%Y-%m-01')
         GROUP BY month ORDER BY month`,
      ),
    ]);

    const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function buildSixMonthSlots<T extends { month: string }>(rows: T[], getValue: (r: T) => number): { label: string; value: number }[] {
      const map = new Map(rows.map((r) => [r.month, getValue(r)]));
      const now = new Date();
      return Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return { label: MONTH_LABELS[d.getMonth()], value: map.get(key) ?? 0 };
      });
    }

    const spendSparkFromDB = buildSixMonthSlots(spendTrend, (r) => Math.round(r.spend / 100_000));
    const poProxyTrend = buildSixMonthSlots(poRaisedTrend, (r) => Number(r.cnt));

    const countSpark = async (field: 'prsPending' | 'openPOs' | 'overduePOs' | 'criticalStock') => {
      const fromSnapshot = await this.snapshotStore.getProcurementSparkline(field);
      return fromSnapshot.length >= 6 ? fromSnapshot : poProxyTrend;
    };

    const spentMtd = spendMtd[0].spend;
    const budgetMtd = budgetAll[0].budget;
    const spendPctMtd = budgetMtd > 0 ? Math.round((spentMtd / budgetMtd) * 100) : 0;

    const byMode = await this.buildSpendByMode(spentMtd, budgetMtd, spendPctMtd, month, year, spendSparkFromDB);

    const spend: SpendKpiTile = {
      value: spentMtd,
      budget: budgetMtd,
      pct: spendPctMtd,
      spark: spendSparkFromDB,
      byMode,
    };

    const [prsPendingSpark, openPOsSpark, overduePOsSpark, criticalStockSpark] = await Promise.all([
      countSpark('prsPending'),
      countSpark('openPOs'),
      countSpark('overduePOs'),
      countSpark('criticalStock'),
    ]);

    return {
      prsPending: {
        value: prsPending[0].cnt,
        sub: 'Awaiting approval',
        spark: prsPendingSpark,
      },
      openPOs: {
        value: openPOs[0].cnt,
        openValue: openPOs[0].total,
        sub: `₹${(openPOs[0].total / 1_00_00_000).toFixed(2)} Cr open value`,
        spark: openPOsSpark,
      },
      overduePOs: {
        value: overduePOs[0].cnt,
        sub: 'Past scheduled date',
        spark: overduePOsSpark,
      },
      criticalStock: {
        value: criticalStock[0].cnt,
        sub: 'Below reorder level, WO-linked',
        spark: criticalStockSpark,
      },
      spend,
    };
  }

  private async buildSpendByMode(
    spentMtd: number,
    budgetMtd: number,
    pctMtd: number,
    month: string,
    year: number,
    sixMonthTrend: { label: string; value: number }[],
  ): Promise<Record<string, SpendModeStat>> {
    const now = new Date();
    const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;

    const [qSpend, qBudget, ySpend, yBudget] = await Promise.all([
      this.erpDb.query<{ qtr: number; spend: number }>(
        `SELECT QUARTER(posting_date) AS qtr, SUM(grand_total) AS spend
         FROM \`tabPurchase Invoice\`
         WHERE docstatus = 1
           AND posting_date >= ?
         GROUP BY qtr ORDER BY qtr`,
        [`${fyStart}-04-01`],
      ),
      this.erpDb.query<{ budget: number }>(
        `SELECT COALESCE(SUM(budget_amount), 0) AS budget FROM \`tabProcurement Budget\`
         WHERE year = ?`,
        [year],
      ),
      this.erpDb.query<{ fy: number; spend: number }>(
        `SELECT
           CASE WHEN MONTH(posting_date) >= 4 THEN YEAR(posting_date) ELSE YEAR(posting_date)-1 END AS fy,
           SUM(grand_total) AS spend
         FROM \`tabPurchase Invoice\`
         WHERE docstatus = 1
           AND posting_date >= ?
         GROUP BY fy ORDER BY fy`,
        [`${fyStart - 2}-04-01`],
      ),
      this.erpDb.query<{ year: number; budget: number }>(
        `SELECT year, SUM(budget_amount) AS budget FROM \`tabProcurement Budget\`
         WHERE year >= ?
         GROUP BY year ORDER BY year`,
        [fyStart - 2],
      ),
    ]);

    const qLabels = ['Q1', 'Q2', 'Q3', 'Q4'];
    const qVals = [0, 0, 0, 0];
    const fyQtrMap: Record<number, number> = { 1: 3, 2: 0, 3: 1, 4: 2 };
    for (const r of qSpend) {
      const idx = fyQtrMap[r.qtr];
      if (idx !== undefined) qVals[idx] = Math.round((r.spend / 1_00_00_000) * 100) / 100;
    }
    const qBudgetTotal = qBudget[0].budget;
    const qSpentTotal = qSpend.reduce((s, r) => s + r.spend, 0);
    const qPct = qBudgetTotal > 0 ? Math.round((qSpentTotal / qBudgetTotal) * 100) : 0;
    const curFYQtr = now.getMonth() >= 3 ? Math.floor((now.getMonth() - 3) / 3) : 3;

    const fyBudgetMap = new Map(yBudget.map((r) => [r.year, r.budget]));
    const fySpendRows = ySpend.slice(-3);
    const yLabels = fySpendRows.map((r) => `FY${String(r.fy + 1).slice(-2)}`);
    const yVals = fySpendRows.map((r) => {
      const b = fyBudgetMap.get(r.fy) ?? 0;
      return b > 0 ? Math.round((r.spend / b) * 100) : 0;
    });
    const latestFY = fySpendRows[fySpendRows.length - 1];
    const latestBudget = latestFY ? (fyBudgetMap.get(latestFY.fy) ?? 0) : 0;
    const yPct = latestBudget > 0 && latestFY ? Math.round((latestFY.spend / latestBudget) * 100) : 0;

    return {
      M: {
        label: `${month} MTD`,
        spent: spentMtd,
        budget: budgetMtd,
        pct: pctMtd,
        labels: sixMonthTrend.map((p) => p.label),
        vals: sixMonthTrend.map((p) => p.value),
        cur: sixMonthTrend.length - 1,
      },
      Q: {
        label: this.fyQuarterLabel(now),
        spent: qSpentTotal,
        budget: qBudgetTotal,
        pct: qPct,
        labels: qLabels,
        vals: qVals,
        cur: curFYQtr,
      },
      Y: {
        label: `FY${String(fyStart + 1).slice(-2)} projected`,
        spent: latestFY?.spend ?? 0,
        budget: latestBudget,
        pct: yPct,
        labels: yLabels,
        vals: yVals,
        cur: yLabels.length - 1,
      },
    };
  }

  // ── Approval queue ─────────────────────────────────────────────────────────

  private async getApprovalQueue(): Promise<ApprovalQueueItem[]> {
    const rows = await this.erpDb.query<{
      po_no: string;
      requester: string;
      department: string;
      first_item: string;
      supplier: string;
      required_by: string;
      est_value: number;
      workflow_state: string;
      days_pending: number;
    }>(
      `SELECT
         po.name                                          AS po_no,
         COALESCE(u.full_name, po.owner)                  AS requester,
         COALESCE(e.department, '—')                      AS department,
         COALESCE(fi.item_code, '—')                      AS first_item,
         po.supplier,
         po.schedule_date                                  AS required_by,
         po.grand_total                                    AS est_value,
         po.workflow_state,
         DATEDIFF(CURDATE(), DATE(po.creation))            AS days_pending
       FROM \`tabPurchase Order\` po
       LEFT JOIN \`tabUser\`     u  ON u.name     = po.owner
       LEFT JOIN \`tabEmployee\` e  ON e.user_id  = po.owner
       LEFT JOIN \`tabPurchase Order Item\` fi ON fi.parent = po.name AND fi.idx = 1
       WHERE po.workflow_state = 'Awaiting PM Approval'
       ORDER BY po.creation ASC
       LIMIT 10`,
    );

    return rows.map((r) => {
      const days = Number(r.days_pending);
      const rag: Rag = days > 5 ? 'amber' : 'green';
      return {
        poNo: r.po_no,
        requester: r.requester,
        department: r.department,
        firstItem: r.first_item,
        supplier: r.supplier,
        requiredBy: r.required_by,
        estValue: r.est_value,
        workflowState: r.workflow_state,
        daysPending: days,
        rag,
      };
    });
  }

  // ── Overdue PO tracker ───────────────────────────────────────────────────────

  private async getOverduePOs(): Promise<OverduePO[]> {
    const rows = await this.erpDb.query<{
      po_no: string;
      supplier: string;
      po_value: number;
      schedule_date: string;
      days_overdue: number;
      per_received: number;
      last_followup: string | null;
    }>(
      `SELECT
         po.name                                          AS po_no,
         po.supplier,
         po.grand_total                                   AS po_value,
         po.schedule_date,
         DATEDIFF(CURDATE(), po.schedule_date)            AS days_overdue,
         po.per_received,
         (SELECT MAX(c.creation) FROM \`tabComment\` c
          WHERE c.reference_doctype = 'Purchase Order'
            AND c.reference_name    = po.name
            AND c.comment_type      = 'Comment')          AS last_followup
       FROM \`tabPurchase Order\` po
       WHERE po.docstatus = 1
         AND po.status IN ('To Receive', 'To Receive and Bill')
         AND po.schedule_date < CURDATE()
         AND po.per_received < 100
       ORDER BY days_overdue DESC
       LIMIT 10`,
    );

    return rows.map((r) => ({
      poNo: r.po_no,
      supplier: r.supplier,
      poValue: r.po_value,
      scheduleDate: r.schedule_date,
      daysOverdue: Number(r.days_overdue),
      perReceived: r.per_received,
      lastFollowup: r.last_followup,
      rag: this.ragFromOverdue(Number(r.days_overdue)),
    }));
  }

  // ── Critical material shortage ───────────────────────────────────────────────

  private async getCriticalShortages(): Promise<CriticalShortage[]> {
    const rows = await this.erpDb.query<{
      wo_no: string;
      blocked_item: string;
      required_qty: number;
      available_qty: number;
      shortfall: number;
      planned_end_date: string | null;
      eta_from_po: string | null;
    }>(
      `SELECT
         wo.name                                          AS wo_no,
         woi.item_code                                    AS blocked_item,
         woi.required_qty,
         COALESCE((SELECT SUM(b.actual_qty) FROM \`tabBin\` b
                   WHERE b.item_code = woi.item_code), 0) AS available_qty,
         woi.required_qty - COALESCE((SELECT SUM(b.actual_qty) FROM \`tabBin\` b
                   WHERE b.item_code = woi.item_code), 0) AS shortfall,
         wo.planned_end_date,
         (SELECT MIN(po.schedule_date)
          FROM \`tabPurchase Order Item\` poi
          JOIN \`tabPurchase Order\` po ON po.name = poi.parent
            AND po.docstatus = 1
            AND po.status IN ('To Receive','To Receive and Bill')
          WHERE poi.item_code = woi.item_code)            AS eta_from_po
       FROM \`tabWork Order\` wo
       JOIN \`tabWork Order Item\` woi ON woi.parent = wo.name
       WHERE wo.docstatus = 1
         AND wo.status IN ('Not Started','In Process')
         AND woi.required_qty > COALESCE((SELECT SUM(b.actual_qty) FROM \`tabBin\` b
                                WHERE b.item_code = woi.item_code), 0)
       ORDER BY wo.planned_end_date ASC
       LIMIT 3`,
    );

    const today = Date.now();
    return rows.map((r) => {
      const endMs = r.planned_end_date ? new Date(r.planned_end_date).getTime() : null;
      const daysToEnd = endMs ? Math.ceil((endMs - today) / 86_400_000) : null;
      const rag: Rag = daysToEnd !== null && daysToEnd < 3 ? 'red' : 'amber';
      return {
        woNo: r.wo_no,
        blockedItem: r.blocked_item,
        requiredQty: r.required_qty,
        availableQty: r.available_qty,
        shortfall: r.shortfall,
        plannedEndDate: r.planned_end_date,
        etaFromPO: r.eta_from_po,
        rag,
      };
    });
  }

  // ── Vendor delivery performance ──────────────────────────────────────────────

  private vendorDateFilter(mode: VendorMode): [string, string] {
    const now = new Date();
    const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    if (mode === 'Q') {
      const start = new Date(now);
      start.setMonth(now.getMonth() - 3);
      return [start.toISOString().slice(0, 10), now.toISOString().slice(0, 10)];
    }
    if (mode === 'Y') {
      return [`${fyStart}-04-01`, now.toISOString().slice(0, 10)];
    }
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    return [monthStart, now.toISOString().slice(0, 10)];
  }

  private async getVendorPerformance(): Promise<Record<VendorMode, VendorBar[]>> {
    const fetchMode = async (mode: VendorMode): Promise<VendorBar[]> => {
      const [from, to] = this.vendorDateFilter(mode);
      const rows = await this.erpDb.query<{
        supplier: string;
        total_pos: number;
        received_pos: number;
        on_time_pct: number;
      }>(
        `SELECT
           po.supplier,
           COUNT(*)                                          AS total_pos,
           SUM(r.recd IS NOT NULL)                          AS received_pos,
           ROUND(100 * SUM(r.recd IS NOT NULL AND r.recd <= po.schedule_date)
                 / NULLIF(SUM(r.recd IS NOT NULL), 0), 1)  AS on_time_pct
         FROM \`tabPurchase Order\` po
         LEFT JOIN (
           SELECT pri.purchase_order, MAX(pr.posting_date) AS recd
           FROM \`tabPurchase Receipt Item\` pri
           JOIN \`tabPurchase Receipt\` pr ON pr.name = pri.parent AND pr.docstatus = 1
           GROUP BY pri.purchase_order
         ) r ON r.purchase_order = po.name
         WHERE po.docstatus = 1
           AND po.transaction_date BETWEEN ? AND ?
         GROUP BY po.supplier
         HAVING received_pos >= IF(? = 'M', 1, 3)
         ORDER BY on_time_pct DESC
         LIMIT 10`,
        [from, to, mode],
      );
      return rows.map((r) => {
        const pct = Number(r.on_time_pct ?? 0);
        const rag: Rag = pct >= 85 ? 'green' : pct >= 70 ? 'amber' : 'red';
        return { supplier: r.supplier, totalPOs: Number(r.received_pos), onTimePct: pct, rag };
      });
    };

    const [M, Q, Y] = await Promise.all([fetchMode('M'), fetchMode('Q'), fetchMode('Y')]);
    return { M, Q, Y };
  }

  // ── Spend vs budget gauge ────────────────────────────────────────────────────

  private async getSpendGauge(): Promise<SpendGauge> {
    const now = new Date();
    const month = now.toLocaleString('default', { month: 'long' });
    const year = now.getFullYear();

    const [catSpend, catBudgets, trend] = await Promise.all([
      this.erpDb.query<{ category: string; spend: number }>(
        `SELECT
           CASE
             WHEN poi.item_group = 'Services' THEN 'Services'
             WHEN poi.item_group IN ('Consumable','Tool','Hardware','Fasteners') THEN 'Consumables'
             WHEN poi.item_group IN ('Motor','Electrical','Bought Out/Electrical','Machined Components') THEN 'Capex'
             ELSE 'Raw Material'
           END AS category,
           SUM(poi.amount) AS spend
         FROM \`tabPurchase Invoice Item\` poi
         JOIN \`tabPurchase Invoice\` pi ON pi.name = poi.parent AND pi.docstatus = 1
         WHERE pi.posting_date BETWEEN DATE_FORMAT(CURDATE(),'%Y-%m-01') AND LAST_DAY(CURDATE())
         GROUP BY category`,
      ),
      this.erpDb.query<{ category: string; budget: number }>(
        `SELECT category, SUM(budget_amount) AS budget
         FROM \`tabProcurement Budget\`
         WHERE month = ? AND year = ?
         GROUP BY category`,
        [month, year],
      ),
      this.erpDb.query<{ month: string; spend: number }>(
        `SELECT DATE_FORMAT(posting_date,'%Y-%m') AS month, SUM(grand_total) AS spend
         FROM \`tabPurchase Invoice\`
         WHERE docstatus = 1
           AND posting_date >= DATE_FORMAT(CURDATE() - INTERVAL 11 MONTH,'%Y-%m-01')
         GROUP BY month ORDER BY month`,
      ),
    ]);

    const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const trendMap = new Map(trend.map((r) => [r.month, r.spend]));
    const now6 = new Date();
    const sixMonthTrend = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now6.getFullYear(), now6.getMonth() - 5 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      return { label: MONTH_LABELS[d.getMonth()], value: Math.round((trendMap.get(key) ?? 0) / 1_00_000) };
    });

    const spendMap = new Map(catSpend.map((r) => [r.category, r.spend]));
    const budgetMap = new Map(catBudgets.map((r) => [r.category, r.budget]));

    const DB_CATS = ['Raw Material', 'Consumables', 'Capex', 'Services'] as const;
    const KEY_MAP: Record<string, SpendCategory> = {
      'Raw Material': 'raw',
      Consumables: 'cons',
      Capex: 'capex',
      Services: 'serv',
    };

    const totalSpent = DB_CATS.reduce((s, c) => s + Number(spendMap.get(c) ?? 0), 0);
    const totalBudget = DB_CATS.reduce((s, c) => s + Number(budgetMap.get(c) ?? 0), 0);
    const totalPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

    const categoryBreakdown = {} as SpendGauge['categoryBreakdown'];
    categoryBreakdown['all'] = { spent: totalSpent, budget: totalBudget, pct: totalPct };
    for (const dbCat of DB_CATS) {
      const key = KEY_MAP[dbCat];
      const spent = Number(spendMap.get(dbCat) ?? 0);
      const budget = Number(budgetMap.get(dbCat) ?? 0);
      const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
      categoryBreakdown[key] = { spent, budget, pct };
    }

    return {
      pct: totalPct,
      spent: totalSpent,
      budget: totalBudget,
      rag: this.ragFromPct(totalPct),
      categoryBreakdown,
      sixMonthTrend,
    };
  }

  // ── Action queue ─────────────────────────────────────────────────────────────

  private async getActionQueue(): Promise<ActionQueue> {
    const [grns, followUps, invoices] = await Promise.all([
      this.erpDb.query<{ po_no: string; supplier: string; first_item: string; schedule_date: string; per_received: number }>(
        `SELECT po.name AS po_no, po.supplier, po.schedule_date, po.per_received,
                COALESCE((SELECT poi.item_code FROM \`tabPurchase Order Item\` poi
                          WHERE poi.parent = po.name ORDER BY poi.idx LIMIT 1), '—') AS first_item
         FROM \`tabPurchase Order\` po
         WHERE po.docstatus = 1
           AND po.status IN ('To Receive','To Receive and Bill')
           AND po.schedule_date <= CURDATE()
           AND po.per_received < 100
         ORDER BY po.schedule_date ASC
         LIMIT 10`,
      ),
      this.erpDb.query<{ po_no: string; supplier: string; schedule_date: string; last_followup: string | null; days_overdue: number }>(
        `SELECT
           po.name AS po_no, po.supplier, po.schedule_date,
           DATEDIFF(CURDATE(), po.schedule_date) AS days_overdue,
           (SELECT MAX(c.creation) FROM \`tabComment\` c
            WHERE c.reference_doctype = 'Purchase Order' AND c.reference_name = po.name
              AND c.comment_type = 'Comment') AS last_followup
         FROM \`tabPurchase Order\` po
         WHERE po.docstatus = 1
           AND po.status IN ('To Receive','To Receive and Bill')
           AND po.per_received < 100
         HAVING last_followup IS NULL OR last_followup < CURDATE() - INTERVAL 3 DAY
         ORDER BY last_followup ASC
         LIMIT 10`,
      ),
      this.erpDb.query<{ grn_no: string; supplier: string; grand_total: number; posting_date: string; days_since: number; linked_po: string | null }>(
        `SELECT pr.name AS grn_no, pr.supplier, pr.grand_total, pr.posting_date,
                DATEDIFF(CURDATE(), pr.posting_date) AS days_since,
                (SELECT pri.purchase_order FROM \`tabPurchase Receipt Item\` pri
                 WHERE pri.parent = pr.name AND IFNULL(pri.purchase_order,'') <> '' LIMIT 1) AS linked_po
         FROM \`tabPurchase Receipt\` pr
         WHERE pr.docstatus = 1 AND pr.is_return = 0
           AND pr.status NOT IN ('Closed')
           AND NOT EXISTS (
             SELECT 1 FROM \`tabPurchase Invoice Item\` pii
             WHERE pii.purchase_receipt = pr.name AND pii.docstatus = 1
           )
         ORDER BY pr.posting_date DESC
         LIMIT 10`,
      ),
    ]);

    return {
      grnsPending: grns.map((r) => ({
        poNo: r.po_no,
        supplier: r.supplier,
        firstItem: r.first_item,
        scheduleDate: r.schedule_date,
        perReceived: r.per_received,
      })),
      followUpsDue: followUps.map((r) => ({
        poNo: r.po_no,
        supplier: r.supplier,
        scheduleDate: r.schedule_date,
        lastFollowup: r.last_followup,
        daysOverdue: Number(r.days_overdue),
      })),
      invoicesUnmatched: invoices.map((r) => {
        const days = Number(r.days_since);
        const rag: Rag = days > 30 ? 'red' : days > 7 ? 'amber' : 'green';
        return {
          grnNo: r.grn_no,
          supplier: r.supplier,
          grandTotal: r.grand_total,
          postingDate: r.posting_date,
          daysSince: days,
          linkedPo: r.linked_po,
          rag,
        };
      }),
    };
  }

  // ── Expected receipts this week ──────────────────────────────────────────────

  private async getExpectedReceipts(): Promise<ExpectedReceipt[]> {
    const rows = await this.erpDb.query<{
      supplier: string;
      po_no: string;
      schedule_date: string;
      per_received: number;
      last_followup: string | null;
    }>(
      `SELECT
         po.supplier, po.name AS po_no, po.schedule_date, po.per_received,
         (SELECT MAX(c.creation) FROM \`tabComment\` c
          WHERE c.reference_doctype = 'Purchase Order' AND c.reference_name = po.name
            AND c.comment_type = 'Comment') AS last_followup
       FROM \`tabPurchase Order\` po
       WHERE po.docstatus = 1
         AND po.status IN ('To Receive','To Receive and Bill')
         AND po.schedule_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 7 DAY
         AND po.per_received < 100
       ORDER BY po.schedule_date ASC
       LIMIT 10`,
    );

    const today = new Date();
    return rows.map((r) => {
      const daysUntil = Math.ceil((new Date(r.schedule_date).getTime() - today.getTime()) / 86_400_000);
      const hasRecentFollowup = r.last_followup ? today.getTime() - new Date(r.last_followup).getTime() < 2 * 86_400_000 : false;

      let rag: Rag = 'green';
      if (!hasRecentFollowup && daysUntil <= 2) rag = 'red';
      else if (!hasRecentFollowup) rag = 'amber';

      return {
        supplier: r.supplier,
        poNo: r.po_no,
        scheduleDate: r.schedule_date,
        perReceived: r.per_received,
        lastFollowup: r.last_followup,
        rag,
      };
    });
  }

  // ── Alert engine ─────────────────────────────────────────────────────────────

  private buildAlerts(shortages: CriticalShortage[], approvalQueue: ApprovalQueueItem[], erpBase: string): AlertBanner[] {
    const alerts: AlertBanner[] = [];

    const critical = shortages.filter((s) => s.rag === 'red');
    if (critical.length) {
      const first = critical[0];
      const more = critical.length > 1 ? ` (+${critical.length - 1} more)` : '';
      alerts.push({
        level: 'red',
        message: `Critical shortage: ${first.woNo} — ${first.blockedItem} stock-out. WO ends ${first.plannedEndDate ?? '—'}. Expedite PO today.${more}`,
        erpLink: `${erpBase}/app/work-order?status=["in",["Not Started","In Process"]]`,
      });
    }

    const stalePRs = approvalQueue.filter((p) => p.daysPending > 5);
    if (stalePRs.length) {
      alerts.push({
        level: 'amber',
        message: `${stalePRs.length} PO${stalePRs.length > 1 ? 's' : ''} pending approval for over 5 days.`,
        erpLink: `${erpBase}/app/purchase-order?docstatus=0`,
      });
    }

    return alerts;
  }

  // ── PO detail (for drawer) ───────────────────────────────────────────────────

  async getPODetail(poName: string): Promise<PODetail | null> {
    const [poRows, itemRows] = await Promise.all([
      this.erpDb.query<{
        name: string;
        supplier: string;
        owner: string;
        department: string;
        workflow_state: string;
        grand_total: number;
        schedule_date: string;
        per_received: number;
        last_followup: string | null;
      }>(
        `SELECT
           po.name, po.supplier,
           COALESCE(u.full_name, po.owner)   AS owner,
           COALESCE(e.department, '—')        AS department,
           po.workflow_state, po.grand_total,
           po.schedule_date, po.per_received,
           (SELECT MAX(c.creation) FROM \`tabComment\` c
            WHERE c.reference_doctype = 'Purchase Order' AND c.reference_name = po.name
              AND c.comment_type = 'Comment') AS last_followup
         FROM \`tabPurchase Order\` po
         LEFT JOIN \`tabUser\`     u ON u.name    = po.owner
         LEFT JOIN \`tabEmployee\` e ON e.user_id = po.owner
         WHERE po.name = ? LIMIT 1`,
        [poName],
      ),
      this.erpDb.query<{ item_code: string; item_name: string; qty: number; rate: number; amount: number; uom: string }>(
        `SELECT item_code, item_name, qty, rate, amount, uom
         FROM \`tabPurchase Order Item\`
         WHERE parent = ? ORDER BY idx`,
        [poName],
      ),
    ]);

    if (!poRows.length) return null;
    const po = poRows[0];
    return {
      poNo: po.name,
      supplier: po.supplier,
      requester: po.owner,
      department: po.department,
      workflowState: po.workflow_state,
      grandTotal: po.grand_total,
      scheduleDate: po.schedule_date,
      perReceived: po.per_received,
      lastFollowup: po.last_followup,
      items: itemRows.map((r) => ({
        itemCode: r.item_code,
        itemName: r.item_name,
        qty: r.qty,
        rate: r.rate,
        amount: r.amount,
        uom: r.uom,
      })),
    };
  }

  // ── Write-backs via Frappe API ────────────────────────────────────────────────

  async approvePO(poName: string): Promise<ProcurementActionResult> {
    return this.frappe.post<ProcurementActionResult>('proman_edge.api.procurement.approve_purchase_order', { name: poName });
  }

  async returnPO(poName: string, reason: string): Promise<ProcurementActionResult> {
    return this.frappe.post<ProcurementActionResult>('proman_edge.api.procurement.return_purchase_order', { name: poName, reason });
  }

  async logFollowUp(poName: string, payload: string): Promise<ProcurementActionResult> {
    let subject = 'Follow-up on Purchase Order';
    let message = payload;
    try {
      const parsed = JSON.parse(payload);
      subject = parsed.subject ?? subject;
      message = parsed.message ?? message;
    } catch {
      /* plain string fallback */
    }

    return this.frappe.post<ProcurementActionResult>('proman_edge.api.procurement.log_follow_up', { name: poName, subject, message, send_email: true });
  }

  async makeGRN(poName: string): Promise<ProcurementActionResult> {
    return this.frappe.post<ProcurementActionResult>('proman_edge.api.procurement.make_grn', { name: poName });
  }

  // ── Main homepage aggregate ───────────────────────────────────────────────────

  // Cached — same pattern as Stores/Dispatch: absorbs the query cost across
  // the frontend's 5-minute poll window instead of recomputing every load.
  async getProcurementHomepage(fyStart?: string, fyEnd?: string): Promise<ProcurementHomepageData> {
    const fy = fyStart && fyEnd ? { fyStart, fyEnd } : this.currentFiscalYearRange();
    const cacheKey = `procurement:homepage:${fy.fyStart}:${fy.fyEnd}`;
    const cached = await this.cache.get<ProcurementHomepageData>(cacheKey);
    if (cached) return cached;

    const data = await this.computeProcurementHomepage(fy.fyStart, fy.fyEnd);
    await this.cache.set(cacheKey, data, 300);
    return data;
  }

  private async computeProcurementHomepage(fyStart: string, fyEnd: string): Promise<ProcurementHomepageData> {
    const base = this.erpBaseUrl();
    const fy = { fyStart, fyEnd };

    const [kpis, approvalQueue, overduePOs, criticalShortages, vendorPerformance, spendGauge, actionQueue, expectedReceipts] = await Promise.all([
      this.getKpis(fy.fyStart, fy.fyEnd),
      this.getApprovalQueue(),
      this.getOverduePOs(),
      this.getCriticalShortages(),
      this.getVendorPerformance(),
      this.getSpendGauge(),
      this.getActionQueue(),
      this.getExpectedReceipts(),
    ]);

    const alerts = this.buildAlerts(criticalShortages, approvalQueue, base);

    return {
      syncedAt: new Date().toISOString(),
      erpBaseUrl: base,
      alerts,
      kpis,
      approvalQueue,
      overduePOs,
      criticalShortages,
      vendorPerformance,
      spendGauge,
      actionQueue,
      expectedReceipts,
    };
  }
}
