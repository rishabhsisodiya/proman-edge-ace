import { apiFetch } from "@/lib/api";
import { Region } from "./types";

export interface CustomerListItem {
  id: string;
  customerName: string;
  region: Region;
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
