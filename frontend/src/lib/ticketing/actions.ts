import { apiFetch, ApiError } from "@/lib/api";
import { CustomerCategory, PendingReason, ServiceType, Ticket, TicketStatus } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api/v1";

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

export interface CreateTicketInput {
  source: string;
  customerCategory?: string;
  serviceType?: string;
  priority?: string;
  description: string;
  customerId: string;
  equipmentId?: string;
  subject?: string;
  slaTargetDate?: string;
}
export const createTicket = (input: CreateTicketInput) => post<Ticket>(`/tickets`, input);

export const acceptTicket = (id: string) => post<Ticket>(`/tickets/${id}/accept`);
export const rejectTicket = (id: string, reason: string) =>
  post<Ticket & { escalationTier: string }>(`/tickets/${id}/reject`, { reason });
export const asmRejectResolution = (id: string, engineerId: string, reason: string) =>
  post<Ticket & { escalationTier: string }>(`/tickets/${id}/reject-resolution`, { engineerId, reason });
export const reachedSite = (id: string, comment?: string, gpsLat?: number, gpsLong?: number) =>
  post<Ticket>(`/tickets/${id}/reached-site`, { comment, gpsLat, gpsLong });
export const startWorking = (id: string, comment?: string) => post<Ticket>(`/tickets/${id}/start-working`, { comment });
export const markPending = (id: string, pendingReason: PendingReason, pendingNotes: string) =>
  post<Ticket>(`/tickets/${id}/pending`, { pendingReason, pendingNotes });
export const resumeTicket = (id: string) => post<Ticket>(`/tickets/${id}/resume`);
// Client feedback (2026-08-01) — separate resolve step, own screen outside
// the FSV form. FSV is still mandatory first; backend rejects this call if
// no FSV for the ticket has been submitted yet.
export const engineerResolve = (id: string, resolutionSummary: string) =>
  post<Ticket>(`/tickets/${id}/engineer-resolve`, { resolutionSummary });
export const asmResolveTicket = (id: string, comment?: string) => post<Ticket>(`/tickets/${id}/asm-resolve`, { comment });
export const closeTicket = (id: string, comment?: string) => post<Ticket>(`/tickets/${id}/close`, { comment });
export const resendCsatSurvey = (id: string) => post<{ ok: boolean }>(`/tickets/${id}/resend-csat`);
export const reopenTicket = (id: string) => post<Ticket>(`/tickets/${id}/reopen`);
export const regularizeTicket = (id: string, targetStatus: TicketStatus, reason: string) =>
  post<Ticket>(`/tickets/${id}/regularize`, { targetStatus, reason });
export const updateServiceType = (id: string, serviceType: ServiceType, slaTargetDate?: string) =>
  post<Ticket>(`/tickets/${id}/service-type`, { serviceType, slaTargetDate });
export const updateCustomerCategory = (id: string, customerCategory: CustomerCategory) =>
  post<Ticket>(`/tickets/${id}/customer-category`, { customerCategory });
export const updateTicketTags = (id: string, tags: string[]) =>
  post<Ticket>(`/tickets/${id}/tags`, { tags });
export const resolveDuplicate = (id: string, action: "MERGE" | "DISMISS", reason?: string) =>
  post<Ticket>(`/tickets/${id}/duplicate/resolve`, { action, reason });

export interface BulkImportResult {
  total: number;
  succeeded: number;
  failed: number;
  results: { row: number; ticketNo?: string; error?: string }[];
}

/** Not routed through apiFetch — that forces Content-Type: application/json, which breaks multipart. */
export async function bulkImportTickets(file: File): Promise<BulkImportResult> {
  const formData = new FormData();
  formData.append("file", file);

  const send = () => fetch(`${API_URL}/tickets/bulk-import`, { method: "POST", credentials: "include", body: formData });

  let res = await send();
  if (res.status === 401) {
    const refreshed = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
    if (refreshed.ok) res = await send();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<BulkImportResult>;
}

export interface EngineerCandidate {
  id: string;
  fullName: string;
  skillTags: string[];
  openLoad: number;
  territoryMatch: boolean;
  skillMatch: boolean;
}

export const assignTicket = (id: string, engineerId: string) =>
  post<Ticket>(`/tickets/${id}/assign`, { engineerId });

export const retryAutoRouting = (id: string) => post<Ticket>(`/tickets/${id}/retry-routing`);

export const engineerCandidates = (region?: string) =>
  apiFetch<EngineerCandidate[]>(`/users/engineer-candidates${region ? `?region=${region}` : ""}`);

export interface TicketAuditEntry {
  id: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  changedByUserId: string;
  changedByName: string;
  changedAt: string;
}

export const ticketTimeline = (id: string) => apiFetch<TicketAuditEntry[]>(`/tickets/${id}/timeline`);
export const getTicket = (id: string) => apiFetch<Ticket>(`/tickets/${id}`);
