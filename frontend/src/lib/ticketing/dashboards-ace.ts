import { apiFetch } from "@/lib/api";

export interface CsSupportSummary {
  quotationsPendingPo: {
    id: string;
    quotationNo: string;
    customer: string;
    ticketNo: string;
    sentAt: string | null;
    daysWaiting: number | null;
  }[];
  deliveriesPending: {
    id: string;
    ticketId: string | null;
    status: "PENDING" | "PARTIAL";
    ticketNo: string | null;
    customer: string | null;
    quotationNo: string | null;
    deliveryDate: string | null;
  }[];
}

export interface ExecutiveSummary {
  openTicketsCount: number;
  slaCompliancePct: number | null;
  avgMttrHours: number | null;
  revenueMtd: number;
  /** Value of draft (unsubmitted) ERPNext invoices this month — not counted in revenueMtd, shown for pipeline visibility only. */
  revenueMtdPendingDrafts: number;
  csatAvg: number | null;
  amcRenewalsDue: number;
}

export const getCsSupportSummary = () => apiFetch<CsSupportSummary>(`/dashboards-ace/cs-support-summary`);

export const getExecutiveSummary = () => apiFetch<ExecutiveSummary>(`/dashboards-ace/executive-summary`);

/** §10.1 W-05 Manager Dashboard summary. */
export interface ManagerKpiCard {
  kpi: string;
  formula: string;
  current: number | null;
  unit: string;
  target: string;
  breachAlert: string;
  status: "OK" | "BELOW_TARGET" | "BREACHED" | "NO_DATA";
}

export interface RegionalBreakdown {
  region: string;
  total: number;
  byStatus: { status: string; count: number }[];
}

export interface AmcRenewalPipelineRow {
  id: string;
  contractReferenceNo: string;
  customerName: string;
  endDate: string;
  daysRemaining: number;
  renewalStatus: string;
}

export interface TopAtRiskAccount {
  customerId: string;
  customerName: string;
  breachedCount: number;
}

export interface ManagerSummary {
  kpiCards: ManagerKpiCard[];
  revenueMtd: number;
  revenueMtdPendingDrafts: number;
  regionalBreakdown: RegionalBreakdown[];
  amcRenewalPipeline: AmcRenewalPipelineRow[];
  topAtRiskAccounts: TopAtRiskAccount[];
}

export const getManagerSummary = () => apiFetch<ManagerSummary>(`/dashboards-ace/manager-summary`);
