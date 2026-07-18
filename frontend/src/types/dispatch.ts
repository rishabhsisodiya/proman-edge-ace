// ── Dispatch & Logistics Head homepage (HP-DSP-001) — single site (PISPL) ───
// Source: proman-docs/Dispatch_Head_SQL_Queries_v3.md (widget IDs W-DISP-01..13, alerts A-DISP-01..05)

export interface DispatchStageFlow {
  qcPending: number
  qcCleared: number
  docsPending: number
  docsComplete: number
  vehicleBooked: number
  dispatched: number
}

export interface DispatchPipelineRow {
  dnNo: string
  customerName: string
  product: string
  targetDate: string | null
  blocker: 'QC pending' | 'Customer PO pending' | 'Vehicle pending' | 'Ready'
}

export interface DocumentationChecklist {
  dnNo: string
  customerName: string
  qcCertificate: 'Done' | 'Pending'
  salesInvoiceApproved: 'Done' | 'Pending'
  ewayBillGenerated: 'Done' | 'Pending'
  vehicleBookingConfirmed: 'Done' | 'Pending'
  customerPoVerified: 'Done' | 'Pending'
}

export interface VehicleBookingRow {
  dnNo: string
  customerName: string
  vehicleNo: string | null
  transporterReceiptNo: string | null
}

export interface EwayBillRow {
  ewayBill: string
  linkedDoctype: string
  linkedDoc: string
  party: string
  validUpto: string
  status: 'Expired' | 'Extend (today)' | 'Expiring soon' | 'Valid'
}

export interface DispatchScheduleRow {
  postingDate: string
  dnNo: string
  customerName: string
  destinationCity: string | null
  product: string
  vehicleNo: string | null
}

export interface OnTimeDispatchMonth {
  month: string
  totalDispatches: number
  onTime: number
  onTimePct: number
}

export interface DnToSubmitRow {
  dnNo: string
  customerName: string
  product: string
  targetDate: string | null
  value: number
}

export interface InvoiceAwaitingDispatchRow {
  invoiceNo: string
  customerName: string
  amount: number
  postingDate: string
  firstItem: string
}

export interface DispatchActionQueue {
  dnsToSubmit: DnToSubmitRow[]
  invoicesAwaitingDispatch: InvoiceAwaitingDispatchRow[]
}

export interface CommittedDispatchTodayRow {
  salesOrder: string
  customerName: string
  deliveryDate: string
  value: number
}

export interface WoDelayedRow {
  workOrder: string
  salesOrder: string
  productionItem: string
  expectedDeliveryDate: string
  daysLate: number
}

export interface NoVehicleTargetSoonRow {
  dnNo: string
  customerName: string
  targetDate: string | null
}

export interface DispatchAlerts {
  committedDispatchToday: CommittedDispatchTodayRow[]
  woDelayed: WoDelayedRow[]
  noVehicleTargetSoon: NoVehicleTargetSoonRow[]
  noDispatch3Days: number
}

export interface DispatchHomepageData {
  syncedAt: string
  erpBaseUrl: string
  readyToDispatch: { count: number }
  dispatchBlocked: { count: number }
  dispatchedThisWeek: { count: number; dispatchValue: number }
  ewayBillsExpiring: { expiringWeek: number; expiringToday: number }
  revenuePendingInvoice: { count: number; revenuePending: number }
  stageFlow: DispatchStageFlow
  pipelineTable: DispatchPipelineRow[]
  vehicleBooking: VehicleBookingRow[]
  scheduleThisWeek: DispatchScheduleRow[]
  onTimeDispatch: OnTimeDispatchMonth[]
  actionQueue: DispatchActionQueue
  alerts: DispatchAlerts
}
