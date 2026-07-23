import { apiFetch } from "@/lib/api";

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
  input: { validUntil: string; labourCharges?: number; notesToCustomer?: string; termsAndConditions?: string },
) => post<Quotation>(`/tickets/${ticketId}/quotation`, input);

export const createDirectSalesOrder = (ticketId: string) =>
  post<Delivery>(`/tickets/${ticketId}/direct-sales-order`);

export const retryDirectSalesOrderErpSync = (deliveryId: string) =>
  post<Delivery>(`/deliveries/${deliveryId}/retry-erpnext`);

export const getQuotation = (id: string) => apiFetch<Quotation>(`/quotations/${id}`);

export const updateQuotation = (
  id: string,
  input: { validUntil?: string; labourCharges?: number; notesToCustomer?: string; termsAndConditions?: string },
) => apiFetch<Quotation>(`/quotations/${id}`, { method: "PATCH", body: JSON.stringify(input) });

export const addQuotationItem = (
  id: string,
  input: { itemCode: string; itemName: string; qty: number; uom: string; unitPrice: number; taxAmount?: number },
) => post<Quotation>(`/quotations/${id}/items`, input);

export const removeQuotationItem = (id: string, itemId: string) =>
  apiFetch<Quotation>(`/quotations/${id}/items/${itemId}`, { method: "DELETE" });

/** Creates the DRAFT Quotation in ERPNext — negotiation happens there from this point on, not in ACE. */
export const pushQuotationToErpNext = (id: string) => post<Quotation>(`/quotations/${id}/push-to-erpnext`);

export const updateDelivery = (
  id: string,
  input: { deliveryDate?: string; status?: DeliveryStatus; trackingNotes?: string; erpnextDeliveryNoteId?: string },
) => apiFetch<Delivery>(`/deliveries/${id}`, { method: "PATCH", body: JSON.stringify(input) });
