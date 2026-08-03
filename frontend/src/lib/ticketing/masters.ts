import { apiFetch } from "@/lib/api";
import { Region } from "./types";

export interface CustomerListItem {
  id: string;
  customerName: string;
  region: Region | null;
  accountStatus: string;
  needsReview?: boolean;
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
  needsReview: boolean;
  reviewReason: string | null;
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

/** "Sync from ERP" button on Customer Detail — resyncs this customer, its sites, and its equipment. */
export const syncCustomerFromErp = (id: string) => apiFetch<CustomerDetail>(`/customers/${id}/sync`, { method: "POST" });

export const CUSTOMER_TYPES = ["DIRECT", "DEALER", "OEM_PARTNER", "GOVERNMENT", "PSU"] as const;
export type CustomerTypeValue = (typeof CUSTOMER_TYPES)[number];

export const setCustomerType = (id: string, customerType: CustomerTypeValue) =>
  apiFetch<CustomerDetail>(`/customers/${id}/customer-type`, {
    method: "PATCH",
    body: JSON.stringify({ customerType }),
  });

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

/** Item catalog List page (paginated) — separate from listItems() above, which backs the FSV/Quotation item-picker combobox. */
export interface ItemRecord {
  itemCode: string;
  itemName: string;
  itemGroup: string;
  itemDescription: string | null;
  uom: string;
  standardRate: string | number;
  valuationRate: string | number | null;
  currentStock: number | null;
  minimumStockLevel: number | null;
  lastSyncedAt: string | null;
}

export interface ItemBrowseResult {
  items: ItemRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export const browseItems = (params: { search?: string; itemGroup?: string; page?: number; pageSize?: number }) => {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.itemGroup) qs.set("itemGroup", params.itemGroup);
  if (params.page) qs.set("page", String(params.page));
  if (params.pageSize) qs.set("pageSize", String(params.pageSize));
  const query = qs.toString();
  return apiFetch<ItemBrowseResult>(`/items/browse${query ? `?${query}` : ""}`);
};

export interface ItemWarehouseStockRow {
  id: string;
  warehouse: string;
  actualQty: number;
  valuationRate: string | number | null;
}

export interface ItemDetail extends ItemRecord {
  compatibleEquipmentCategories: string[];
  warehouseStock: ItemWarehouseStockRow[];
  sellingRate: number | null;
}

export const getItem = (itemCode: string) => apiFetch<ItemDetail>(`/items/${encodeURIComponent(itemCode)}`);

/** "Sync from ERP" button on Item Detail — resyncs this item, its warehouse stock, and its price-list rates. */
export const syncItemFromErp = (itemCode: string) =>
  apiFetch<ItemDetail>(`/items/${encodeURIComponent(itemCode)}/sync`, { method: "POST" });

export interface CustomerSiteListItem {
  id: string;
  siteName: string;
  city: string;
  state: string;
}

export const sitesForCustomer = (customerId: string) =>
  apiFetch<{ sites: CustomerSiteListItem[] }>(`/customers/${customerId}`).then((c) => c.sites);
