import { Injectable } from '@nestjs/common';
import { ErpDbService } from '../../erp/erp-db.service';
import { ErpCacheService } from '../../erp/erp-cache.service';
import { FrappeRpcService } from '../../erp/frappe-rpc.service';
import type {
  StoresHomepageData,
  GrnsPendingToday,
  MaterialIssuesPending,
  StockBelowReorder,
  SubcontractingOrders,
  PendingGrnRow,
  PickListRow,
  StockAlerts,
  StockOutAlertRow,
  BelowReorderNoPoRow,
  ExpectedDeliveryDay,
  SlowMovingStockRow,
  ActionQueue,
  CountVarianceRow,
  GrnRaisedTodayRow,
  WarehouseStockValueRow,
  StoresActionResult,
  PickListsOverdue,
} from './stores.types';

const PICK_LIST_OVERDUE_THRESHOLD_DAYS = 2; // A-STR-R3 — configurable per doc, no settings UI yet

// Single site (PISPL) — this DB connection is already scoped to the one
// manufacturing facility, so unlike Finance there is no company filter / fan-out.

const CACHE_KEY = 'stores:homepage';
const CACHE_TTL = 300; // 5 minutes — matches frontend refreshInterval

@Injectable()
export class StoresService {
  constructor(
    private readonly erpDb: ErpDbService,
    private readonly cache: ErpCacheService,
    private readonly frappe: FrappeRpcService,
  ) {}

  private erpBaseUrl(): string {
    return (process.env.FRAPPE_BASE_URL ?? '').replace(/\/$/, '');
  }

  // ── W-STR-01 — GRNs pending today (KPI) ──────────────────────────────────────
  // v3: draft GRNs (Purchase Receipt, docstatus=0) posted today — GRN-entry-based,
  // not Purchase-Order-based. Replaces the v2 "POs awaiting GRN today" logic.

  private async getGrnsPendingToday(): Promise<GrnsPendingToday> {
    const rows = await this.erpDb.query<{ grns_pending_today: number }>(
      `SELECT COUNT(*) AS grns_pending_today
       FROM \`tabPurchase Receipt\`
       WHERE docstatus = 0 AND is_return = 0
         AND posting_date = CURDATE()`,
    );
    return { count: Number(rows[0]?.grns_pending_today ?? 0) };
  }

  // ── W-STR-02 — Material issues pending (KPI) ─────────────────────────────────
  // Pick List (WO-linked, indexed status), not Material Request — see W-STR-07.

  private async getMaterialIssuesPending(): Promise<MaterialIssuesPending> {
    const rows = await this.erpDb.query<{ material_issues_pending: number }>(
      `SELECT COUNT(*) AS material_issues_pending
       FROM \`tabPick List\`
       WHERE purpose = 'Material Transfer for Manufacture'
         AND status IN ('Open', 'Draft')
         AND docstatus < 2`,
    );
    return { count: Number(rows[0]?.material_issues_pending ?? 0) };
  }

  // ── W-STR-03 — Stock below reorder (KPI) ─────────────────────────────────────

  private async getStockBelowReorder(): Promise<StockBelowReorder> {
    const rows = await this.erpDb.query<{ below_reorder: number; stock_out: number }>(
      `SELECT
          COUNT(*)                        AS below_reorder,
          SUM(IFNULL(b.actual_qty, 0) = 0) AS stock_out
       FROM \`tabItem Reorder\` ir
       LEFT JOIN \`tabBin\` b
           ON b.item_code = ir.parent AND b.warehouse = ir.warehouse
       WHERE ir.warehouse_reorder_level > 0
         AND IFNULL(b.actual_qty, 0) < ir.warehouse_reorder_level`,
    );
    return { belowReorder: Number(rows[0]?.below_reorder ?? 0), stockOut: Number(rows[0]?.stock_out ?? 0) };
  }

  // ── W-STR-04 — Subcontracting orders (KPI) ───────────────────────────────────
  // Replaces "Return Notes Open" (Work Order excess) in v2.

