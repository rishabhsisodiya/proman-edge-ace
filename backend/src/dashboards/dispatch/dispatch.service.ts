import { Injectable } from '@nestjs/common';
import { ErpDbService } from '../../erp/erp-db.service';
import { ErpCacheService } from '../../erp/erp-cache.service';
import type {
  DispatchHomepageData,
  ReadyToDispatch,
  DispatchBlocked,
  DispatchedThisWeek,
  EwayBillsExpiring,
  RevenuePendingInvoice,
  DispatchStageFlow,
  DispatchPipelineRow,
  DocumentationChecklist,
  VehicleBookingRow,
  EwayBillRow,
  DispatchScheduleRow,
  OnTimeDispatchMonth,
  DispatchActionQueue,
  DnToSubmitRow,
  InvoiceAwaitingDispatchRow,
  DispatchAlerts,
  CommittedDispatchTodayRow,
  WoDelayedRow,
  NoVehicleTargetSoonRow,
} from './dispatch.types';

// Single site (PISPL) — read-only, per proman-docs/Dispatch_Head_SQL_Queries_v3.md
// (widget IDs W-DISP-01..13, alerts A-DISP-01..05).

const CACHE_KEY = 'dispatch:homepage';
const CACHE_TTL = 300; // 5 minutes — matches frontend refreshInterval

@Injectable()
export class DispatchService {
  constructor(
    private readonly erpDb: ErpDbService,
    private readonly cache: ErpCacheService,
  ) {}

  private erpBaseUrl(): string {
    return (process.env.FRAPPE_BASE_URL ?? '').replace(/\/$/, '');
  }

  // ── Fiscal-year helper (Indian FY: April – March) ────────────────────────────
  // Mirrors financeServiceDB.ts's periodRange() FY math.

  private currentFiscalYearRange(): { fyStart: string; fyEnd: string } {
    const now = new Date();
    const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return { fyStart: `${y}-04-01`, fyEnd: `${y + 1}-03-31` };
  }

  // ── W-DISP-01 — Ready to dispatch (KPI) — QI now keyed to Work Order ────────

  private async getReadyToDispatch(fyStart: string, fyEnd: string): Promise<ReadyToDispatch> {
    const rows = await this.erpDb.query<{ ready_to_dispatch: number }>(
      `SELECT COUNT(DISTINCT so.name) AS ready_to_dispatch
       FROM \`tabSales Order\` so
       WHERE so.docstatus = 1
         AND so.transaction_date BETWEEN ? AND ?
         AND EXISTS (
           SELECT 1 FROM \`tabWork Order\` wo
           WHERE wo.sales_order = so.name AND wo.docstatus = 1 AND wo.status = 'Completed'
             AND EXISTS (SELECT 1 FROM \`tabJob Card\` jc
                         WHERE jc.work_order = wo.name AND jc.status = 'Completed'
                           AND EXISTS (SELECT 1 FROM \`tabQuality Inspection\` qi
                                       WHERE qi.reference_type = 'Job Card' AND qi.reference_name = jc.name
                                         AND qi.status = 'Accepted'))
         )`,
      [fyStart, fyEnd],
    );
    return { count: Number(rows[0]?.ready_to_dispatch ?? 0) };
  }

  // ── W-DISP-02 — Dispatch blocked (KPI) ───────────────────────────────────────

  private async getDispatchBlocked(fyStart: string, fyEnd: string): Promise<DispatchBlocked> {
    const rows = await this.erpDb.query<{ dispatch_blocked: number }>(
      `SELECT COUNT(*) AS dispatch_blocked
       FROM \`tabDelivery Note\` dn
       WHERE dn.docstatus = 0 AND dn.is_return = 0
         AND dn.posting_date BETWEEN ? AND ?
         AND (
               dn.per_billed < 100
            OR IFNULL(dn.ewaybill, '')   = ''
            OR IFNULL(dn.vehicle_no, '') = ''
            OR NOT EXISTS (
                 SELECT 1 FROM \`tabDelivery Note Item\` dni
                 JOIN \`tabSales Order\` so ON so.name = dni.against_sales_order
                 WHERE dni.parent = dn.name AND IFNULL(so.po_no, '') <> '')
            OR NOT EXISTS (
                 SELECT 1 FROM \`tabQuality Inspection\` qi
                 WHERE qi.reference_type = 'Delivery Note' AND qi.reference_name = dn.name)
             )`,
      [fyStart, fyEnd],
    );
    return { count: Number(rows[0]?.dispatch_blocked ?? 0) };
  }

