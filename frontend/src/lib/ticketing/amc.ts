import { apiFetch } from "@/lib/api";

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