  private async getSubcontractingOrders(fyStart: string, fyEnd: string): Promise<SubcontractingOrders> {
    const [countRows, transferredRows] = await Promise.all([
      this.erpDb.query<{ subcontracting_pending: number }>(
        `SELECT COUNT(*) AS subcontracting_pending
         FROM \`tabSubcontracting Order\` so
         WHERE so.status IN ('Open', 'Draft', 'Material Transferred', 'Partial Material Transferred', 'Partially Received')
           AND so.transaction_date BETWEEN ? AND ?`,
        [fyStart, fyEnd],
      ),
      // Secondary figure (K-04): submitted "Send to Subcontractor" stock entries
      // linked to currently-open SCOs — shown under the count.
      this.erpDb.query<{ material_transferred: number }>(
        `SELECT COUNT(*) AS material_transferred
         FROM \`tabStock Entry\` se
         JOIN \`tabSubcontracting Order\` so ON so.name = se.subcontracting_order
         WHERE se.docstatus = 1 AND se.stock_entry_type = 'Send to Subcontractor'
           AND so.status IN ('Open', 'Material Transferred', 'Partial Material Transferred', 'Partially Received')
           AND so.transaction_date BETWEEN ? AND ?`,
        [fyStart, fyEnd],
      ),
    ]);
    return {
      count: Number(countRows[0]?.subcontracting_pending ?? 0),
      materialTransferred: Number(transferredRows[0]?.material_transferred ?? 0),
    };
  }

  // ── W-STR-06 — Pending GRN list ───────────────────────────────────────────────

  private async getPendingGrnList(): Promise<PendingGrnRow[]> {
    const rows = await this.erpDb.query<{
      grn_no: string;
      vendor: string;
      approval_state: string;
      first_item: string | null;
      item_count: number;
      posting_date: string;
      value: number;
      linked_po: string | null;
    }>(
      `SELECT
          pr.name                              AS grn_no,
          pr.supplier                          AS vendor,
          pr.workflow_state                    AS approval_state,
          COALESCE(fi.item_name, fi.item_code) AS first_item,
          ic.n                                 AS item_count,
          pr.posting_date,
          ROUND(pr.grand_total, 0)             AS value,
          (SELECT pri.purchase_order FROM \`tabPurchase Receipt Item\` pri
           WHERE pri.parent = pr.name AND IFNULL(pri.purchase_order,'') <> '' LIMIT 1) AS linked_po
       FROM \`tabPurchase Receipt\` pr
       LEFT JOIN \`tabPurchase Receipt Item\` fi ON fi.parent = pr.name AND fi.idx = 1
       LEFT JOIN (
           SELECT parent, COUNT(*) AS n FROM \`tabPurchase Receipt Item\` GROUP BY parent
       ) ic ON ic.parent = pr.name
       WHERE pr.docstatus = 0 AND pr.is_return = 0
         AND pr.workflow_state = 'Sent For Approval'
       ORDER BY pr.posting_date ASC`,
    );
    return rows.map((r) => ({
      grnNo: r.grn_no,
      vendor: r.vendor,
      approvalState: r.approval_state,
      firstItem: r.first_item ?? '—',
      itemCount: Number(r.item_count ?? 1),
      postingDate: r.posting_date,
      value: Number(r.value),
      linkedPo: r.linked_po,
    }));
  }

  // ── W-STR-07 — Material issue queue (Pick List) ──────────────────────────────
  // Pick Lists are WO-linked and represent the material to pick/issue; Material
  // Requests were not WO-linked on this data, so the doc moved this to Pick List.

  private async getMaterialIssueQueue(): Promise<PickListRow[]> {
    const rows = await this.erpDb.query<{
      pick_list_id: string;
      wo_id: string | null;
      picked_qty: number;
      required_qty: number;
      status: string;
      pick_date: string;
    }>(
      `SELECT
          pl.name AS pick_list_id,
          pl.work_order AS wo_id,
          ROUND(SUM(pli.picked_qty), 2) AS picked_qty,
          ROUND(SUM(pli.qty), 2) AS required_qty,
          pl.status,
          pl.creation AS pick_date
       FROM \`tabPick List\` pl
       JOIN \`tabPick List Item\` pli ON pli.parent = pl.name
       WHERE pl.purpose = 'Material Transfer for Manufacture'
         AND pl.status IN ('Open', 'Draft')
         AND pl.docstatus < 2
       GROUP BY pl.name, pl.work_order, pl.status, pl.creation
       ORDER BY pl.creation ASC`,
    );
    return rows.map((r) => ({
      pickListId: r.pick_list_id,
      workOrder: r.wo_id,
      pickedQty: Number(r.picked_qty),
      requiredQty: Number(r.required_qty),
      status: r.status,
      pickDate: r.pick_date,
    }));
  }

