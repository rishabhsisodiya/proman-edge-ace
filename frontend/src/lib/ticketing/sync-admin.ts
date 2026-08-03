import { apiFetch } from "@/lib/api";
import { Region } from "./types";

export interface SyncRun {
  id: string;
  syncType: "SCHEDULED" | "EVENT";
  entity: string;
  erpDoctype: string;
  status: "SUCCESS" | "FAILED" | "PARTIAL";
  errorMessage: string | null;
  payload: { recordsOk?: number; recordsFailed?: number } | null;
  startedAt: string;
  completedAt: string | null;
}

export interface SyncFailure {
  id: string;
  erpnextCustomerId: string;
  attemptCount: number;
  lastError: string;
  firstFailedAt: string;
  lastAttemptAt: string;
}

export interface SyncSkipped {
  id: string;
  erpnextCustomerId: string;
  customerName: string;
  reason: string;
  firstSeenAt: string;
  lastCheckedAt: string;
}

export interface NeedsReviewCustomer {
  id: string;
  customerName: string;
  erpnextCustomerId: string | null;
  region: Region | null;
  reviewReason: string | null;
  lastSyncedAt: string | null;
}

export const getSyncRuns = (entity?: string) =>
  apiFetch<SyncRun[]>(`/admin/sync/runs${entity ? `?entity=${encodeURIComponent(entity)}` : ""}`);

export const getSyncFailures = () => apiFetch<SyncFailure[]>(`/admin/sync/failures`);

export const getSyncSkipped = () => apiFetch<SyncSkipped[]>(`/admin/sync/skipped`);

export const getNeedsReview = () => apiFetch<NeedsReviewCustomer[]>(`/admin/sync/needs-review`);

export interface SyncedEmployee {
  id: string;
  employeeId: string;
  employeeName: string;
  designation: string;
  status: string;
  erpUserId: string | null;
  cellNumber: string | null;
  department: string | null;
  lastSyncedAt: string;
}

export const getSyncEmployees = () => apiFetch<SyncedEmployee[]>(`/admin/sync/employees`);

export interface EquipmentSyncSkipped {
  id: string;
  erpSerialId: string;
  customerName: string;
  reason: string;
  firstSeenAt: string;
  lastCheckedAt: string;
}

export const getEquipmentSkipped = () => apiFetch<EquipmentSyncSkipped[]>(`/admin/sync/equipment-skipped`);

export const retrySyncFailure = (id: string) =>
  apiFetch<{ ok: boolean }>(`/admin/sync/failures/${id}/retry`, { method: "POST" });

/** "View Details" on a Sync Failure — raw ERPNext row as it stands right now (null if deleted/renamed in ERPNext since), alongside the stored failure. */
export interface SyncFailureDetail {
  failure: SyncFailure;
  erpRow: Record<string, unknown> | null;
}

export const getSyncFailureDetail = (id: string) => apiFetch<SyncFailureDetail>(`/admin/sync/failures/${id}`);

export type SyncEntity = "customer" | "item" | "employee" | "equipmentTracking";

/**
 * Triggers the night job. Omit `entity` to run all 4 (Customer, Item,
 * Employee, Equipment Tracking) in sequence, same as the nightly cron.
 * @param force Ignores each sync's watermark and reprocesses every record from
 * scratch — for one-off full resyncs (e.g. after adding new sync logic), not routine use.
 * @param entity Run just this one sync instead of all 4.
 */
export const triggerNightlySync = (force = false, entity?: SyncEntity) =>
  apiFetch<{ ok: boolean }>(`/admin/sync/run`, { method: "POST", body: JSON.stringify({ force, entity }) });
