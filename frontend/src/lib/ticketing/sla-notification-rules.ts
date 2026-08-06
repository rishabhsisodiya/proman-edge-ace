import { apiFetch } from "@/lib/api";
import { Role } from "@/lib/auth";

// LEVEL2/LEVEL3 (2026-08-06) — 3-level SLA breach escalation ladder, shared
// between the Response and Resolution ladders (same tiers regardless of
// which clock breached).
export type SlaBreachType = "RESPONSE" | "RESOLUTION" | "LEVEL2" | "LEVEL3";

export interface SlaNotificationRule {
  id: string;
  breachType: SlaBreachType;
  role: Role;
  enabled: boolean;
  updatedAt: string;
}

export const listSlaNotificationRules = () => apiFetch<SlaNotificationRule[]>(`/admin/sla-notification-rules`);

export const setSlaNotificationRule = (breachType: SlaBreachType, role: Role, enabled: boolean) =>
  apiFetch<SlaNotificationRule>(`/admin/sla-notification-rules`, {
    method: "PATCH",
    body: JSON.stringify({ breachType, role, enabled }),
  });