  // ── W-STR-08 — Stock alerts (2 sections; needs SQL_BIG_SELECTS) ─────────────

  private async getStockOutBlockingProduction(): Promise<StockOutAlertRow[]> {
    const rows = await this.erpDb.queryBigSelect<{
      item_code: string;
      item_name: string;
      work_order: string;
      planned_end: string | null;
      needed_qty: number;
    }>(
      `SELECT
          woi.item_code,
          MAX(it.item_name) AS item_name,
          SUBSTRING_INDEX(
              GROUP_CONCAT(DISTINCT wo.name ORDER BY COALESCE(wo.planned_end_date, wo.planned_start_date) ASC), ',', 1
          ) AS work_order,
          -- planned_end_date is NULL on PISPL WOs (not maintained) — fall back to
          -- planned_start_date per the doc's own note, also needed for A-STR-R2's
          -- "due within 3 days" threshold.
          MIN(COALESCE(wo.planned_end_date, wo.planned_start_date)) AS planned_end,
          SUM(woi.required_qty - woi.transferred_qty) AS needed_qty
       FROM \`tabWork Order Item\` woi
       JOIN \`tabWork Order\` wo ON wo.name = woi.parent
       JOIN \`tabItem\` it ON it.name = woi.item_code
       WHERE wo.docstatus = 1
         AND wo.status IN ('Not Started', 'In Process')
         AND woi.transferred_qty < woi.required_qty
       GROUP BY woi.item_code
       HAVING IFNULL(
           (SELECT SUM(b.actual_qty) FROM \`tabBin\` b WHERE b.item_code = woi.item_code), 0
       ) = 0
       ORDER BY planned_end ASC`,
    );
    return rows.map((r) => ({
      itemCode: r.item_code,
      itemName: r.item_name,
      workOrder: r.work_order || null,
      plannedEnd: r.planned_end,
      neededQty: Number(r.needed_qty),
    }));
  }

  // v3: below-reorder items become an MR→PO action chain — each item gets the
  // open Purchase MR (if any) and the next action to take (Create MR, or
  // Create PO against the existing MR). Needs SQL_BIG_SELECTS (large joins).
  private async getBelowReorderNoOpenPo(): Promise<BelowReorderNoPoRow[]> {
    const rows = await this.erpDb.queryBigSelect<{
      item_code: string;
      item_name: string;
      current_stock: number;
      reorder_level: number;
      warehouse: string;
      is_stockout: number;
      open_mr: string | null;
    }>(
      `SELECT
          ir.parent                  AS item_code, it.item_name,
          IFNULL(b.actual_qty, 0)    AS current_stock,
          ir.warehouse_reorder_level AS reorder_level, ir.warehouse,
          (IFNULL(b.actual_qty,0) = 0) AS is_stockout,
          mr.mr_name                 AS open_mr
       FROM \`tabItem Reorder\` ir
       JOIN \`tabItem\` it ON it.name = ir.parent
       LEFT JOIN \`tabBin\` b ON b.item_code = ir.parent AND b.warehouse = ir.warehouse
       LEFT JOIN (
           SELECT mri.item_code, MIN(mri.parent) AS mr_name
           FROM \`tabMaterial Request Item\` mri
           JOIN \`tabMaterial Request\` mr ON mr.name = mri.parent
           WHERE mr.docstatus < 2 AND mr.material_request_type = 'Purchase'
             AND mr.status IN ('Pending', 'Draft', 'Partially Ordered')
           GROUP BY mri.item_code
       ) mr ON mr.item_code = ir.parent
       WHERE ir.warehouse_reorder_level > 0
         AND IFNULL(b.actual_qty, 0) < ir.warehouse_reorder_level
         AND ir.parent NOT IN (
             -- items with an open PO, computed ONCE (a per-row NOT EXISTS was ~10x slower)
             SELECT DISTINCT poi.item_code FROM \`tabPurchase Order Item\` poi
             JOIN \`tabPurchase Order\` po ON po.name = poi.parent
             WHERE po.status IN ('To Receive', 'To Receive and Bill')
         )
       ORDER BY (IFNULL(b.actual_qty, 0) = 0) DESC, ir.warehouse_reorder_level DESC
       LIMIT 50`,
    );
    return rows.map((r) => ({
      itemCode: r.item_code,
      itemName: r.item_name,
      currentStock: Number(r.current_stock),
      reorderLevel: Number(r.reorder_level),
      warehouse: r.warehouse,
      isStockout: Boolean(r.is_stockout),
      openMr: r.open_mr,
      nextAction: r.open_mr ? ('Create PO against MR' as const) : ('Create MR' as const),
    }));
  }

