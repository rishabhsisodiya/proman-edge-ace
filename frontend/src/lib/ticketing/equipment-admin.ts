import { apiFetch } from "@/lib/api";
import { Paginated } from "./types";

export type EquipCategory =
  | "CRUSHER"
  | "CONVEYOR"
  | "WAGON_TIPPLER"
  | "STACKER_RECLAIMER"
  | "SCREEN"
  | "DRY_MORTAR"
  | "BULK_RECEPTION"
  | "OTHER";

export const EQUIP_CATEGORY_LABEL: Record<EquipCategory, string> = {
  CRUSHER: "Crusher",
  CONVEYOR: "Conveyor",
  WAGON_TIPPLER: "Wagon Tippler",
  STACKER_RECLAIMER: "Stacker & Reclaimer",
  SCREEN: "Screening & Sizing",
  DRY_MORTAR: "Dry Mortar / Sand",
  BULK_RECEPTION: "Bulk Reception",
  OTHER: "Other",
};

export type EquipStatus = "ACTIVE" | "UNDER_REPAIR" | "DECOMMISSIONED" | "SOLD";

export interface EquipmentRecord {
  id: string;
  serialNo: string;
  itemCode: string;
  itemName: string;
  equipmentCategory: EquipCategory;
  modelNumber: string | null;
  customerId: string;
  customer?: { id: string; customerName: string };
  siteId: string | null;
  site?: { id: string; siteName: string } | null;
  gpsLat: number | null;
  gpsLong: number | null;
  installationDate: string;
  deliveryDate: string | null;
  // ERP Sales Order reference (client request, 2026-08-05) — read-only,
  // sync-sourced only; no manual-entry form field for these.
  salesOrderNo: string | null;
  orderDate: string | null;
  warrantyStartDate: string;
  warrantyEndDate: string;
  warrantyPeriodMonths: number;
  warrantyStatus: string;
  operatingHoursMeter: number | null;
  status: EquipStatus;
  skillTagsRequired: string[];
  notes: string | null;
  amcContracts?: { id: string; contractReferenceNo: string }[];
  quantity?: number | null;
  erpTrackingStatus?: string | null;
  possibleDuplicateOfId?: string | null;
  possibleDuplicateOf?: { id: string; serialNo: string; itemName: string } | null;
  duplicateFlagResolved?: boolean;
}

export interface EquipmentFormInput {
  serialNo: string;
  itemCode: string;
  itemName: string;
  equipmentCategory: EquipCategory;
  modelNumber?: string;
  customerId: string;
  siteId?: string;
  installationDate: string;
  deliveryDate?: string;
  warrantyStartDate: string;
  warrantyEndDate: string;
  warrantyPeriodMonths: number;
  status?: EquipStatus;
  notes?: string;
  amcContractIds?: string[];
}

export const listEquipment = (filters?: { search?: string; customerId?: string; page?: number; pageSize?: number }) => {
  const params = new URLSearchParams();
  if (filters?.search) params.set("search", filters.search);
  if (filters?.customerId) params.set("customerId", filters.customerId);
  if (filters?.page) params.set("page", String(filters.page));
  if (filters?.pageSize) params.set("pageSize", String(filters.pageSize));
  const qs = params.toString();
  return apiFetch<Paginated<EquipmentRecord>>(`/equipment${qs ? `?${qs}` : ""}`);
};

export const getEquipment = (id: string) => apiFetch<EquipmentRecord>(`/equipment/${id}`);

export const createEquipment = (input: EquipmentFormInput) =>
  apiFetch<EquipmentRecord>(`/equipment`, { method: "POST", body: JSON.stringify(input) });

export const updateEquipment = (id: string, input: EquipmentFormInput) =>
  apiFetch<EquipmentRecord>(`/equipment/${id}`, { method: "PATCH", body: JSON.stringify(input) });

export const resolveEquipmentDuplicate = (id: string, action: "MERGE" | "DISMISS") =>
  apiFetch<EquipmentRecord>(`/equipment/${id}/resolve-duplicate`, { method: "POST", body: JSON.stringify({ action }) });
