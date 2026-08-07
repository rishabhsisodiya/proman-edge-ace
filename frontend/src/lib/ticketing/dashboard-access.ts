import { apiFetch } from "@/lib/api";
import { Role } from "@/lib/auth";

export interface DashboardRegistryEntry {
  key: string;
  label: string;
}

export interface DashboardAccessRule {
  id: string;
  role: Role;
  dashboardKey: string;
  enabled: boolean;
  updatedAt: string;
}

export const listDashboardAccessRules = () => apiFetch<DashboardAccessRule[]>(`/admin/dashboard-access`);

export const listDashboardRegistry = () => apiFetch<DashboardRegistryEntry[]>(`/admin/dashboard-access/registry`);

export const setDashboardAccessRule = (role: Role, dashboardKey: string, enabled: boolean) =>
  apiFetch<DashboardAccessRule>(`/admin/dashboard-access`, {
    method: "PATCH",
    body: JSON.stringify({ role, dashboardKey, enabled }),
  });
