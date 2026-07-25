import { apiFetch } from "@/lib/api";
import { Region } from "./types";

export interface CustomerListItem {
  id: string;
  customerName: string;
  region: Region | null;
  accountStatus: string;
}

export interface EquipmentListItem {
  id: string;
  serialNo: string;
  itemName: string;
  equipmentCategory: string;
  status: string;
}

export const listCustomers = (search?: string) =>
  apiFetch<CustomerListItem[]>(`/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`);

export const equipmentForCustomer = (customerId: string) =>
  apiFetch<EquipmentListItem[]>(`/customers/${customerId}/equipment`);

export interface ItemListItem {
  itemCode: string;
  itemName: string;
  itemGroup: string;
  uom: string;
  rate?: number | null;
}

export const listItems = (search?: string, priceListName?: string) => {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (priceListName) params.set("priceListName", priceListName);
  const qs = params.toString();
  return apiFetch<ItemListItem[]>(`/items${qs ? `?${qs}` : ""}`);
};

export interface CustomerSiteListItem {
  id: string;
  siteName: string;
  city: string;
  state: string;
}

export const sitesForCustomer = (customerId: string) =>
  apiFetch<{ sites: CustomerSiteListItem[] }>(`/customers/${customerId}`).then((c) => c.sites);