  // ── W-DISP-03 — Dispatched this week (KPI) ───────────────────────────────────

  private async getDispatchedThisWeek(): Promise<DispatchedThisWeek> {
    const rows = await this.erpDb.query<{ dispatched_this_week: number; dispatch_value: number }>(
      `SELECT
          COUNT(*)                                     AS dispatched_this_week,
          ROUND(COALESCE(SUM(base_grand_total), 0), 2) AS dispatch_value
       FROM \`tabDelivery Note\`
       WHERE docstatus = 1 AND is_return = 0
         AND posting_date >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
         AND posting_date <= CURDATE()`,
    );
    return {
      count: Number(rows[0]?.dispatched_this_week ?? 0),
      dispatchValue: Number(rows[0]?.dispatch_value ?? 0),
    };
  }

  // ── W-DISP-04 — e-Way bills expiring (KPI) ───────────────────────────────────

  private async getEwayBillsExpiring(): Promise<EwayBillsExpiring> {
    const rows = await this.erpDb.query<{ ewb_expiring_week: number; expiring_today: number }>(
      `SELECT
          COUNT(*)                                       AS ewb_expiring_week,
          COALESCE(SUM(DATE(valid_upto) = CURDATE()), 0) AS expiring_today
       FROM \`tabe-Waybill Log\`
       WHERE is_cancelled = 0
         AND reference_doctype IN ('Sales Invoice', 'Delivery Note')
         AND valid_upto >= NOW()
         AND valid_upto <  NOW() + INTERVAL 7 DAY`,
    );
    return {
      expiringWeek: Number(rows[0]?.ewb_expiring_week ?? 0),
      expiringToday: Number(rows[0]?.expiring_today ?? 0),
    };
  }

  // ── W-DISP-05 — Revenue pending invoice (KPI) — DN status = 'To Bill' ───────

  private async getRevenuePendingInvoice(fyStart: string, fyEnd: string): Promise<RevenuePendingInvoice> {
    const rows = await this.erpDb.query<{ dns_pending_invoice: number; revenue_pending: number }>(
      `SELECT
          COUNT(*)                        AS dns_pending_invoice,
          ROUND(SUM(base_grand_total), 2) AS revenue_pending
       FROM \`tabDelivery Note\`
       WHERE docstatus = 1 AND is_return = 0
         AND status = 'To Bill'
         AND posting_date BETWEEN ? AND ?`,
      [fyStart, fyEnd],
    );
    return {
      count: Number(rows[0]?.dns_pending_invoice ?? 0),
      revenuePending: Number(rows[0]?.revenue_pending ?? 0),
    };
  }

  // ── W-DISP-06 — Dispatch readiness pipeline (stage-flow + table) — strict QC-first ─

  private async getDispatchStageFlow(): Promise<DispatchStageFlow> {
    const rows = await this.erpDb.query<{
      qc_pending: number;
      qc_cleared: number;
      docs_pending: number;
      docs_complete: number;
      vehicle_booked: number;
      dispatched: number;
    }>(
      `SELECT
          d.qc_pending, d.qc_cleared, d.docs_pending, d.docs_complete, d.vehicle_booked,
          ( SELECT COUNT(*) FROM \`tabDelivery Note\` dn
            WHERE dn.docstatus=1 AND dn.is_return=0
              AND dn.posting_date >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
              AND dn.posting_date <= CURDATE() ) AS dispatched
       FROM (
         SELECT
           SUM(f.has_qc = 0)                                                    AS qc_pending,
           SUM(f.has_qc = 1)                                                    AS qc_cleared,
           SUM(f.has_qc=1 AND NOT (f.has_si=1 AND f.has_po=1))                  AS docs_pending,
           SUM(f.has_qc=1 AND f.has_si=1 AND f.has_po=1)                        AS docs_complete,
           SUM(f.has_qc=1 AND f.has_si=1 AND f.has_po=1
               AND IFNULL(dn.vehicle_no,'')<>'')                               AS vehicle_booked
         FROM \`tabDelivery Note\` dn
         JOIN (
           SELECT dn2.name,
             EXISTS(SELECT 1 FROM \`tabQuality Inspection\` qi
                    WHERE qi.reference_type='Delivery Note' AND qi.reference_name=dn2.name AND qi.status='Accepted') AS has_qc,
             EXISTS(SELECT 1 FROM \`tabDelivery Note Item\` d2 JOIN \`tabSales Order\` s2 ON s2.name=d2.against_sales_order
                    WHERE d2.parent=dn2.name AND IFNULL(s2.po_no,'')<>'') AS has_po,
             (dn2.per_billed >= 100)         AS has_si
           FROM \`tabDelivery Note\` dn2 WHERE dn2.docstatus=0 AND dn2.is_return=0
         ) f ON f.name = dn.name
         WHERE dn.docstatus=0 AND dn.is_return=0
       ) d`,
    );
    const r = rows[0];
    return {
      qcPending: Number(r?.qc_pending ?? 0),
      qcCleared: Number(r?.qc_cleared ?? 0),
      docsPending: Number(r?.docs_pending ?? 0),
      docsComplete: Number(r?.docs_complete ?? 0),
      vehicleBooked: Number(r?.vehicle_booked ?? 0),
      dispatched: Number(r?.dispatched ?? 0),
    };
  }

