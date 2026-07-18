// Ported verbatim from PROMAN/backend/src/types/stores.ts
// ── Stores Head homepage (HP-STR-001) — single site (PISPL) ─────────────────
// Source: proman-docs/Store_Head_SQL_Queries_v3.md

// ── W-STR-01..04 KPIs ─────────────────────────────────────────────────────────

export interface GrnsPendingToday {
  count: number;
}

export interface MaterialIssuesPending {
  count: number;
}

export interface StockBelowReorder {
  belowReorder: number;
  stockOut: number;
}

export interface SubcontractingOrders {
  count: number;
  materialTransferred: number;
}

// ── W-STR-06 Pending GRN list (draft + pending-approval GRNs) ───────────────
// v3: rewritten from Purchase Order (awaiting GRN) to actual Purchase Receipt
// (GRN) entries sitting at docstatus=0 — Draft / Pending for Approval / Sent
// For Approval. Row action is a real write-back (submit_grn), not a deep link.

export interface PendingGrnRow {
  grnNo: string;
  vendor: string;
  approvalState: string; // Draft | Pending for Approval | Sent For Approval
  firstItem: string;
  itemCount: number;
  postingDate: string;
  value: number;
  linkedPo: string | null;
}

// ── W-STR-07 Pick List Pending ───────────────────────────────────────────────
// v3: simplified — pick date column, total (required) qty, 2-state pill
// (Pending = nothing picked yet, Partial = some picked). No per-row action.

export interface PickListRow {
  pickListId: string;
  workOrder: string | null;
  pickedQty: number;
  requiredQty: number;
  status: string;
  pickDate: string;
}

// ── W-STR-08 Stock alerts ─────────────────────────────────────────────────────

export interface StockOutAlertRow {
  itemCode: string;
  itemName: string;
  workOrder: string | null;
  plannedEnd: string | null;
  neededQty: number;
}

export interface BelowReorderNoPoRow {
  itemCode: string;
  itemName: string;
  currentStock: number;
  reorderLevel: number;
  warehouse: string;
  isStockout: boolean;
  openMr: string | null;
  nextAction: 'Create MR' | 'Create PO against MR';
}

export interface StockAlerts {
  stockOutBlockingProduction: StockOutAlertRow[];
  belowReorderNoOpenPo: BelowReorderNoPoRow[];
}

// ── W-STR-09 Expected deliveries (PO + Subcontracting) ───────────────────────

export interface ExpectedDeliveryDay {
  deliveryDate: string;
  poCount: number;
  subcontractingCount: number;
  totalCount: number;
}

// ── W-STR-10 Slow-moving stock ────────────────────────────────────────────────

export interface SlowMovingStockRow {
  itemCode: string;
  itemName: string;
  category: string;
  currentQty: number;
  unitValue: number;
  totalValue: number;
  lastMovement: string;
  daysIdle: number;
}

// ── W-STR-11 Action queue (2 tabs) ───────────────────────────────────────────
// "Returns Pending" tab removed in v2, per the user.

export interface CountVarianceRow {
  postingDate: string;
  itemCode: string;
  systemQty: number;
  physicalQty: number;
  varianceQty: number;
  varianceValue: number;
  reconciliation: string;
}

export interface GrnRaisedTodayRow {
  grnNo: string;
  vendor: string;
  firstItem: string;
  itemCount: number;
  value: number;
  createdBy: string;
}

export interface ActionQueue {
  countVariances: CountVarianceRow[];
  grnsRaisedToday: GrnRaisedTodayRow[];
}

// ── W-STR-12 Warehouse stock value ───────────────────────────────────────────

export interface WarehouseStockValueRow {
  warehouse: string;
  items: number;
  totalQty: number;
  stockValue: number;
}

// ── Write-back API responses (proman_edge.api.stores.*) ──────────────────────

export interface StoresActionResult {
  ok: boolean;
  widget: string;
  summary?: unknown; // doc says preformatted string, but live API sometimes returns
  // the created doc's fields as an object instead — don't assume shape
  deepLink?: string;
  error?: {
    code: string;
    message: string;
  };
}

// ── Full homepage payload ─────────────────────────────────────────────────────

// A-STR-R3: Pick Lists (Open/Draft, i.e. not actioned) older than the
// configurable threshold (default 2 days, per Shivam's doc — hardcoded here
// since there's no settings UI anywhere in this app yet).
export interface PickListsOverdue {
  count: number;
}

export interface StoresHomepageData {
  syncedAt: string;
  erpBaseUrl: string;
  grnsPendingToday: GrnsPendingToday;
  materialIssuesPending: MaterialIssuesPending;
  stockBelowReorder: StockBelowReorder;
  subcontractingOrders: SubcontractingOrders;
  pendingGrnList: PendingGrnRow[];
  materialIssueQueue: PickListRow[];
  stockAlerts: StockAlerts;
  expectedDeliveries: ExpectedDeliveryDay[];
  slowMovingStock: SlowMovingStockRow[];
  actionQueue: ActionQueue;
  warehouseStockValue: WarehouseStockValueRow[];
  pickListsOverdue: PickListsOverdue;
}
