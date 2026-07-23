import { apiFetch } from "@/lib/api";
import { PendingReason, ServiceType, Ticket, TicketStatus } from "./types";

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

export interface CreateTicketInput {
  source: string;
  serviceType?: string;
  priority?: string;
  description: string;
  customerId: string;
  equipmentId?: string;
  subject?: string;
}
export const createTicket = (input: CreateTicketInput) => post<Ticket>(`/tickets`, input);

export const acceptTicket = (id: string) => post<Ticket>(`/tickets/${id}/accept`);
export const rejectTicket = (id: string, reason: string) =>
  post<Ticket & { escalationTier: string }>(`/tickets/${id}/reject`, { reason });
export const reachedSite = (id: string, comment?: string) => post<Ticket>(`/tickets/${id}/reached-site`, { comment });
export const startWorking = (id: string, comment?: string) => post<Ticket>(`/tickets/${id}/start-working`, { comment });
export const markPending = (id: string, pendingReason: PendingReason, pendingNotes?: string) =>
  post<Ticket>(`/tickets/${id}/pending`, { pendingReason, pendingNotes });
export const resumeTicket = (id: string) => post<Ticket>(`/tickets/${id}/resume`);
export const asmResolveTicket = (id: string, comment?: string) => post<Ticket>(`/tickets/${id}/asm-resolve`, { comment });
export const closeTicket = (id: string, comment?: string) => post<Ticket>(`/tickets/${id}/close`, { comment });
export const reopenTicket = (id: string) => post<Ticket>(`/tickets/${id}/reopen`);
export const regularizeTicket = (id: string, targetStatus: TicketStatus, reason: string) =>
  post<Ticket>(`/tickets/${id}/regularize`, { targetStatus, reason });
export const updateServiceType = (id: string, serviceType: ServiceType) =>
  post<Ticket>(`/tickets/${id}/service-type`, { serviceType });
export const resolveDuplicate = (id: string, action: "MERGE" | "DISMISS", reason?: string) =>
  post<Ticket>(`/tickets/${id}/duplicate/resolve`, { action, reason });

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
