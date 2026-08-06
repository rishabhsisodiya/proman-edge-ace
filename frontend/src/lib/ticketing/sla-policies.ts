import { apiFetch } from "@/lib/api";
import { Priority, ServiceType } from "./types";

export interface SlaPolicy {
  id: string;
  serviceType: ServiceType;
  priority: Priority;
  responseHours: number | null;
  resolutionHours: number | null;
  // 3-level SLA breach escalation ladder (2026-08-06) — cumulative delays
  // after the Response/Resolution breach itself, shared by both ladders.
  level2DelayHours: number | null;
  level3DelayHours: number | null;
  createdAt: string;
  updatedAt: string;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

export const listSlaPolicies = () => apiFetch<SlaPolicy[]>(`/admin/sla-policies`);

export const createSlaPolicy = (
  serviceType: ServiceType,
  priority: Priority,
  responseHours: number,
  resolutionHours: number,
  level2DelayHours?: number,
  level3DelayHours?: number,
) => post<SlaPolicy>(`/admin/sla-policies`, { serviceType, priority, responseHours, resolutionHours, level2DelayHours, level3DelayHours });

export const updateSlaPolicy = (
  id: string,
  responseHours: number,
  resolutionHours: number,
  level2DelayHours?: number,
  level3DelayHours?: number,
) =>
  apiFetch<SlaPolicy>(`/admin/sla-policies/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ responseHours, resolutionHours, level2DelayHours, level3DelayHours }),
  });

export const deleteSlaPolicy = (id: string) => apiFetch<void>(`/admin/sla-policies/${id}`, { method: "DELETE" });