  private async getDispatchPipelineTable(): Promise<DispatchPipelineRow[]> {
    const rows = await this.erpDb.query<{
      dn_no: string;
      customer_name: string;
      product: string;
      target_date: string | null;
      blocker: DispatchPipelineRow['blocker'];
    }>(
      `SELECT
          dn.name AS dn_no,
          dn.customer_name,
          CONCAT(SUBSTRING_INDEX(GROUP_CONCAT(DISTINCT di.item_name ORDER BY di.idx SEPARATOR '||'), '||', 1),
                 IF(COUNT(DISTINCT di.item_code) > 1, ' …', '')) AS product,
          MIN(so.delivery_date) AS target_date,
          CASE
            WHEN NOT EXISTS (SELECT 1 FROM \`tabQuality Inspection\` qi
                             WHERE qi.reference_type='Delivery Note' AND qi.reference_name=dn.name) THEN 'QC pending'
            WHEN NOT EXISTS (SELECT 1 FROM \`tabDelivery Note Item\` d2 JOIN \`tabSales Order\` s2 ON s2.name=d2.against_sales_order
                             WHERE d2.parent=dn.name AND IFNULL(s2.po_no,'')<>'') THEN 'Customer PO pending'
            WHEN IFNULL(dn.vehicle_no,'') = '' THEN 'Vehicle pending'
            ELSE 'Ready'
          END AS blocker
       FROM \`tabDelivery Note\` dn
       LEFT JOIN \`tabDelivery Note Item\` di ON di.parent = dn.name
       LEFT JOIN \`tabSales Order\` so ON so.name = di.against_sales_order
       WHERE dn.docstatus = 0 AND dn.is_return = 0
       GROUP BY dn.name, dn.customer_name, dn.vehicle_no
       ORDER BY target_date ASC`,
    );
    return rows.map((r) => ({
      dnNo: r.dn_no,
      customerName: r.customer_name,
      product: r.product,
      targetDate: r.target_date,
      blocker: r.blocker,
    }));
  }

  // ── W-DISP-07 — Documentation checklist (per Delivery Note) — 5 fields ──────

  async getDocumentationChecklist(dnName: string): Promise<DocumentationChecklist | null> {
    const rows = await this.erpDb.query<{
      dn_no: string;
      customer_name: string;
      qc_certificate: 'Done' | 'Pending';
      sales_invoice_approved: 'Done' | 'Pending';
      eway_bill_generated: 'Done' | 'Pending';
      vehicle_booking_confirmed: 'Done' | 'Pending';
      customer_po_verified: 'Done' | 'Pending';
    }>(
      `SELECT
          dn.name AS dn_no, dn.customer_name,
          IF(EXISTS(SELECT 1 FROM \`tabQuality Inspection\` qi
                    WHERE qi.reference_type='Delivery Note' AND qi.reference_name=dn.name AND qi.status='Accepted'),
             'Done','Pending')                                       AS qc_certificate,
          IF(dn.per_billed >= 100, 'Done','Pending')                 AS sales_invoice_approved,
          IF(IFNULL(dn.ewaybill,'')   <> '', 'Done','Pending')       AS eway_bill_generated,
          IF(IFNULL(dn.vehicle_no,'') <> '', 'Done','Pending')       AS vehicle_booking_confirmed,
          IF(EXISTS(SELECT 1 FROM \`tabDelivery Note Item\` d2 JOIN \`tabSales Order\` s2 ON s2.name=d2.against_sales_order
                    WHERE d2.parent=dn.name AND IFNULL(s2.po_no,'')<>''),
             'Done','Pending')                                       AS customer_po_verified
       FROM \`tabDelivery Note\` dn
       WHERE dn.name = ?`,
      [dnName],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      dnNo: r.dn_no,
      customerName: r.customer_name,
      qcCertificate: r.qc_certificate,
      salesInvoiceApproved: r.sales_invoice_approved,
      ewayBillGenerated: r.eway_bill_generated,
      vehicleBookingConfirmed: r.vehicle_booking_confirmed,
      customerPoVerified: r.customer_po_verified,
    };
  }

