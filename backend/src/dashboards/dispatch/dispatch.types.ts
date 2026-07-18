// Ported verbatim from PROMAN/backend/src/types/dispatch.ts
// ── Dispatch & Logistics Head homepage (HP-DSP-001) — single site (PISPL) ───
// Source: proman-docs/Dispatch_Head_SQL_Queries_v3.md (widget IDs W-DISP-01..13, alerts A-DISP-01..05)

// ── W-DISP-01..05 KPIs ───────────────────────────────────────────────────────

export interface ReadyToDispatch {
  count: number;
}

export interface DispatchBlocked {
  count: number;
}

export interface DispatchedThisWeek {
  count: number;
  dispatchValue: number;
}

export interface EwayBillsExpiring {
  expiringWeek: number;
  expiringToday: number;
}

// W-DISP-05: now DN status = 'To Bill', current year, full base_grand_total (not unbilled portion).
export interface RevenuePendingInvoice {
  count: number;
  revenuePending: number;
}

// ── W-DISP-06 Dispatch readiness pipeline (stage-flow + table) — strict QC-first ─

export interface DispatchStageFlow {
  qcPending: number;
  qcCleared: number;
  docsPending: number;
  docsComplete: number;
  vehicleBooked: number;
  dispatched: number;
}

export interface DispatchPipelineRow {
  dnNo: string;
  customerName: string;
  product: string;
  targetDate: string | null;
  blocker: 'QC pending' | 'Customer PO pending' | 'Vehicle pending' | 'Ready';
}

// ── W-DISP-07 Documentation checklist (per Delivery Note) — 5 fields ────────

export interface DocumentationChecklist {
  dnNo: string;
  customerName: string;
  qcCertificate: 'Done' | 'Pending';
  salesInvoiceApproved: 'Done' | 'Pending';
  ewayBillGenerated: 'Done' | 'Pending';
  vehicleBookingConfirmed: 'Done' | 'Pending';
  customerPoVerified: 'Done' | 'Pending';
}

// ── W-DISP-08 Vehicle booking (table) — DN logistics fields, no custom doctype ──

export interface VehicleBookingRow {
  dnNo: string;
  customerName: string;
  vehicleNo: string | null;
  transporterReceiptNo: string | null;
}

// ── W-DISP-10 e-Way bill status (table) — was W-DSP-08 ───────────────────────

export interface EwayBillRow {
  ewayBill: string;
  linkedDoctype: string;
  linkedDoc: string;
  party: string;
  validUpto: string;
  status: 'Expired' | 'Extend (today)' | 'Expiring soon' | 'Valid';
}

// ── W-DISP-09 This week's dispatch schedule — DN-based + destination city ───

export interface DispatchScheduleRow {
  postingDate: string;
  dnNo: string;
  customerName: string;
  destinationCity: string | null;
  product: string;
  vehicleNo: string | null;
}

// ── On-time dispatch % (rolling 3 months) — restored per user request; delay
// reasons list dropped (no backing field, per the v3 doc's original note) ──

export interface OnTimeDispatchMonth {
  month: string;
  totalDispatches: number;
  onTime: number;
  onTimePct: number;
}

// ── W-DISP-11 Action queue (2 tabs) ──────────────────────────────────────────

export interface DnToSubmitRow {
  dnNo: string;
  customerName: string;
  product: string;
  targetDate: string | null;
  value: number;
}

export interface InvoiceAwaitingDispatchRow {
  invoiceNo: string;
  customerName: string;
  amount: number;
  postingDate: string;
  firstItem: string;
}

export interface DispatchActionQueue {
  dnsToSubmit: DnToSubmitRow[];
  invoicesAwaitingDispatch: InvoiceAwaitingDispatchRow[];
}

// ── A-DISP-01..05 Alert triggers ─────────────────────────────────────────────

export interface CommittedDispatchTodayRow {
  salesOrder: string;
  customerName: string;
  deliveryDate: string;
  value: number;
}

export interface WoDelayedRow {
  workOrder: string;
  salesOrder: string;
  productionItem: string;
  expectedDeliveryDate: string;
  daysLate: number;
}

export interface NoVehicleTargetSoonRow {
  dnNo: string;
  customerName: string;
  targetDate: string | null;
}

export interface DispatchAlerts {
  committedDispatchToday: CommittedDispatchTodayRow[]; // A-DISP-01 (red)
  woDelayed: WoDelayedRow[]; // A-DISP-02 (red)
  noVehicleTargetSoon: NoVehicleTargetSoonRow[]; // A-DISP-03 (amber)
  noDispatch3Days: number; // A-DISP-05 (amber) — dispatch count in last 3 days
}

// ── Full homepage payload ─────────────────────────────────────────────────────

export interface DispatchHomepageData {
  syncedAt: string;
  erpBaseUrl: string;
  readyToDispatch: ReadyToDispatch;
  dispatchBlocked: DispatchBlocked;
  dispatchedThisWeek: DispatchedThisWeek;
  ewayBillsExpiring: EwayBillsExpiring;
  revenuePendingInvoice: RevenuePendingInvoice;
  stageFlow: DispatchStageFlow;
  pipelineTable: DispatchPipelineRow[];
  vehicleBooking: VehicleBookingRow[];
  scheduleThisWeek: DispatchScheduleRow[];
  onTimeDispatch: OnTimeDispatchMonth[];
  actionQueue: DispatchActionQueue;
  alerts: DispatchAlerts;
}
