import { apiFetch, ApiError } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api/v1";

export type PartsCoverage = "NONE" | "CONSUMABLES_ONLY" | "ALL_PARTS";

export const PARTS_COVERAGE_LABEL: Record<PartsCoverage, string> = {
  NONE: "None",
  CONSUMABLES_ONLY: "Consumables Only",
  ALL_PARTS: "All Parts",
};

export type RenewalStatus = "ACTIVE" | "RENEWAL_DUE" | "FINAL_NOTICE" | "LAPSED" | "RENEWED";

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
  previousContractId: string | null;
  signedAgreementUrl: string | null;
  termsAndConditions: string | null;
  coveredEquipment?: { id: string; serialNo: string; itemName: string }[];
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

export const createAmcContract = (input: AmcContractFormInput) =>
  apiFetch<AmcContractSaveResult>(`/amc-contracts`, { method: "POST", body: JSON.stringify(input) });

export const updateAmcContract = (id: string, input: AmcContractFormInput) =>
  apiFetch<AmcContractSaveResult>(`/amc-contracts/${id}`, { method: "PATCH", body: JSON.stringify(input) });

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
