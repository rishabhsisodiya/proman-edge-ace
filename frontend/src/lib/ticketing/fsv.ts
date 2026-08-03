import { apiFetch, ApiError } from "@/lib/api";
import {
  enqueueFsvAction,
  isNetworkError,
  listQueuedFsvActions,
  removeQueuedFsvAction,
  type QueuedFsvAction,
} from "@/lib/offlineFsvQueue";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api/v1";

/**
 * Ordering guard (2026-08-02 fix) — without this, a later action (e.g.
 * submit) can race ahead of an earlier one still sitting in the queue (e.g.
 * a part added while offline) if connectivity flickers back on between the
 * two, since each action previously only queued itself on its OWN network
 * failure. The server then rejects out-of-order arrivals for reasons that
 * have nothing to do with the actual request (e.g. "log parts consumed" —
 * the part genuinely hadn't synced yet). If anything is already queued for
 * this FSV, every subsequent action queues itself too rather than
 * attempting the network directly, preserving FIFO order regardless of
 * transient online state.
 */
async function hasPendingQueue(fsvId: string): Promise<boolean> {
  return (await listQueuedFsvActions(fsvId)).length > 0;
}

export interface FsvPartConsumed {
  id: string;
  itemCode: string;
  itemName: string;
  qty: string | number;
  uom: string;
  warehouse: string;
  rate: string | number;
  sellingRate: string | number;
  amount: string | number;
}

export interface FsvPhoto {
  id: string;
  url: string;
  caption: string | null;
}

export interface FieldServiceVisit {
  id: string;
  visitNo: string;
  ticketId: string;
  visitNumber: number;
  engineerId: string;
  engineer?: { id: string; fullName: string };
  visitDate: string;
  priceListName: string | null;
  travelStartTime: string | null;
  siteArrivalTime: string | null;
  workStartTime: string | null;
  workEndTime: string | null;
  workPerformed: string | null;
  findingsRootCause: string | null;
  recommendations: string | null;
  customerRepName: string | null;
  customerRepDesignation: string | null;
  customerSignOff: boolean;
  customerSignatureUrl: string | null;
  noPartsUsed: boolean;
  gpsLatAtCheckin: number | null;
  gpsLongAtCheckin: number | null;
  status: "DRAFT" | "SUBMITTED";
  submittedAt: string | null;
  submittedBy: string | null;
  visitReportUrl: string | null;
  parts: FsvPartConsumed[];
  photos: FsvPhoto[];
  ticket?: { id: string; ticketNo: string; serviceType: string | null };
}

export interface FsvUpdateInput {
  travelStartTime?: string;
  siteArrivalTime?: string;
  workStartTime?: string;
  workEndTime?: string;
  workPerformed?: string;
  findingsRootCause?: string;
  recommendations?: string;
  customerRepName?: string;
  customerRepDesignation?: string;
  customerSignOff?: boolean;
  customerSignatureUrl?: string;
  noPartsUsed?: boolean;
  gpsLatAtCheckin?: number;
  gpsLongAtCheckin?: number;
}

export interface FsvPartInput {
  itemCode: string;
  itemName: string;
  qty: number;
  uom: string;
  warehouse: string;
  rate: number;
  sellingRate: number;
}