  // ── W-DISP-08 — Vehicle booking (table) — DN logistics fields ───────────────

  private async getVehicleBooking(): Promise<VehicleBookingRow[]> {
    const rows = await this.erpDb.query<{
      dn_no: string;
      customer: string;
      vehicle_no: string | null;
      transporter_receipt_no: string | null;
    }>(
      `SELECT
          dn.name          AS dn_no,
          dn.customer_name AS customer,
          dn.vehicle_no,
          dn.lr_no         AS transporter_receipt_no
       FROM \`tabDelivery Note\` dn
       WHERE dn.docstatus = 0 AND dn.is_return = 0
         AND ( IFNULL(dn.transporter, '') = ''
            OR IFNULL(dn.lr_no, '')       = ''
            OR IFNULL(dn.lr_date, '')     = '' )
       ORDER BY dn.creation ASC`,
    );
    return rows.map((r) => ({
      dnNo: r.dn_no,
      customerName: r.customer,
      vehicleNo: r.vehicle_no,
      transporterReceiptNo: r.transporter_receipt_no,
    }));
  }

  // ── W-DISP-10 — e-Way bill status (table) — was W-DSP-08 ────────────────────

  async getEwayBillStatus(): Promise<EwayBillRow[]> {
    const rows = await this.erpDb.query<{
      eway_bill: string;
      linked_doctype: string;
      linked_doc: string;
      party: string;
      valid_upto: string;
      status: EwayBillRow['status'];
    }>(
      `SELECT
          ewb.e_waybill_number  AS eway_bill,
          ewb.reference_doctype AS linked_doctype,
          ewb.reference_name    AS linked_doc,
          COALESCE(si.customer_name, dn.customer_name) AS party,
          ewb.valid_upto,
          CASE
            WHEN ewb.valid_upto <  NOW()                  THEN 'Expired'
            WHEN DATE(ewb.valid_upto) = CURDATE()         THEN 'Extend (today)'
            WHEN ewb.valid_upto <  NOW() + INTERVAL 2 DAY THEN 'Expiring soon'
            ELSE 'Valid'
          END AS status
       FROM \`tabe-Waybill Log\` ewb
       LEFT JOIN \`tabSales Invoice\` si ON ewb.reference_doctype = 'Sales Invoice' AND si.name = ewb.reference_name
       LEFT JOIN \`tabDelivery Note\` dn ON ewb.reference_doctype = 'Delivery Note' AND dn.name = ewb.reference_name
       WHERE ewb.is_cancelled = 0
         AND ewb.reference_doctype IN ('Sales Invoice','Delivery Note')
         AND ewb.valid_upto >= NOW() - INTERVAL 3 DAY
       ORDER BY ewb.valid_upto ASC
       LIMIT 50`,
    );
    return rows.map((r) => ({
      ewayBill: r.eway_bill,
      linkedDoctype: r.linked_doctype,
      linkedDoc: r.linked_doc,
      party: r.party,
      validUpto: r.valid_upto,
      status: r.status,
    }));
  }

  // ── W-DISP-09 — This week's dispatch schedule — DN-based + destination city ─

