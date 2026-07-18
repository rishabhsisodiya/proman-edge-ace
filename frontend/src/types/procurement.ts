export type Rag = 'red' | 'amber' | 'green'
export type SpendMode = 'M' | 'Q' | 'Y'
export type VendorMode = 'M' | 'Q' | 'Y'
export type SpendCategory = 'all' | 'raw' | 'cons' | 'capex' | 'serv'

export interface SparkPoint {
  label: string
  value: number
}

export interface ProcurementKpiTile {
  value: number
  sub: string
  spark: SparkPoint[]
}

export interface SpendModeStat {
  label: string
  spent: number
  budget: number
  pct: number
  labels: string[]
  vals: number[]
  cur: number
}

export interface SpendKpiTile {
  value: number
  budget: number
  pct: number
  spark: SparkPoint[]
  byMode: Record<SpendMode, SpendModeStat>
}

export interface ProcurementKpis {
  prsPending:    ProcurementKpiTile
  openPOs:       ProcurementKpiTile & { openValue: number }
  overduePOs:    ProcurementKpiTile
  criticalStock: ProcurementKpiTile
  spend:         SpendKpiTile
}

export interface ApprovalQueueItem {
  poNo: string
  requester: string
  department: string
  firstItem: string
  supplier: string
  requiredBy: string
  estValue: number
  workflowState: string
  daysPending: number
  rag: Rag
}

export interface OverduePO {
  poNo: string
  supplier: string
  poValue: number
  scheduleDate: string
  daysOverdue: number
  perReceived: number
  lastFollowup: string | null
  rag: Rag
}

export interface CriticalShortage {
  woNo: string
  blockedItem: string
  requiredQty: number
  availableQty: number
  shortfall: number
  plannedEndDate: string | null
  etaFromPO: string | null
  rag: Rag
}

export interface VendorBar {
  supplier: string
  totalPOs: number
  onTimePct: number
  rag: Rag
}

export interface SpendGauge {
  pct: number
  spent: number
  budget: number
  rag: Rag
  categoryBreakdown: Record<SpendCategory, { spent: number; budget: number; pct: number }>
  sixMonthTrend: SparkPoint[]
}

export interface GrnPendingRow {
  poNo: string
  supplier: string
  firstItem: string
  scheduleDate: string
  perReceived: number
}

export interface FollowUpRow {
  poNo: string
  supplier: string
  scheduleDate: string
  lastFollowup: string | null
  daysOverdue: number
}

export interface InvoiceUnmatchedRow {
  grnNo: string
  supplier: string
  grandTotal: number
  postingDate: string
  daysSince: number
  linkedPo: string | null
  rag: Rag
}

export interface ActionQueue {
  grnsPending:       GrnPendingRow[]
  followUpsDue:      FollowUpRow[]
  invoicesUnmatched: InvoiceUnmatchedRow[]
}

export interface ExpectedReceipt {
  supplier: string
  poNo: string
  scheduleDate: string
  perReceived: number
  lastFollowup: string | null
  rag: Rag
}

export interface AlertBanner {
  level: 'red' | 'amber'
  message: string
  erpLink: string
}

export interface ProcurementHomepageData {
  syncedAt:          string
  erpBaseUrl:        string
  alerts:            AlertBanner[]
  kpis:              ProcurementKpis
  approvalQueue:     ApprovalQueueItem[]
  overduePOs:        OverduePO[]
  criticalShortages: CriticalShortage[]
  vendorPerformance: Record<VendorMode, VendorBar[]>
  spendGauge:        SpendGauge
  actionQueue:       ActionQueue
  expectedReceipts:  ExpectedReceipt[]
}

export interface PODetailItem {
  itemCode: string
  itemName: string
  qty: number
  rate: number
  amount: number
  uom: string
}

export interface PODetail {
  poNo: string
  supplier: string
  requester: string
  department: string
  workflowState: string
  grandTotal: number
  scheduleDate: string
  perReceived: number
  items: PODetailItem[]
  lastFollowup: string | null
}

export interface GrnSummary {
  purchase_order: string
  purchase_receipt: string
  docstatus: number
}

export interface FollowUpSummary {
  purchase_order: string
  comment: string
  logged_at: string
}

export interface ProcurementActionResult {
  ok: boolean
  widget: string
  summary?: string | GrnSummary | FollowUpSummary
  deepLink?: string
  error?: {
    code: string
    message: string
  }
}
