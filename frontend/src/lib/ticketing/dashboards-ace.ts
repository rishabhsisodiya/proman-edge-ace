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
  amcRenewalsDue: number;
}

export const getCsSupportSummary = () => apiFetch<CsSupportSummary>(`/dashboards-ace/cs-support-summary`);

export const getExecutiveSummary = () => apiFetch<ExecutiveSummary>(`/dashboards-ace/executive-summary`);