  private async getDispatchScheduleThisWeek(): Promise<DispatchScheduleRow[]> {
    const rows = await this.erpDb.query<{
      posting_date: string;
      dn_no: string;
      customer_name: string;
      destination_city: string | null;
      product: string | null;
      vehicle_no: string | null;
    }>(
      `SELECT
          dn.posting_date,
          dn.name           AS dn_no,
          dn.customer_name,
          addr.city         AS destination_city,
          (SELECT di.item_name FROM \`tabDelivery Note Item\` di
           WHERE di.parent = dn.name ORDER BY di.idx LIMIT 1) AS product,
          dn.vehicle_no
       FROM \`tabDelivery Note\` dn
       LEFT JOIN \`tabAddress\` addr ON addr.name = dn.shipping_address_name
       WHERE dn.docstatus = 1 AND dn.is_return = 0
         AND dn.posting_date >= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)
         AND dn.posting_date <= DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) + INTERVAL 5 DAY
       ORDER BY dn.posting_date ASC`,
    );
    return rows.map((r) => ({
      postingDate: r.posting_date,
      dnNo: r.dn_no,
      customerName: r.customer_name,
      destinationCity: r.destination_city,
      product: r.product ?? '—',
      vehicleNo: r.vehicle_no,
    }));
  }

  // ── On-time dispatch % (rolling 3 months) — restored per user request from the
  // original v1 doc; the v3 doc's delay-reasons sub-widget stays dropped (no
  // backing field on Delivery Note or Sales Order). ────────────────────────────

  private async getOnTimeDispatch(): Promise<OnTimeDispatchMonth[]> {
    const rows = await this.erpDb.query<{
      month: string;
      total_dispatched: number;
      on_time: number;
      on_time_pct: number;
    }>(
      `SELECT
          DATE_FORMAT(t.posting_date, '%Y-%m')          AS month,
          COUNT(*)                                       AS total_dispatched,
          SUM(t.on_time)                                 AS on_time,
          ROUND(100 * SUM(t.on_time) / COUNT(*), 1)      AS on_time_pct
       FROM (
         SELECT dn.name, dn.posting_date,
                CASE WHEN dn.posting_date <= MIN(so.delivery_date) THEN 1 ELSE 0 END AS on_time
         FROM \`tabDelivery Note\` dn
         JOIN \`tabDelivery Note Item\` dni ON dni.parent = dn.name
         JOIN \`tabSales Order\` so ON so.name = dni.against_sales_order
         WHERE dn.docstatus = 1 AND dn.is_return = 0
           AND dn.posting_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
         GROUP BY dn.name, dn.posting_date
       ) t
       GROUP BY DATE_FORMAT(t.posting_date, '%Y-%m')
       ORDER BY month`,
    );
    return rows.map((r) => ({
      month: r.month,
      totalDispatches: Number(r.total_dispatched),
      onTime: Number(r.on_time),
      onTimePct: Number(r.on_time_pct),
    }));
  }

  // ── W-DISP-11 — Action queue (2 tabs) ────────────────────────────────────────

  private async getDnsToSubmit(): Promise<DnToSubmitRow[]> {
    const rows = await this.erpDb.query<{
      dn_no: string;
      customer_name: string;
      product: string | null;
      target_date: string | null;
      value: number;
    }>(
      `SELECT
          dn.name AS dn_no, dn.customer_name,
          (SELECT di.item_name FROM \`tabDelivery Note Item\` di WHERE di.parent=dn.name ORDER BY di.idx LIMIT 1) AS product,
          MIN(so.delivery_date)         AS target_date,
          ROUND(dn.base_grand_total, 0) AS value
       FROM \`tabDelivery Note\` dn
       LEFT JOIN \`tabDelivery Note Item\` dni ON dni.parent = dn.name
       LEFT JOIN \`tabSales Order\` so ON so.name = dni.against_sales_order
       WHERE dn.docstatus = 0 AND dn.is_return = 0
         AND IFNULL(dn.vehicle_no,'') <> ''
         AND EXISTS (SELECT 1 FROM \`tabDelivery Note Item\` d2 JOIN \`tabSales Order\` s2 ON s2.name=d2.against_sales_order
                     WHERE d2.parent=dn.name AND IFNULL(s2.po_no,'')<>'')
         AND EXISTS (SELECT 1 FROM \`tabQuality Inspection\` qi
                     WHERE qi.reference_type='Delivery Note' AND qi.reference_name=dn.name AND qi.status='Accepted')
       GROUP BY dn.name, dn.customer_name, dn.base_grand_total
       ORDER BY target_date ASC`,
    );
    return rows.map((r) => ({
      dnNo: r.dn_no,
      customerName: r.customer_name,
      product: r.product ?? '—',
      targetDate: r.target_date,
      value: Number(r.value),
    }));
  }

