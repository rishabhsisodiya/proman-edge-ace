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
  warrantyStatus: string;
  warrantyEndDate: string;
}

export const listCustomers = (search?: string) =>
  apiFetch<CustomerListItem[]>(`/customers${search ? `?search=${encodeURIComponent(search)}` : ""}`);

/** §10.1 W-17 Customer List — paginated browse, separate from the combobox's `listCustomers` above. */
export interface CustomerBrowseResult {
  items: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const browseCustomers = (params: {
  search?: string;
  region?: Region;
  accountStatus?: string;
  page?: number;
  pageSize?: number;
}) => {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.region) qs.set("region", params.region);
  if (params.accountStatus) qs.set("accountStatus", params.accountStatus);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const query = qs.toString();
  return apiFetch<CustomerBrowseResult>(`/customers/browse${query ? `?${query}` : ""}`);
};

/** §10.1 W-18 Customer Detail. */
export interface CustomerDetail extends CustomerListItem {
  customerType: string;
  primaryContactName: string;
  primaryContactMobile: string;
  primaryContactEmail: string;
  secondaryContactName: string | null;
  secondaryContactMobile: string | null;
  secondaryContactEmail: string | null;
  billingAddressLine1: string | null;
  billingAddressLine2: string | null;
  billingCity: string | null;
  billingState: string | null;
  billingPin: string | null;
  gstNumber: string | null;
  creditTerms: string | null;
  erpnextCustomerId: string | null;
  lastSyncedAt: string | null;
  sites: CustomerSiteListItem[];
  equipment: EquipmentListItem[];
  tickets: {
    id: string;
    ticketNo: string;
    status: string;
    serviceType: string | null;
    priority: string;
    createdAt: string;
    closedAt: string | null;
  }[];
  amcContracts: { id: string; contractReferenceNo: string; renewalStatus: string; startDate: string; endDate: string }[];
}

export const getCustomer = (id: string) => apiFetch<CustomerDetail>(`/customers/${id}`);

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