  private async getStockAlerts(): Promise<StockAlerts> {
    const [stockOutBlockingProduction, belowReorderNoOpenPo] = await Promise.all([
      this.getStockOutBlockingProduction(),
      this.getBelowReorderNoOpenPo(),
    ]);
    return { stockOutBlockingProduction, belowReorderNoOpenPo };
  }

  // ── W-STR-09 — Expected deliveries this week (PO + Subcontracting) ──────────
  // v2: unions Purchase Orders and Subcontracting Orders due in the next 7 days,
  // grouped into counts only — vendor names / ₹ value were dropped from this widget.

  private async getExpectedDeliveries(): Promise<ExpectedDeliveryDay[]> {
    const rows = await this.erpDb.query<{
      delivery_date: string;
      po_count: number;
      subcontracting_count: number;
      total_count: number;
    }>(
      `SELECT
          delivery_date,
          SUM(is_po) AS po_count,
          SUM(is_sco) AS subcontracting_count,
          COUNT(*) AS total_count
       FROM (
           SELECT po.schedule_date AS delivery_date, 1 AS is_po, 0 AS is_sco
           FROM \`tabPurchase Order\` po
           WHERE po.status IN ('To Receive', 'To Receive and Bill')
             AND po.schedule_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 7 DAY
           UNION ALL
           SELECT sco.schedule_date, 0, 1
           FROM \`tabSubcontracting Order\` sco
           WHERE sco.status IN ('Open', 'Material Transferred', 'Partial Material Transferred', 'Partially Received')
             AND sco.schedule_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 7 DAY
       ) d
       GROUP BY delivery_date
       ORDER BY delivery_date ASC`,
    );
    return rows.map((r) => ({
      deliveryDate: r.delivery_date,
      poCount: Number(r.po_count),
      subcontractingCount: Number(r.subcontracting_count),
      totalCount: Number(r.total_count),
    }));
  }

  // ── W-STR-10 — Slow-moving stock ──────────────────────────────────────────────
  // Last movement = MAX(Bin.modified) (a stock posting updates the Bin) — this is
  // now the doc's official query, not a workaround: MAX(posting_date) over the
  // whole Stock Ledger Entry was ~51-60s (867K rows, no usable index); Bin is
  // 71,967 rows → ~0.9s, and returns the same top idle items.

  private async getSlowMovingStock(): Promise<SlowMovingStockRow[]> {
    const rows = await this.erpDb.query<{
      item_code: string;
      item_name: string;
      category: string;
      current_qty: number;
      unit_value: number | null;
      total_value: number;
      last_movement: string;
      days_idle: number;
    }>(
      `SELECT
          b.item_code, it.item_name, it.item_group AS category,
          ROUND(SUM(b.actual_qty), 2)                              AS current_qty,
          ROUND(SUM(b.stock_value) / NULLIF(SUM(b.actual_qty), 0), 2) AS unit_value,
          ROUND(SUM(b.stock_value), 2)                             AS total_value,
          MAX(b.modified)                                          AS last_movement,
          DATEDIFF(CURDATE(), MAX(b.modified))                     AS days_idle
       FROM \`tabBin\` b
       JOIN \`tabItem\` it ON it.name = b.item_code
       WHERE b.actual_qty > 0
       GROUP BY b.item_code
       ORDER BY days_idle DESC
       LIMIT 10`,
    );
    return rows.map((r) => ({
      itemCode: r.item_code,
      itemName: r.item_name,
      category: r.category,
      currentQty: Number(r.current_qty),
      unitValue: Number(r.unit_value ?? 0),
      totalValue: Number(r.total_value),
      lastMovement: r.last_movement,
      daysIdle: Number(r.days_idle),
    }));
  }

