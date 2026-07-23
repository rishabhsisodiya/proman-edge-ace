import { apiFetch, ApiError } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api/v1";

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
  visitDate: string;
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

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

export const listFsvForTicket = (ticketId: string) =>
  apiFetch<FieldServiceVisit[]>(`/tickets/${ticketId}/fsv`);

export const createFsv = (ticketId: string, visitDate: string) =>
  post<FieldServiceVisit>(`/tickets/${ticketId}/fsv`, { visitDate });

export const getFsv = (id: string) => apiFetch<FieldServiceVisit>(`/fsv/${id}`);

export const updateFsv = (id: string, input: FsvUpdateInput) =>
  apiFetch<FieldServiceVisit>(`/fsv/${id}`, { method: "PATCH", body: JSON.stringify(input) });

export const addFsvPart = (id: string, input: FsvPartInput) => post<FsvPartConsumed>(`/fsv/${id}/parts`, input);

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
export async function uploadFsvPhoto(id: string, file: File, caption?: string): Promise<FsvPhoto> {
  const formData = new FormData();
  formData.append("file", file);
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

export const submitFsv = (id: string) => post<FieldServiceVisit>(`/fsv/${id}/submit`);

/** Uploads the captured signature PNG (see SignaturePad) to server-side storage, mirroring uploadFsvPhoto. */
export async function uploadFsvSignature(id: string, blob: Blob): Promise<FieldServiceVisit> {
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
