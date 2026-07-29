import { apiFetch } from "@/lib/api";
import { TicketStatus } from "./types";

export interface SlaPauseState {
  id: string;
  status: TicketStatus;
  createdAt: string;
}

export const listSlaPauseStates = () => apiFetch<SlaPauseState[]>(`/admin/sla-pause-states`);

export const createSlaPauseState = (status: TicketStatus) =>
  apiFetch<SlaPauseState>(`/admin/sla-pause-states`, { method: "POST", body: JSON.stringify({ status }) });

export const deleteSlaPauseState = (id: string) =>
  apiFetch<void>(`/admin/sla-pause-states/${id}`, { method: "DELETE" });
