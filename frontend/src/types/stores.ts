// ── Stores Head homepage (HP-STR-001) — single site (PISPL) ─────────────────

export interface PendingGrnRow {
  grnNo: string
  vendor: string
  approvalState: string
  firstItem: string
  itemCount: number
  postingDate: string
  value: number
  linkedPo: string | null
}

export interface PickListRow {
  pickListId: string
  workOrder: string | null
  pickedQty: number
  requiredQty: number
  status: string
  pickDate: string
}

export interface StockOutAlertRow {
  itemCode: string
  itemName: string
  workOrder: string | null
  plannedEnd: string | null
  neededQty: number
}

export interface BelowReorderNoPoRow {
  itemCode: string
  itemName: string
  currentStock: number
  reorderLevel: number
  warehouse: string
  isStockout: boolean
  openMr: string | null
  nextAction: 'Create MR' | 'Create PO against MR'
}

export interface StockAlerts {
  stockOutBlockingProduction: StockOutAlertRow[]
  belowReorderNoOpenPo: BelowReorderNoPoRow[]
}

export interface ExpectedDeliveryDay {
  deliveryDate: string
  poCount: number
  subcontractingCount: number
  totalCount: number
}

export interface SlowMovingStockRow {
  itemCode: string
  itemName: string
  category: string
  currentQty: number
  unitValue: number
  totalValue: number
  lastMovement: string
  daysIdle: number
}

export interface CountVarianceRow {
  postingDate: string
  itemCode: string
  systemQty: number
  physicalQty: number
  varianceQty: number
  varianceValue: number
  reconciliation: string
}

export interface GrnRaisedTodayRow {
  grnNo: string
  vendor: string
  firstItem: string
  itemCount: number
  value: number
  createdBy: string
}

export interface ActionQueue {
  countVariances: CountVarianceRow[]
  grnsRaisedToday: GrnRaisedTodayRow[]
}

export interface WarehouseStockValueRow {
  warehouse: string
  items: number
  totalQty: number
  stockValue: number
}

export interface StoresActionResult {
  ok: boolean
  widget: string
  summary?: unknown   // doc says preformatted string, but live API sometimes returns
                      // the created doc's fields as an object instead — don't assume shape
  deepLink?: string
  error?: { code: string; message: string }
}

export interface StoresHomepageData {
  syncedAt: string
  erpBaseUrl: string
  grnsPendingToday: { count: number }
  materialIssuesPending: { count: number }
  stockBelowReorder: { belowReorder: number; stockOut: number }
  subcontractingOrders: { count: number; materialTransferred: number }
  pendingGrnList: PendingGrnRow[]
  materialIssueQueue: PickListRow[]
  stockAlerts: StockAlerts
  expectedDeliveries: ExpectedDeliveryDay[]
  slowMovingStock: SlowMovingStockRow[]
  actionQueue: ActionQueue
  warehouseStockValue: WarehouseStockValueRow[]
  pickListsOverdue: { count: number }
}