  // ── W-STR-11 — Action queue (2 tabs) ─────────────────────────────────────────
  // "Returns Pending" tab removed in v2, per the user.
  // Tab 1: open (draft) Stock Reconciliations where physical count != system stock.

  private async getCountVariances(): Promise<CountVarianceRow[]> {
    const rows = await this.erpDb.query<{
      posting_date: string;
      item_code: string;
      system_qty: number;
      physical_qty: number;
      variance_qty: number;
      variance_value: number;
      reconciliation: string;
    }>(
      `SELECT
          sr.posting_date AS posting_date,
          sri.item_code,
          sri.current_qty AS system_qty,
          sri.qty AS physical_qty,
          ROUND(sri.qty - sri.current_qty, 2) AS variance_qty,
          ROUND(sri.amount_difference, 2) AS variance_value,
          sr.name AS reconciliation
       FROM \`tabStock Reconciliation\` sr
       JOIN \`tabStock Reconciliation Item\` sri ON sri.parent = sr.name
       WHERE sr.docstatus = 0 AND sri.amount_difference <> 0
       ORDER BY ABS(sri.amount_difference) DESC
       LIMIT 50`,
    );
    return rows.map((r) => ({
      postingDate: r.posting_date,
      itemCode: r.item_code,
      systemQty: Number(r.system_qty),
      physicalQty: Number(r.physical_qty),
      varianceQty: Number(r.variance_qty),
      varianceValue: Number(r.variance_value),
      reconciliation: r.reconciliation,
    }));
  }

  // Tab 2: today's submitted Purchase Receipts.

  private async getGrnsRaisedToday(): Promise<GrnRaisedTodayRow[]> {
    const rows = await this.erpDb.query<{
      grn_no: string;
      vendor: string;
      first_item: string | null;
      item_count: number;
      value: number;
      created_by: string;
    }>(
      `SELECT
          pr.name                              AS grn_no,
          pr.supplier                          AS vendor,
          COALESCE(fi.item_name, fi.item_code) AS first_item,
          ic.n                                 AS item_count,
          pr.base_grand_total                  AS value,
          pr.owner                             AS created_by
       FROM \`tabPurchase Receipt\` pr
       LEFT JOIN \`tabPurchase Receipt Item\` fi
           ON fi.parent = pr.name AND fi.idx = 1
       LEFT JOIN (
           SELECT parent, COUNT(*) AS n FROM \`tabPurchase Receipt Item\` GROUP BY parent
       ) ic ON ic.parent = pr.name
       WHERE pr.docstatus = 1
         AND pr.posting_date = CURDATE()
       ORDER BY pr.creation DESC`,
    );
    return rows.map((r) => ({
      grnNo: r.grn_no,
      vendor: r.vendor,
      firstItem: r.first_item ?? '—',
      itemCount: Number(r.item_count ?? 1),
      value: Number(r.value),
      createdBy: r.created_by,
    }));
  }

  private async getActionQueue(): Promise<ActionQueue> {
    const [countVariances, grnsRaisedToday] = await Promise.all([
      this.getCountVariances(),
      this.getGrnsRaisedToday(),
    ]);
    return { countVariances, grnsRaisedToday };
  }

  // ── W-STR-12 — Warehouse stock value ─────────────────────────────────────────

  private async getWarehouseStockValue(): Promise<WarehouseStockValueRow[]> {
    const rows = await this.erpDb.query<{ warehouse: string; items: number; total_qty: number; stock_value: number }>(
      `SELECT
          b.warehouse,
          COUNT(DISTINCT b.item_code)  AS items,
          ROUND(SUM(b.actual_qty), 2)  AS total_qty,
          ROUND(SUM(b.stock_value), 2) AS stock_value
       FROM \`tabBin\` b
       WHERE b.actual_qty <> 0
       GROUP BY b.warehouse
       HAVING stock_value <> 0
       ORDER BY stock_value DESC`,
    );
    return rows.map((r) => ({
      warehouse: r.warehouse,
      items: Number(r.items),
      totalQty: Number(r.total_qty),
      stockValue: Number(r.stock_value),
    }));
  }

  // ── A-STR-R3 — Pick Lists pending/partial beyond threshold (Alert Trigger) ──

