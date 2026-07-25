import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
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

  // A blank/missing ACE_ERP_COMPANY used to fail silently — the resulting
  // empty `company: ''` field on the ERPNext doc doesn't match any real
  // Company, and a third-party GST override (india_compliance) crashes with
  // a raw, unhelpful "TypeError: cannot unpack non-iterable NoneType
  // object" trying to look it up. Failing loudly here instead, right where
  // the actual misconfiguration is, rather than three services downstream.
  private company(): string {
    const company = process.env.ACE_ERP_COMPANY;
    if (!company) {
      throw new InternalServerErrorException(
        'ACE_ERP_COMPANY is not configured on this server — cannot write to ERPNext without it.',
      );
    }
    return company;
  }

  private sellingPriceList(): string {
    return process.env.ACE_SELLING_PRICE_LIST ?? 'ACE Pricing';
  }

  private salesPerson(): string {
    return process.env.ACE_SALES_PERSON ?? 'ACE Service';
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
   *
   * sales_team is ALSO mandatory on the PISPL Sales Order and the mapper
   * doesn't set it — confirmed the exact cause of the "Data missing in
   * table: Sales Team" blocker. Defaulted to ACE_SALES_PERSON @ 100% so the
   * submit never fails with MandatoryError: sales_team (per Shivam's
   * ace_erpnext_writeback_final2.py, verified live on 187).
   *
   * api_call=1 is passed on the submit call so the PISPL
   * prevent_so_creation_for_acepl hook allows the one restricted customer.
   */
  async salesOrderFromQuotation(erpnextQuotationName: string, deliveryDate?: string): Promise<string> {
    const dd = deliveryDate ?? new Date().toISOString().slice(0, 10);
    const so = await this.frappe.post<Record<string, any>>('erpnext.selling.doctype.quotation.quotation.make_sales_order', {
      source_name: erpnextQuotationName,
    });
    so.delivery_date = dd;
    for (const it of so.items ?? []) it.delivery_date = dd;
    so.sales_team = [{ sales_person: this.salesPerson(), allocated_percentage: 100 }];
    this.logger.log(`Submitting Sales Order from Quotation ${erpnextQuotationName}`);
    const result = await this.frappe.post<{ name: string }>('frappe.client.submit', {
      doc: JSON.stringify(so),
      api_call: 1,
    });
    return result.name;
  }

  /**
   * Sales Order status = "To Bill" (fully delivered via the manual Delivery
   * Note, not yet billed) -> a DRAFT Sales Invoice via make_sales_invoice.
   * Finance reviews and submits it in ERPNext — ACE never submits this doc.
   * `hypothecation` is a mandatory Small Text field on the PISPL Sales
   * Invoice that the mapper doesn't fill (per Shivam's gotcha #5) — defaults
   * to "N/A" pending Finance confirming the real per-customer clause.
   */
  async draftSalesInvoiceFromSalesOrder(erpnextSalesOrderName: string): Promise<string> {
    const si = await this.frappe.post<Record<string, any>>('erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice', {
      source_name: erpnextSalesOrderName,
    });
    si.hypothecation = process.env.ACE_INVOICE_HYPOTHECATION ?? 'N/A';
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

  /** Read one document's status/docstatus/per_billed — used by the manual status-check buttons. */
  async getDocStatus(doctype: string, name: string): Promise<ErpDocStatus> {
    return this.frappe.getResource<ErpDocStatus>(`${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, {
      fields: JSON.stringify(['status', 'docstatus', 'per_billed']),
    });
  }

  /**
   * Delivery Note is raised MANUALLY in ERPNext against the Sales Order
   * (never created by ACE) — this looks up whether one exists yet, via the
   * link at the item level (Delivery Note Item.against_sales_order), same
   * as how the Quotation->SO link works (§5 of Shivam's integration guide).
   * Manual "Check Delivery Note" button (2026-07-25) — this step was never
   * poll-covered even before (webhook-only), so this is a new capability,
   * not a cron replacement.
   */
  async findDeliveryNoteForSalesOrder(erpnextSalesOrderName: string): Promise<string | null> {
    const rows = await this.frappe.getResource<{ parent: string }[]>('Delivery Note Item', {
      filters: JSON.stringify([['against_sales_order', '=', erpnextSalesOrderName]]),
      fields: JSON.stringify(['parent']),
      limit_page_length: '1',
    });
    return rows[0]?.parent ?? null;
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