  private async getInvoicesAwaitingDispatch(): Promise<InvoiceAwaitingDispatchRow[]> {
    const rows = await this.erpDb.query<{
      invoice_no: string;
      customer_name: string;
      amount: number;
      posting_date: string;
      first_item: string | null;
    }>(
      `SELECT
          si.name AS invoice_no, si.customer_name,
          ROUND(si.base_grand_total, 0) AS amount, si.posting_date,
          (SELECT sii.item_name FROM \`tabSales Invoice Item\` sii WHERE sii.parent=si.name ORDER BY sii.idx LIMIT 1) AS first_item
       FROM \`tabSales Invoice\` si
       WHERE si.docstatus = 1 AND si.is_return = 0 AND IFNULL(si.update_stock,0) = 0
         AND si.posting_date >= CURDATE() - INTERVAL 12 MONTH
         AND NOT EXISTS (SELECT 1 FROM \`tabSales Invoice Item\` sii
                         WHERE sii.parent=si.name AND IFNULL(sii.delivery_note,'')<>'')
         AND EXISTS (SELECT 1 FROM \`tabSales Invoice Item\` s3 JOIN \`tabItem\` it ON it.name=s3.item_code
                     WHERE s3.parent=si.name AND IFNULL(it.is_stock_item,0)=1)
       ORDER BY si.posting_date DESC`,
    );
    return rows.map((r) => ({
      invoiceNo: r.invoice_no,
      customerName: r.customer_name,
      amount: Number(r.amount),
      postingDate: r.posting_date,
      firstItem: r.first_item ?? '—',
    }));
  }

  private async getDispatchActionQueue(): Promise<DispatchActionQueue> {
    const [dnsToSubmit, invoicesAwaitingDispatch] = await Promise.all([
      this.getDnsToSubmit(),
      this.getInvoicesAwaitingDispatch(),
    ]);
    return { dnsToSubmit, invoicesAwaitingDispatch };
  }

  // ── A-DISP-01..05 — Alert triggers ───────────────────────────────────────────

  // A-DISP-01 (red) — committed dispatch today (SO delivery_date=today), WO Completed, no DN yet.
  private async getCommittedDispatchToday(): Promise<CommittedDispatchTodayRow[]> {
    const rows = await this.erpDb.query<{
      sales_order: string;
      customer_name: string;
      delivery_date: string;
      value: number;
    }>(
      `SELECT so.name AS sales_order, so.customer_name, so.delivery_date,
              ROUND(so.base_grand_total, 0) AS value
       FROM \`tabSales Order\` so
       WHERE so.docstatus = 1 AND so.delivery_date = CURDATE() AND so.per_delivered < 100
         AND EXISTS (SELECT 1 FROM \`tabWork Order\` wo WHERE wo.sales_order = so.name AND wo.status = 'Completed')
         AND NOT EXISTS (SELECT 1 FROM \`tabDelivery Note Item\` dni
                         JOIN \`tabDelivery Note\` dn ON dn.name = dni.parent AND dn.docstatus < 2
                         WHERE dni.against_sales_order = so.name)`,
    );
    return rows.map((r) => ({
      salesOrder: r.sales_order,
      customerName: r.customer_name,
      deliveryDate: r.delivery_date,
      value: Number(r.value),
    }));
  }

  // A-DISP-02 (red) — Work Orders past expected_delivery_date by > 3 days, bounded to recently-due (90d).
  private async getWoDelayed(): Promise<WoDelayedRow[]> {
    const rows = await this.erpDb.query<{
      work_order: string;
      sales_order: string;
      production_item: string;
      expected_delivery_date: string;
      days_late: number;
    }>(
      `SELECT wo.name AS work_order, wo.sales_order, wo.production_item,
              wo.expected_delivery_date, DATEDIFF(CURDATE(), wo.expected_delivery_date) AS days_late
       FROM \`tabWork Order\` wo
       WHERE wo.docstatus = 1
         AND wo.status NOT IN ('Completed','Stopped','Closed','Cancelled')
         AND wo.expected_delivery_date IS NOT NULL
         AND wo.expected_delivery_date < CURDATE() - INTERVAL 3 DAY
         AND wo.expected_delivery_date >= CURDATE() - INTERVAL 90 DAY
       ORDER BY days_late DESC
       LIMIT 20`,
    );
    return rows.map((r) => ({
      workOrder: r.work_order,
      salesOrder: r.sales_order,
      productionItem: r.production_item,
      expectedDeliveryDate: r.expected_delivery_date,
      daysLate: Number(r.days_late),
    }));
  }

