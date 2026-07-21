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
}

export const listItems = (search?: string) =>
  apiFetch<ItemListItem[]>(`/items${search ? `?search=${encodeURIComponent(search)}` : ""}`);

export interface CustomerSiteListItem {
  id: string;
  siteName: string;
  city: string;
  state: string;
}

export const sitesForCustomer = (customerId: string) =>
  apiFetch<{ sites: CustomerSiteListItem[] }>(`/customers/${customerId}`).then((c) => c.sites);
