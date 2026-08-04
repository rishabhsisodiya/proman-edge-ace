import { apiFetch, ApiError } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api/v1";

export type PartsCoverage = "NONE" | "CONSUMABLES_ONLY" | "ALL_PARTS";

export const PARTS_COVERAGE_LABEL: Record<PartsCoverage, string> = {
  NONE: "None",
  CONSUMABLES_ONLY: "Consumables Only",
  ALL_PARTS: "All Parts",
};

export type RenewalStatus = "ACTIVE" | "RENEWAL_DUE" | "FINAL_NOTICE" | "LAPSED" | "RENEWED";

export type VisitStatus = "SCHEDULED_PENDING" | "TICKET_RAISED" | "COMPLETED" | "RESCHEDULED";

export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  SCHEDULED_PENDING: "Scheduled",
  TICKET_RAISED: "Ticket Raised",
  COMPLETED: "Completed",
  RESCHEDULED: "Rescheduled",
};

export interface AmcScheduledVisit {
  id: string;
  contractId: string;
  visitSeqNo: number;
  plannedDate: string;
  equipmentId: string;
  notes: string | null;
  status: VisitStatus;
  linkedTicketId: string | null;
  actualDate: string | null;
}

export interface AmcContractRecord {
  id: string;
  contractReferenceNo: string;
  customerId: string;
  customer?: { id: string; customerName: string };
  startDate: string;
  endDate: string;
  contractValue: string | number;
  visitsIncluded: number;
  partsCoverage: PartsCoverage;
  scopeOfServices: string | null;
  exclusions: string | null;
  renewalStatus: RenewalStatus;
  owningAsmId: string | null;
  owningAsm?: { id: string; fullName: string } | null;
  previousContractId: string | null;
  signedAgreementUrl: string | null;
  termsAndConditions: string | null;
  coveredEquipment?: { id: string; serialNo: string; itemName: string }[];
  scheduledVisits?: AmcScheduledVisit[];
  createdAt: string;
  updatedAt: string;
}

export interface AmcContractFormInput {
  contractReferenceNo: string;
  customerId: string;
  startDate: string;
  endDate: string;
  contractValue: number;
  visitsIncluded: number;
  partsCoverage: PartsCoverage;
  scopeOfServices?: string;
  exclusions?: string;
  owningAsmId?: string;
  previousContractId?: string;
  signedAgreementUrl?: string;
  termsAndConditions?: string;
  coveredEquipmentIds: string[];
  /** One planned date per visit, from the Visit Schedule editor (2026-07-27). */
  visitDates?: string[];
}

export interface OverlapWarning {
  equipmentId: string;
  equipmentSerialNo: string;
  otherContractRefNo: string;
}

export interface AmcContractSaveResult {
  contract: AmcContractRecord;
  overlapWarnings: OverlapWarning[];
}

export const listAmcContracts = (customerId?: string) =>
  apiFetch<AmcContractRecord[]>(`/amc-contracts${customerId ? `?customerId=${customerId}` : ""}`);

export const getAmcContract = (id: string) => apiFetch<AmcContractRecord>(`/amc-contracts/${id}`);

/** §6.1 ASM Dashboard "Today's AMC visits" — region-scoped for ASM, all regions for Manager/Admin. */
export interface TodayAmcVisit {
  id: string;
  plannedDate: string;
  status: string;
  notes: string | null;
  contract: { contractReferenceNo: string; customer: { customerName: string; region: string | null } };
  equipment: { serialNo: string; itemName: string } | null;
}

export const getTodayAmcVisits = () => apiFetch<TodayAmcVisit[]>(`/amc-contracts/today-visits`);

export const createAmcContract = (input: AmcContractFormInput) =>
  apiFetch<AmcContractSaveResult>(`/amc-contracts`, { method: "POST", body: JSON.stringify(input) });

export const updateAmcContract = (id: string, input: AmcContractFormInput) =>
  apiFetch<AmcContractSaveResult>(`/amc-contracts/${id}`, { method: "PATCH", body: JSON.stringify(input) });

/** Contract renewal (2026-08-03) — creates a new contract referencing this one and flips this one to RENEWED. */
export const renewAmcContract = (id: string, input: AmcContractFormInput) =>
  apiFetch<AmcContractSaveResult>(`/amc-contracts/${id}/renew`, { method: "POST", body: JSON.stringify(input) });

export const rescheduleAmcVisit = (visitId: string, plannedDate: string, notes?: string) =>
  apiFetch<AmcScheduledVisit>(`/amc-contracts/scheduled-visits/${visitId}`, {
    method: "PATCH",
    body: JSON.stringify({ plannedDate, notes }),
  });

/** Backfill for a contract with zero scheduled visits yet (2026-07-27). */
export const generateAmcSchedule = (id: string, visitDates: string[]) =>
  apiFetch<AmcContractRecord>(`/amc-contracts/${id}/generate-schedule`, {
    method: "POST",
    body: JSON.stringify({ visitDates }),
  });

/** Covers Visits Included being increased after the schedule already exists. */
export const addAmcVisit = (contractId: string, equipmentId: string, plannedDate: string) =>
  apiFetch<AmcContractRecord>(`/amc-contracts/${contractId}/scheduled-visits`, {
    method: "POST",
    body: JSON.stringify({ equipmentId, plannedDate }),
  });

/** Covers Visits Included being decreased — blocked once a real ticket exists for the visit. */
export const removeAmcVisit = (visitId: string) =>
  apiFetch<AmcContractRecord>(`/amc-contracts/scheduled-visits/${visitId}`, { method: "DELETE" });

/** Uploads the actual contract document file (2026-07-27), mirroring uploadFsvReport. */
export async function uploadAmcContractDocument(id: string, file: File): Promise<AmcContractRecord> {
  const formData = new FormData();
  formData.append("file", file);

  const send = () =>
    fetch(`${API_URL}/amc-contracts/${id}/document/upload`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

  let res = await send();
  if (res.status === 401) {
    const refreshed = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
    if (refreshed.ok) res = await send();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<AmcContractRecord>;
}
