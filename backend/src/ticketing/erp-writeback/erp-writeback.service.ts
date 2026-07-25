import { Injectable, Logger } from '@nestjs/common';
import { FrappeRpcService } from '../../erp/frappe-rpc.service';

export interface ErpDocStatus {
  status: string;
  docstatus: number;
  per_billed?: number;
}

/**
 * The ticketing module's ERPNext write path (CLAUDE.md) — chargeable
 * service pipeline per Shivam's ACE_ERPNext_Writeback_Integration_final.md
 * (2026-07-23, supersedes the earlier all-submit model):
 *
 *  1. ACE creates a DRAFT Quotation (docstatus=0) — "Create Quotation".
 *  2. Negotiation happens IN ERPNEXT on that Quotation, not in ACE.
 *  3. Quotation submitted in ERPNext -> webhook/poll -> ACE creates a
 *     SUBMITTED Sales Order via ERPNext's own make_sales_order mapper
 *     (carries the negotiated rates — no rate=0 trap).
 *  4. Delivery Note is raised MANUALLY in ERPNext (parts leave stock here,
 *     not via any ACE-created Stock Entry — Stock Entry is retired).
 *  5. Once the Sales Order's status is exactly "To Bill" -> webhook/poll ->
 *     ACE creates a DRAFT Sales Invoice via make_sales_invoice (Finance
 *     reviews and submits it in ERPNext).
 *
 * Confirmed live against the test instance (2026-07-22, prior model) that
 * this API key has Create+Submit rights; the mapper-based calls below use
 * the same auth via FrappeRpcService.
 */
@Injectable()
export class ErpWritebackService {
  private readonly logger = new Logger(ErpWritebackService.name);

  constructor(private readonly frappe: FrappeRpcService) {}

  private company(): string {
    return process.env.ACE_ERP_COMPANY ?? '';
  }

  private sellingPriceList(): string {
    return process.env.ACE_SELLING_PRICE_LIST ?? 'ACE Pricing';
  }

  private remarks(ticketId: string): string {
    return `ACE Ticket: ${ticketId}`;
  }

  private line(item: { itemCode: string; qty: number; rate?: number; uom?: string }, deliveryDate?: string) {
    const line: Record<string, unknown> = { item_code: item.itemCode, qty: item.qty, uom: item.uom ?? 'Nos' };
    if (item.rate != null) line.rate = item.rate;
    if (deliveryDate) line.delivery_date = deliveryDate;
    return line;
  }

  /**
   * ACE "Create Quotation" button -> a DRAFT ERPNext Quotation (docstatus=0,
   * posts nothing). Pass an explicit `rate` per line (ACE's own catalog
   * rate) — a bare insert with no rate and an empty price list leaves
   * rate=0, confirmed on the test instance.
   */
  async quotationDraft(
    ticketId: string,
    erpnextCustomerId: string,
    items: { itemCode: string; qty: number; rate?: number; uom?: string }[],
    validTill?: string,
    priceList?: string,
  ): Promise<string> {
    const doc = {
      doctype: 'Quotation',
      quotation_to: 'Customer',
      party_name: erpnextCustomerId,
      company: this.company(),
      selling_price_list: priceList ?? this.sellingPriceList(),
      custom_ace_ticket: ticketId,
      remarks: this.remarks(ticketId),
      items: items.map((i) => this.line(i)),
      ...(validTill ? { valid_till: validTill } : {}),
    };
    this.logger.log(`Creating draft Quotation for ticket ${ticketId}`);
    const result = await this.frappe.post<{ name: string }>('frappe.client.insert', { doc: JSON.stringify(doc) });
    return result.name;
  }

