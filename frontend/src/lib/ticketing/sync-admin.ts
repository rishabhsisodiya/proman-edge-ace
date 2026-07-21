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

export const retrySyncFailure = (id: string) =>
  apiFetch<{ ok: boolean }>(`/admin/sync/failures/${id}/retry`, { method: "POST" });

/**
 * Triggers the full night job — Customer (+ CustomerSite) then Item — in one go.
 * @param force Ignores each sync's watermark and reprocesses every record from
 * scratch — for one-off full resyncs (e.g. after adding new sync logic), not routine use.
 */
export const triggerNightlySync = (force = false) =>
  apiFetch<{ ok: boolean }>(`/admin/sync/run`, { method: "POST", body: JSON.stringify({ force }) });