  private async getPickListsOverdue(): Promise<PickListsOverdue> {
    const rows = await this.erpDb.query<{ n: number }>(
      `SELECT COUNT(*) AS n
       FROM \`tabPick List\` pl
       WHERE pl.status IN ('Open', 'Draft')
         AND pl.creation < CURDATE() - INTERVAL ? DAY`,
      [PICK_LIST_OVERDUE_THRESHOLD_DAYS],
    );
    return { count: Number(rows[0]?.n ?? 0) };
  }

  // ── Write-backs via Frappe API (proman_edge.api.stores.*) ───────────────────
  // Per Store_Head_SQL_Queries_v3.md: these are "deployed + live-tested" custom
  // whitelisted methods on the ERP side — we only proxy them, no schema/whitelist
  // work of our own. Known failure modes (surfaced via StoresActionResult.error):
  //   submitGrn:            NO_TRANSITION (Draft has no workflow transition yet),
  //                          SUBMIT_FAILED (missing inv_no/test_certificate/inspection_report)
  //   createPoFromMr:        SUPPLIER_REQUIRED, PO_FAILED (non-purchase MR items)

  async submitGrn(grnName: string, action?: string): Promise<StoresActionResult> {
    return this.frappe.post<StoresActionResult>('proman_edge.api.stores.submit_grn', { grn: grnName, action });
  }

  async createMaterialRequest(itemCode: string, qty: number, warehouse?: string): Promise<StoresActionResult> {
    return this.frappe.post<StoresActionResult>('proman_edge.api.stores.create_material_request', {
      item_code: itemCode,
      qty,
      warehouse,
    });
  }

  async createPoFromMr(materialRequest: string, supplier?: string): Promise<StoresActionResult> {
    return this.frappe.post<StoresActionResult>('proman_edge.api.stores.create_po_from_mr', {
      material_request: materialRequest,
      supplier,
    });
  }

  // ── Main homepage aggregate ───────────────────────────────────────────────────
  // Cached — several of these queries run multi-second full scans against large
  // ERPNext tables (e.g. Stock Ledger Entry) on this DB; we cannot add indexes
  // ourselves (schema changes are ERP-side/Shivam's call), so Redis absorbs the
  // cost across the 5-minute frontend poll window instead of recomputing every load.

  private currentFiscalYearRange(): { fyStart: string; fyEnd: string } {
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return { fyStart: `${y}-04-01`, fyEnd: `${y + 1}-03-31` };
  }

  async getStoresHomepage(fyStart?: string, fyEnd?: string): Promise<StoresHomepageData> {
    const fy = fyStart && fyEnd ? { fyStart, fyEnd } : this.currentFiscalYearRange();
    const cacheKey = `${CACHE_KEY}:${fy.fyStart}:${fy.fyEnd}`;

    const cached = await this.cache.get<StoresHomepageData>(cacheKey);
    if (cached) return cached;

    const data = await this.computeStoresHomepage(fy.fyStart, fy.fyEnd);
    await this.cache.set(cacheKey, data, CACHE_TTL);
    return data;
  }

  private async computeStoresHomepage(fyStart: string, fyEnd: string): Promise<StoresHomepageData> {
    const [
      grnsPendingToday,
      materialIssuesPending,
      stockBelowReorder,
      subcontractingOrders,
      pendingGrnList,
      materialIssueQueue,
      stockAlerts,
      expectedDeliveries,
      slowMovingStock,
      actionQueue,
      warehouseStockValue,
      pickListsOverdue,
    ] = await Promise.all([
      this.getGrnsPendingToday(),
      this.getMaterialIssuesPending(),
      this.getStockBelowReorder(),
      this.getSubcontractingOrders(fyStart, fyEnd),
      this.getPendingGrnList(),
      this.getMaterialIssueQueue(),
      this.getStockAlerts(),
      this.getExpectedDeliveries(),
      this.getSlowMovingStock(),
      this.getActionQueue(),
      this.getWarehouseStockValue(),
      this.getPickListsOverdue(),
    ]);

    return {
      syncedAt: new Date().toISOString(),
      erpBaseUrl: this.erpBaseUrl(),
      grnsPendingToday,
      materialIssuesPending,
      stockBelowReorder,
      subcontractingOrders,
      pendingGrnList,
      materialIssueQueue,
      stockAlerts,
      expectedDeliveries,
      slowMovingStock,
      actionQueue,
      warehouseStockValue,
      pickListsOverdue,
    };
  }
}