  // A-DISP-03 (amber) — draft DN, no vehicle, connected SO delivery_date within 3 days.
  private async getNoVehicleTargetSoon(): Promise<NoVehicleTargetSoonRow[]> {
    const rows = await this.erpDb.query<{ dn_no: string; customer_name: string; target_date: string | null }>(
      `SELECT dn.name AS dn_no, dn.customer_name, MIN(so.delivery_date) AS target_date
       FROM \`tabDelivery Note\` dn
       JOIN \`tabDelivery Note Item\` dni ON dni.parent = dn.name
       JOIN \`tabSales Order\` so ON so.name = dni.against_sales_order
       WHERE dn.docstatus = 0 AND dn.is_return = 0 AND IFNULL(dn.vehicle_no,'') = ''
         AND so.delivery_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 3 DAY
       GROUP BY dn.name, dn.customer_name
       ORDER BY target_date ASC`,
    );
    return rows.map((r) => ({ dnNo: r.dn_no, customerName: r.customer_name, targetDate: r.target_date }));
  }

  // A-DISP-05 (amber) — no submitted DN in the last 3 days.
  private async getNoDispatch3Days(): Promise<number> {
    const rows = await this.erpDb.query<{ dns_last_3_days: number }>(
      `SELECT COUNT(*) AS dns_last_3_days
       FROM \`tabDelivery Note\`
       WHERE docstatus = 1 AND is_return = 0
         AND posting_date >= CURDATE() - INTERVAL 3 DAY`,
    );
    return Number(rows[0]?.dns_last_3_days ?? 0);
  }

  private async getDispatchAlerts(): Promise<DispatchAlerts> {
    const [committedDispatchToday, woDelayed, noVehicleTargetSoon, noDispatch3Days] = await Promise.all([
      this.getCommittedDispatchToday(),
      this.getWoDelayed(),
      this.getNoVehicleTargetSoon(),
      this.getNoDispatch3Days(),
    ]);
    return { committedDispatchToday, woDelayed, noVehicleTargetSoon, noDispatch3Days };
  }

  // ── Main homepage aggregate ───────────────────────────────────────────────────

  async getDispatchHomepage(fyStart?: string, fyEnd?: string): Promise<DispatchHomepageData> {
    const fy = fyStart && fyEnd ? { fyStart, fyEnd } : this.currentFiscalYearRange();
    const cacheKey = `${CACHE_KEY}:${fy.fyStart}:${fy.fyEnd}`;

    const cached = await this.cache.get<DispatchHomepageData>(cacheKey);
    if (cached) return cached;

    const data = await this.computeDispatchHomepage(fy.fyStart, fy.fyEnd);
    await this.cache.set(cacheKey, data, CACHE_TTL);
    return data;
  }

  private async computeDispatchHomepage(fyStart: string, fyEnd: string): Promise<DispatchHomepageData> {
    const [
      readyToDispatch,
      dispatchBlocked,
      dispatchedThisWeek,
      ewayBillsExpiring,
      revenuePendingInvoice,
      stageFlow,
      pipelineTable,
      vehicleBooking,
      scheduleThisWeek,
      onTimeDispatch,
      actionQueue,
      alerts,
    ] = await Promise.all([
      this.getReadyToDispatch(fyStart, fyEnd),
      this.getDispatchBlocked(fyStart, fyEnd),
      this.getDispatchedThisWeek(),
      this.getEwayBillsExpiring(),
      this.getRevenuePendingInvoice(fyStart, fyEnd),
      this.getDispatchStageFlow(),
      this.getDispatchPipelineTable(),
      this.getVehicleBooking(),
      this.getDispatchScheduleThisWeek(),
      this.getOnTimeDispatch(),
      this.getDispatchActionQueue(),
      this.getDispatchAlerts(),
    ]);

    return {
      syncedAt: new Date().toISOString(),
      erpBaseUrl: this.erpBaseUrl(),
      readyToDispatch,
      dispatchBlocked,
      dispatchedThisWeek,
      ewayBillsExpiring,
      revenuePendingInvoice,
      stageFlow,
      pipelineTable,
      vehicleBooking,
      scheduleThisWeek,
      onTimeDispatch,
      actionQueue,
      alerts,
    };
  }
}
