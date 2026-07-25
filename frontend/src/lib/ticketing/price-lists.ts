import { apiFetch } from "@/lib/api";

export interface PriceList {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const listPriceLists = () => apiFetch<PriceList[]>(`/admin/price-lists`);

export const createPriceList = (name: string, isDefault?: boolean) =>
  apiFetch<PriceList>(`/admin/price-lists`, { method: "POST", body: JSON.stringify({ name, isDefault }) });

export const updatePriceList = (id: string, patch: { isDefault?: boolean; isActive?: boolean }) =>
  apiFetch<PriceList>(`/admin/price-lists/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export const deletePriceList = (id: string) =>
  apiFetch<void>(`/admin/price-lists/${id}`, { method: "DELETE" });
