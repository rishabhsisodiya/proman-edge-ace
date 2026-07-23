import { apiFetch } from "@/lib/api";

export interface BillingRate {
  id: string;
  level: string;
  hourlyRate: string | number;
  createdAt: string;
  updatedAt: string;
}

export const listBillingRates = () => apiFetch<BillingRate[]>(`/admin/billing-rates`);

export const createBillingRate = (level: string, hourlyRate: number) =>
  apiFetch<BillingRate>(`/admin/billing-rates`, { method: "POST", body: JSON.stringify({ level, hourlyRate }) });

export const updateBillingRate = (id: string, hourlyRate: number) =>
  apiFetch<BillingRate>(`/admin/billing-rates/${id}`, { method: "PATCH", body: JSON.stringify({ hourlyRate }) });

export const deleteBillingRate = (id: string) =>
  apiFetch<void>(`/admin/billing-rates/${id}`, { method: "DELETE" });
