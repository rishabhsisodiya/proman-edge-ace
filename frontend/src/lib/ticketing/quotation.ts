import { apiFetch, ApiError } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api/v1";

export type QuotationStatus =
  | "DRAFT"
  | "SENT"
  | "CUSTOMER_ACCEPTED"
  | "PO_RECEIVED"
  | "CONVERTED_TO_SALES_ORDER"
  | "EXPIRED"
  | "CANCELLED";

export type DeliveryStatus = "PENDING" | "PARTIAL" | "DELIVERED";

export interface QuotationItem {
  id: string;
  itemCode: string;
  itemName: string;
  qty: string | number;
  uom: string;
  unitPrice: string | number;
  taxAmount: string | number;
  lineTotal: string | number;
  priceListName?: string | null;
}

export interface Delivery {
  id: string;
  quotationId: string | null;
  ticketId: string | null;
  erpnextSalesOrderId: string | null;
  erpnextSyncNote: string | null;
  erpnextDeliveryNoteId: string | null;
  deliveryDate: string | null;
  status: DeliveryStatus;
  trackingNotes: string | null;
}

export interface Quotation {
  id: string;
  quotationNo: string;
  ticketId: string;
  customerId: string;
  createdByUserId: string;
  createdByUser?: { id: string; fullName: string };
  quotationDate: string;
  deliveryStatus: DeliveryStatus;
  validUntil: string;
  labourCharges: string | number | null;
  subtotal: string | number | null;
  taxAmount: string | number | null;
  grandTotal: string | number | null;
  notesToCustomer: string | null;
  termsAndConditions: string | null;
  status: QuotationStatus;
  sentAt: string | null;
  customerPoNumber: string | null;
  customerPoDate: string | null;
  customerPoDocUrl: string | null;
  erpnextQuotationId: string | null;
  erpnextSalesOrderId: string | null;
  erpnextDeliveryNoteId: string | null;
  erpnextInvoiceId: string | null;
  items: QuotationItem[];
  deliveries?: Delivery[];
  customer?: { id: string; customerName: string };
  ticket?: { id: string; ticketNo: string; status: string };
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

export interface Chargeability {
  chargeable: boolean;
  reason: "WARRANTY" | "AMC" | null;
  warrantyEndDate: string | null;
  amcContractRef: string | null;
  amcEndDate: string | null;
}

export const isTicketChargeable = (ticketId: string) =>
  apiFetch<Chargeability>(`/tickets/${ticketId}/chargeable`);

export const listQuotationsForTicket = (ticketId: string) =>
  apiFetch<Quotation[]>(`/tickets/${ticketId}/quotations`);

export const listDeliveriesForTicket = (ticketId: string) =>
  apiFetch<Delivery[]>(`/tickets/${ticketId}/deliveries`);

export const createQuotation = (
  ticketId: string,
  input: {
    validUntil: string;
    labourCharges?: number;
    notesToCustomer?: string;
    termsAndConditions?: string;
    priceListName?: string;
  },
) => post<Quotation>(`/tickets/${ticketId}/quotation`, input);

export const createDirectSalesOrder = (ticketId: string) =>
  post<Delivery>(`/tickets/${ticketId}/direct-sales-order`);

export const retryDirectSalesOrderErpSync = (deliveryId: string) =>
  post<Delivery>(`/deliveries/${deliveryId}/retry-erpnext`);

// Warranty Cost Tracker mechanism (client-confirmed 2026-08-01) — the
// direct-path equivalent of createInvoiceFromQuotation, since a direct
// (warranty/AMC) Sales Order has no Quotation to key off. Creates a
// zero-rate Sales Invoice from the (real-rate) direct Sales Order.
export const createDirectInvoice = (ticketId: string) => post<{ id: string; erpnextInvoiceId: string }>(`/tickets/${ticketId}/direct-invoice`);

export const getQuotation = (id: string) => apiFetch<Quotation>(`/quotations/${id}`);

export const updateQuotation = (
  id: string,
  input: { validUntil?: string; labourCharges?: number; notesToCustomer?: string; termsAndConditions?: string },
) => apiFetch<Quotation>(`/quotations/${id}`, { method: "PATCH", body: JSON.stringify(input) });

// Customer PO capture (client decision, 2026-08-01: manual entry in ACE, not
// synced from ERPNext). Own endpoint, not folded into updateQuotation — a PO
// typically arrives after the quotation is already pushed to ERPNext, so it
// must stay settable even when the rest of the quotation is locked.
export const updateCustomerPo = (id: string, input: { customerPoNumber?: string; customerPoDate?: string }) =>
  apiFetch<Quotation>(`/quotations/${id}/customer-po`, { method: "PATCH", body: JSON.stringify(input) });

export async function uploadCustomerPoDocument(id: string, file: File): Promise<Quotation> {
  const formData = new FormData();
  formData.append("file", file);

  const send = () =>
    fetch(`${API_URL}/quotations/${id}/customer-po/upload`, {
      method: "POST",
      credentials: "include",
      body: formData,
    });

  let res = await send();
  if (res.status === 401) {
    const refreshed = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
    if (refreshed.ok) res = await send();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<Quotation>;
}

export const addQuotationItem = (
  id: string,
  input: {
    itemCode: string;
    itemName: string;
    qty: number;
    uom: string;
    unitPrice: number;
    taxAmount?: number;
    priceListName?: string;
  },
) => post<Quotation>(`/quotations/${id}/items`, input);

export const updateQuotationItem = (
  id: string,
  itemId: string,
  input: { qty?: number; uom?: string; unitPrice?: number; taxAmount?: number },
) => apiFetch<Quotation>(`/quotations/${id}/items/${itemId}`, { method: "PATCH", body: JSON.stringify(input) });

export const removeQuotationItem = (id: string, itemId: string) =>
  apiFetch<Quotation>(`/quotations/${id}/items/${itemId}`, { method: "DELETE" });

/** Creates the DRAFT Quotation in ERPNext — negotiation happens there from this point on, not in ACE. */
export const pushQuotationToErpNext = (id: string) => post<Quotation>(`/quotations/${id}/push-to-erpnext`);

/** Manual buttons replacing the removed 5-minute polling cron (2026-07-25) — live ERPNext status check on click. */
export const createSalesOrderFromQuotation = (id: string) => post<Quotation>(`/quotations/${id}/create-sales-order`);
export const createInvoiceFromQuotation = (id: string) => post<Quotation>(`/quotations/${id}/create-invoice`);
export const checkDeliveryNoteForQuotation = (id: string) => post<Quotation>(`/quotations/${id}/check-delivery-note`);

export const updateDelivery = (
  id: string,
  input: { deliveryDate?: string; status?: DeliveryStatus; trackingNotes?: string; erpnextDeliveryNoteId?: string },
) => apiFetch<Delivery>(`/deliveries/${id}`, { method: "PATCH", body: JSON.stringify(input) });
