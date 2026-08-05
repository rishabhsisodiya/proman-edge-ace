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

  private salesTaxesTemplate(): string {
    return process.env.ACE_SALES_TAXES_TEMPLATE ?? 'Sales SGST 9% & CGST9% - PISPL';
  }

  private salesIgstTemplate(): string {
    return process.env.ACE_SALES_IGST_TEMPLATE ?? 'Sales IGST 18%';
  }

  /**
   * FSD §14.4 rule 27/§5.6 — "GST computed as CGST+SGST or IGST by comparing
   * customer GSTIN state vs. Proman GSTIN state" (2026-07-31 fix — this
   * comparison never happened; `pushToErpNext()` always used the default
   * intra-state template regardless of the customer's actual state).
   * `ACE_COMPANY_STATE` isn't guessable/hardcodable here — must be set to
   * Proman's actual registered GST state. Undefined → always intra-state
   * (today's existing behavior, unchanged) rather than guessing wrong.
   */
  resolveTaxesTemplate(customerBillingState: string | null | undefined): string {
    const companyState = process.env.ACE_COMPANY_STATE;
    if (!companyState || !customerBillingState) return this.salesTaxesTemplate();
    const sameState = companyState.trim().toLowerCase() === customerBillingState.trim().toLowerCase();
    return sameState ? this.salesTaxesTemplate() : this.salesIgstTemplate();
  }

  /**
   * Tax child rows for a Sales Taxes and Charges Template, via ERPNext's own
   * get_taxes_and_charges (nothing hard-coded on our side). Attaching the
   * rows is REQUIRED, not optional — PISPL's "auto add taxes from template"
   * setting is OFF, so setting only the header `taxes_and_charges` leaves the
   * quotation untaxed. Setting both is safe: ERPNext skips its own auto-add
   * when rows are already present, so there's no double-tax risk either way.
   */
  private async fetchSalesTaxes(template: string): Promise<Record<string, unknown>[]> {
    if (!template) return [];
    const rows = await this.frappe.post<Record<string, unknown>[]>(
      'erpnext.controllers.accounts_controller.get_taxes_and_charges',
      { master_doctype: 'Sales Taxes and Charges Template', master_name: template },
    );
    const drop = new Set(['name', 'parent', 'parentfield', 'parenttype', 'idx', 'creation', 'modified', 'modified_by', 'owner', 'docstatus']);
    return (rows ?? []).map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => !drop.has(k))));
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
   *
   * GST tax prefill (2026-07-27, ACE_SalesOrder_From_Quotation_Handoff_default_tax.md)
   * — defaults to the intra-state CGST 9% + SGST 9% template
   * (ACE_SALES_TAXES_TEMPLATE); pass taxesTemplate="Sales IGST 18%" for an
   * out-of-state customer, or "" to omit tax entirely. The Sales Order and
   * Sales Invoice inherit these taxes automatically via the make_* mappers —
   * no separate tax step needed downstream.
   */
  async quotationDraft(
    ticketId: string,
    erpnextCustomerId: string,
    items: { itemCode: string; qty: number; rate?: number; uom?: string }[],
    validTill?: string,
    priceList?: string,
    taxesTemplate?: string,
  ): Promise<string> {
    const template = taxesTemplate ?? this.salesTaxesTemplate();
    const taxes = template ? await this.fetchSalesTaxes(template) : undefined;
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
      ...(template ? { taxes_and_charges: template } : {}),
      ...(taxes ? { taxes } : {}),
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
  /**
   * po_no/po_date (client request, 2026-08-05 — chargeable Sales Orders need
   * the real Customer PO; the non-chargeable warranty/AMC path already
   * auto-generates a placeholder one via salesOrderDirect() above, no
   * change needed there). po_date must already be ISO 'YYYY-MM-DD' —
   * convert before calling.
   *
   * ⚠️ Duplicate-PO guard: the client `proman` app's `check_duplicate_so_creation`
   * hook (before_insert, global) throws "Sales Order is already created for
   * the same PO number {po_no}" if ANY Sales Order already has this po_no —
   * only triggers now that we set it. Callers must catch this and treat it
   * as idempotent (see QuotationService.createSalesOrder), not a hard
   * failure — a reused PO or a double-click on "Create Sales Order" would
   * otherwise surface a scary error for what's actually a no-op.
   */
  async salesOrderFromQuotation(erpnextQuotationName: string, deliveryDate?: string, poNo?: string, poDate?: string): Promise<string> {
    const dd = deliveryDate ?? new Date().toISOString().slice(0, 10);
    const so = await this.frappe.post<Record<string, any>>('erpnext.selling.doctype.quotation.quotation.make_sales_order', {
      source_name: erpnextQuotationName,
    });
    so.delivery_date = dd;
    for (const it of so.items ?? []) it.delivery_date = dd;
    so.sales_team = [{ sales_person: this.salesPerson(), allocated_percentage: 100 }];
    if (poNo) so.po_no = poNo;
    if (poDate) so.po_date = poDate;
    this.logger.log(`Submitting Sales Order from Quotation ${erpnextQuotationName}`);
    const result = await this.frappe.post<{ name: string }>('frappe.client.submit', {
      doc: JSON.stringify(so),
      api_call: 1,
    });
    return result.name;
  }

  /**
   * Duplicate-PO-guard recovery (see salesOrderFromQuotation above) — after
   * catching the "already created for the same PO number" error, look up
   * which Sales Order actually has this po_no so the quotation can still be
   * linked to it (idempotent, per Shivam's spec — not just swallowing the
   * error and leaving the quotation unlinked).
   */
  async findSalesOrderByPoNo(poNo: string): Promise<string | null> {
    const rows = await this.frappe.getResource<{ name: string }[]>('Sales Order', {
      filters: JSON.stringify([['po_no', '=', poNo]]),
      fields: JSON.stringify(['name']),
      limit_page_length: '1',
    });
    return rows[0]?.name ?? null;
  }

  /**
   * Appends the Customer PO block to an already-created ERPNext Quotation's
   * remarks (client request, 2026-08-05) — Quotation has no native po_no/
   * po_date field, so this is the only place it's visible on that doc.
   * Rebuilds remarks from scratch rather than a blind string-append, so the
   * 'ACE Ticket: {id}' first line the submit webhook filters on is always
   * present exactly once, never duplicated across repeated calls.
   */
  async updateQuotationRemarks(erpnextQuotationName: string, ticketId: string, poNo?: string, poDate?: string): Promise<void> {
    const parts = [this.remarks(ticketId)];
    if (poNo) parts.push(`Customer PO No: ${poNo}`);
    if (poDate) parts.push(`PO Date: ${poDate}`);
    await this.frappe.post('frappe.client.set_value', {
      doctype: 'Quotation',
      name: erpnextQuotationName,
      fieldname: 'remarks',
      value: parts.join('\n'),
    });
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
   * Warranty Cost Tracker mechanism (client-confirmed 2026-08-01): the
   * direct Sales Order carries the REAL item price (see salesOrderDirect
   * below — no longer rate=0), but the customer is never actually billed —
   * the Sales Invoice built from it is zeroed out instead. Reuses the same
   * make_sales_invoice mapper as draftSalesInvoiceFromSalesOrder() (so it
   * inherits the customer/items/hypothecation handling identically), then
   * explicitly zeroes every line's rate/amount plus the doc-level totals
   * before inserting — the mapper itself has no "zero-rate" option, it
   * copies the source SO's rates verbatim by design.
   */
  async draftZeroRateSalesInvoiceFromSalesOrder(erpnextSalesOrderName: string): Promise<string> {
    const si = await this.frappe.post<Record<string, any>>('erpnext.selling.doctype.sales_order.sales_order.make_sales_invoice', {
      source_name: erpnextSalesOrderName,
    });
    si.hypothecation = process.env.ACE_INVOICE_HYPOTHECATION ?? 'N/A';
    for (const item of si.items ?? []) {
      item.rate = 0;
      item.amount = 0;
      item.price_list_rate = 0;
    }
    si.total = 0;
    si.net_total = 0;
    si.grand_total = 0;
    si.rounded_total = 0;
    si.taxes = [];
    si.total_taxes_and_charges = 0;
    this.logger.log(`Creating draft zero-rate Sales Invoice from Sales Order ${erpnextSalesOrderName} (warranty)`);
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
   *
   * sales_team + api_call=1 fix (2026-07-25) — this is a second, separate
   * Sales Order submit path from salesOrderFromQuotation() above and was
   * missed in the first pass at that fix; same MandatoryError: sales_team
   * and prevent_so_creation_for_acepl issue applies here identically since
   * both submit a Sales Order doc the same way.
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
      sales_team: [{ sales_person: this.salesPerson(), allocated_percentage: 100 }],
    };
    this.logger.log(`Submitting direct Sales Order for ticket ${ticketId}`);
    const result = await this.frappe.post<{ name: string }>('frappe.client.submit', {
      doc: JSON.stringify(doc),
      api_call: 1,
    });
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
   * (never created by ACE) — this looks up whether one exists yet.
   * Manual "Check Delivery Note" button (2026-07-25) — this step was never
   * poll-covered even before (webhook-only), so this is a new capability,
   * not a cron replacement.
   *
   * FIX (2026-07-27, ACE_CheckDeliveryNote_Bug_Fix.md): querying the child
   * table `Delivery Note Item` directly 403s — Frappe's get_list refuses to
   * list ANY child table (…Item doctype) without a `parent` query param,
   * even for an admin token. This was never an ERPNext-side permission gap.
   * Fix: query the PARENT doctype `Delivery Note` with a child-field filter
   * instead — one call also returns status for free.
   */
  async findDeliveryNoteForSalesOrder(erpnextSalesOrderName: string): Promise<string | null> {
    const rows = await this.frappe.getResource<{ name: string; status: string }[]>('Delivery Note', {
      filters: JSON.stringify([['Delivery Note Item', 'against_sales_order', '=', erpnextSalesOrderName]]),
      fields: JSON.stringify(['name', 'status']),
    });
    return rows[0]?.name ?? null;
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