  /**
   * Quotation submitted in ERPNext (after negotiation there) -> a SUBMITTED
   * Sales Order carrying the negotiated rates, via ERPNext's own
   * make_sales_order mapper (never touches ACE's local item list — the
   * negotiated version in ERPNext is authoritative at this point).
   * delivery_date is mandatory in ERPNext; the mapper returns it as null,
   * so it must be set here on the header and every item line.
   */
  async salesOrderFromQuotation(erpnextQuotationName: string, deliveryDate?: string): Promise<string> {
    const dd = deliveryDate ?? new Date().toISOString().slice(0, 10);
    const so = await this.frappe.post<Record<string, any>>('erpnext.selling.doctype.quotation.quotation.make_sales_order', {
      source_name: erpnextQuotationName,
    });
    so.delivery_date = dd;
    for (const it of so.items ?? []) it.delivery_date = dd;
    this.logger.log(`Submitting Sales Order from Quotation ${erpnextQuotationName}`);
    const result = await this.frappe.post<{ name: string }>('frappe.client.submit', { doc: JSON.stringify(so) });
    return result.name;
  }

  /**
   * Sales Order status = "To Bill" (fully delivered via the manual Delivery
   * Note, not yet billed) -> a DRAFT Sales Invoice via make_sales_invoice.
   * Finance reviews and submits it in ERPNext — ACE never submits this doc.
   */
  async draftSalesInvoiceFromSalesOrder(erpnextSalesOrderName: string): Promise<string> {
    const si = await this.frappe.post<Record<string, any>>('erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice', {
      source_name: erpnextSalesOrderName,
    });
    this.logger.log(`Creating draft Sales Invoice from Sales Order ${erpnextSalesOrderName}`);
    const result = await this.frappe.post<{ name: string }>('frappe.client.insert', { doc: JSON.stringify(si) });
    return result.name;
  }

  /**
   * Not part of Shivam's chargeable-pipeline doc (which only covers the
   * Quotation-sourced SO) — this is the non-chargeable warranty/AMC direct
   * path (ACE_Ticket_Master_Flow.png's "Chargeable? No" branch), which has
   * no Quotation to map from. Sales Order still stays "submitted by ACE" in
   * the new model too, so hand-building + submitting one directly remains
   * consistent; only the Quotation/Invoice/Stock-Entry parts changed.
   */
  async salesOrderDirect(
    ticketId: string,
    erpnextCustomerId: string,
    items: { itemCode: string; qty: number; rate: number; uom?: string }[],
    poNo: string,
    poDate: string,
    deliveryDate: string,
  ): Promise<string> {
    const doc = {
      doctype: 'Sales Order',
      customer: erpnextCustomerId,
      company: this.company(),
      custom_ace_ticket: ticketId,
      po_no: poNo,
      po_date: poDate,
      delivery_date: deliveryDate,
      items: items.map((i) => this.line(i, deliveryDate)),
    };
    this.logger.log(`Submitting direct Sales Order for ticket ${ticketId}`);
    const result = await this.frappe.post<{ name: string }>('frappe.client.submit', { doc: JSON.stringify(doc) });
    return result.name;
  }

  /** Read one document's status/docstatus/per_billed — used by the polling fallback. */
  async getDocStatus(doctype: string, name: string): Promise<ErpDocStatus> {
    const base = (process.env.FRAPPE_BASE_URL ?? '').replace(/\/$/, '');
    const key = process.env.FRAPPE_API_KEY ?? '';
    const secret = process.env.FRAPPE_API_SECRET ?? '';
    const fields = encodeURIComponent(JSON.stringify(['status', 'docstatus', 'per_billed']));
    const url = `${base}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}?fields=${fields}`;
    const res = await fetch(url, { headers: { Authorization: `token ${key}:${secret}` } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`getDocStatus ${doctype}/${name} -> HTTP ${res.status}${body ? ` — ${body.slice(0, 300)}` : ''}`);
    }
    const json = (await res.json()) as { data: ErpDocStatus };
    return json.data;
  }

  /**
   * ACE "Send Mail" — only meaningful AFTER Finance submits the Sales
   * Invoice in ERPNext (a draft isn't a billing document).
   */
  async emailSalesInvoice(
    invoiceName: string,
    recipients: string,
    subject: string,
    message: string,
    printFormat: string,
    cc?: string,
  ): Promise<string> {
    const result = await this.frappe.post<{ name: string }>('frappe.core.doctype.communication.email.make', {
      doctype: 'Sales Invoice',
      name: invoiceName,
      recipients,
      subject,
      content: message,
      print_format: printFormat,
      send_email: 1,
      ...(cc ? { cc } : {}),
    });
    return result.name;
  }
}