export interface FsvPartUpdateInput {
  qty?: number;
  warehouse?: string;
  rate?: number;
  sellingRate?: number;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

export const listFsvForTicket = (ticketId: string) =>
  apiFetch<FieldServiceVisit[]>(`/tickets/${ticketId}/fsv`);

export const createFsv = (
  ticketId: string,
  visitDate: string,
  priceListName?: string,
  gpsLatAtCheckin?: number,
  gpsLongAtCheckin?: number,
) => post<FieldServiceVisit>(`/tickets/${ticketId}/fsv`, { visitDate, priceListName, gpsLatAtCheckin, gpsLongAtCheckin });

export const getFsv = (id: string) => apiFetch<FieldServiceVisit>(`/fsv/${id}`);

export const updateFsv = (id: string, input: FsvUpdateInput) =>
  apiFetch<FieldServiceVisit>(`/fsv/${id}`, { method: "PATCH", body: JSON.stringify(input) });

const addFsvPartNow = (id: string, input: FsvPartInput) => post<FsvPartConsumed>(`/fsv/${id}/parts`, input);

/**
 * Offline-queueable (2026-08-02) — a part logged on-site with no signal is
 * queued locally instead of failing outright. Returns `{ queued: true }`
 * instead of the real record when queued; callers must check for this.
 */
export async function addFsvPart(id: string, input: FsvPartInput): Promise<FsvPartConsumed | { queued: true }> {
  if (await hasPendingQueue(id)) {
    await enqueueFsvAction({ id: crypto.randomUUID(), fsvId: id, kind: "part", queuedAt: new Date().toISOString(), body: input });
    return { queued: true };
  }
  try {
    return await addFsvPartNow(id, input);
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    await enqueueFsvAction({ id: crypto.randomUUID(), fsvId: id, kind: "part", queuedAt: new Date().toISOString(), body: input });
    return { queued: true };
  }
}

export const updateFsvPart = (id: string, partId: string, input: FsvPartUpdateInput) =>
  apiFetch<FsvPartConsumed>(`/fsv/${id}/parts/${partId}`, { method: "PATCH", body: JSON.stringify(input) });

export const removeFsvPart = (id: string, partId: string) =>
  apiFetch<void>(`/fsv/${id}/parts/${partId}`, { method: "DELETE" });

export const addFsvPhoto = (id: string, url: string, caption?: string) =>
  post<FsvPhoto>(`/fsv/${id}/photos`, { url, caption });

/**
 * Uploads the actual image file to the backend (stored on-server under
 * uploads/fsv-photos), unlike addFsvPhoto above which just records a URL
 * someone already has. Not routed through apiFetch — that always sets
 * Content-Type: application/json, which breaks multipart boundary handling.
 */
async function uploadFsvPhotoNow(id: string, file: Blob, fileName: string, caption?: string): Promise<FsvPhoto> {
  const formData = new FormData();
  formData.append("file", file, fileName);
  if (caption) formData.append("caption", caption);

  const send = () =>
    fetch(`${API_URL}/fsv/${id}/photos/upload`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

  let res = await send();
  if (res.status === 401) {
    // Access token expired mid-session — same silent-refresh-then-retry
    // apiFetch does for every other call, replicated here since this
    // function can't go through apiFetch (it forces JSON content-type).
    const refreshed = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
    if (refreshed.ok) res = await send();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<FsvPhoto>;
}

/**
 * Offline-queueable (2026-08-02) — a site photo taken with no signal is
 * queued locally (the File itself, IndexedDB stores Blobs natively) instead
 * of failing outright. Returns `{ queued: true }` instead of the real
 * record when queued; callers must check for this.
 */
export async function uploadFsvPhoto(id: string, file: File, caption?: string): Promise<FsvPhoto | { queued: true }> {
  if (await hasPendingQueue(id)) {
    await enqueueFsvAction({ id: crypto.randomUUID(), fsvId: id, kind: "photo", queuedAt: new Date().toISOString(), file, fileName: file.name, caption });
    return { queued: true };
  }
  try {
    return await uploadFsvPhotoNow(id, file, file.name, caption);
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    await enqueueFsvAction({
      id: crypto.randomUUID(),
      fsvId: id,
      kind: "photo",
      queuedAt: new Date().toISOString(),
      file,
      fileName: file.name,
      caption,
    });
    return { queued: true };
  }
}

const submitFsvNow = (id: string) => post<FieldServiceVisit>(`/fsv/${id}/submit`);

/**
 * Offline-queueable (2026-08-02) — the final submit is the highest-stakes
 * write in this flow, so it's queued rather than lost if connectivity drops
 * right at the end of a visit. Returns `{ queued: true }` instead of the
 * real record when queued; callers must check for this.
 */
export async function submitFsv(id: string): Promise<FieldServiceVisit | { queued: true }> {
  const pending = await listQueuedFsvActions(id);
  if (pending.length > 0) {
    // Dedup fix (2026-08-02) — previously every click while a submit was
    // already queued added ANOTHER "submit" action, since the pending-queue
    // check only asked "is anything queued" without checking what. A stuck
    // submit (e.g. failing its own validation on replay) could pile up
    // duplicate queued submits with every retap. Submit is a single
    // terminal action — only ever queue one.
    if (!pending.some((a) => a.kind === "submit")) {
      await enqueueFsvAction({ id: crypto.randomUUID(), fsvId: id, kind: "submit", queuedAt: new Date().toISOString() });
    }
    return { queued: true };
  }
  try {
    return await submitFsvNow(id);
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    await enqueueFsvAction({ id: crypto.randomUUID(), fsvId: id, kind: "submit", queuedAt: new Date().toISOString() });
    return { queued: true };
  }
}

/** Uploads the scanned Service Report file (Ashwath feedback 2026-07-25), mirroring uploadFsvPhoto/uploadFsvSignature. */
export async function uploadFsvReport(id: string, file: File): Promise<FieldServiceVisit> {
  const formData = new FormData();
  formData.append("file", file);

  const send = () =>
    fetch(`${API_URL}/fsv/${id}/report/upload`, {
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
  return res.json() as Promise<FieldServiceVisit>;
}

/** Uploads the captured signature PNG (see SignaturePad) to server-side storage, mirroring uploadFsvPhoto. */
async function uploadFsvSignatureNow(id: string, blob: Blob): Promise<FieldServiceVisit> {
  const formData = new FormData();
  formData.append("file", blob, "signature.png");

  const send = () =>
    fetch(`${API_URL}/fsv/${id}/signature/upload`, {
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
  return res.json() as Promise<FieldServiceVisit>;
}

/**
 * Offline-queueable (2026-08-02) — customer sign-off captured with no
 * signal is queued locally instead of failing outright. Returns
 * `{ queued: true }` instead of the real record when queued; callers must
 * check for this.
 */
export async function uploadFsvSignature(id: string, blob: Blob): Promise<FieldServiceVisit | { queued: true }> {
  if (await hasPendingQueue(id)) {
    await enqueueFsvAction({ id: crypto.randomUUID(), fsvId: id, kind: "signature", queuedAt: new Date().toISOString(), file: blob });
    return { queued: true };
  }
  try {
    return await uploadFsvSignatureNow(id, blob);
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    await enqueueFsvAction({ id: crypto.randomUUID(), fsvId: id, kind: "signature", queuedAt: new Date().toISOString(), file: blob });
    return { queued: true };
  }
}

/**
 * Replay logic (piece 3) — walks this FSV's queued actions in order and
 * replays each against the real network function. Stops at the first
 * failure (network still down, or a real server error) rather than
 * skipping ahead, so nothing replays out of order; whatever's left stays
 * queued for the next attempt.
 */
export async function replayFsvQueue(fsvId: string): Promise<{ replayed: number; remaining: number; error?: string }> {
  const actions = await listQueuedFsvActions(fsvId);
  let replayed = 0;
  let error: string | undefined;
  for (const action of actions) {
    try {
      await replayOne(action);
      await removeQueuedFsvAction(action.id);
      replayed++;
    } catch (err) {
      // Still offline, or a real server error — either way, stop here and
      // leave this + the remaining items queued rather than skip ahead.
      // Surfaced to the caller (2026-08-02) — a real 4xx here means retrying
      // will fail identically forever until the underlying issue (e.g.
      // missing FSV data) is fixed, which is very different from "still
      // offline, will succeed next time" and needs to be visible, not just
      // logged to the console.
      if (isNetworkError(err)) {
        error = "Still offline — will retry automatically once connected.";
      } else if (err instanceof ApiError) {
        const body = err.body as { message?: string | string[] } | null;
        error = Array.isArray(body?.message) ? body!.message.join(", ") : body?.message ?? "Sync failed.";
      } else {
        error = "Sync failed.";
      }
      console.warn("FSV offline queue replay stopped at action", action.id, err);
      break;
    }
  }
  const remaining = (await listQueuedFsvActions(fsvId)).length;
  return { replayed, remaining, error: remaining > 0 ? error : undefined };
}

/** Manually discard a queued action (2026-08-02) — for when a queued item can never succeed as-is (e.g. a submit queued before parts were logged) and needs clearing rather than retrying forever. */
export { removeQueuedFsvAction };

function replayOne(action: QueuedFsvAction): Promise<unknown> {
  switch (action.kind) {
    case "photo":
      return uploadFsvPhotoNow(action.fsvId, action.file, action.fileName, action.caption);
    case "signature":
      return uploadFsvSignatureNow(action.fsvId, action.file);
    case "part":
      return addFsvPartNow(action.fsvId, action.body);
    case "submit":
      return submitFsvNow(action.fsvId);
  }
}

export { listQueuedFsvActions } from "@/lib/offlineFsvQueue";
export type { QueuedFsvAction } from "@/lib/offlineFsvQueue";
