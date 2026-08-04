import { apiFetch } from "@/lib/api";
import { Role } from "@/lib/auth";

export type SlaBreachType = "RESPONSE" | "RESOLUTION";

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
