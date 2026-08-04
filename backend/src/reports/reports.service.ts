import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Region } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ErpDbService } from '../erp/erp-db.service';
import { BillingRateService } from '../ticketing/billing-rates/billing-rate.service';
import { ReportColumn } from './report-export.util';

export interface ReportResult {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
}

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  region?: string;
  serviceType?: string;
  priority?: string;
  asmId?: string;
  engineerId?: string;
  customerId?: string;
  equipmentCategory?: string;
  renewalStatus?: string;
  ruleType?: string;
  month?: string; // YYYY-MM
}

function dateRange(f: ReportFilters): Prisma.DateTimeFilter | undefined {
  if (!f.dateFrom && !f.dateTo) return undefined;
  return {
    ...(f.dateFrom ? { gte: new Date(f.dateFrom) } : {}),
    ...(f.dateTo ? { lte: new Date(f.dateTo) } : {}),
  };
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60);
}

/** docstatus: 0 = Draft, 1 = Submitted, 2 = Cancelled (Frappe convention, per CLAUDE.md). */
function erpInvoiceStatusLabel(erpnextInvoiceId: string | null, invoice: { docstatus: number } | undefined): string {
  if (!erpnextInvoiceId) return 'Not Invoiced';
  if (!invoice) return 'Invoiced (record not found in ERPNext)';
  if (invoice.docstatus === 1) return 'Submitted';
  if (invoice.docstatus === 2) return 'Cancelled';
  return 'Draft (pending Finance submission)';
}

// asmId/engineerId/customerId filters accept a comma-separated list from the
// frontend's multi-select search box (2026-07-31) — always built as an `in`
// filter so single- and multi-select take the same code path.
function idFilter(value?: string): { in: string[] } | undefined {
  if (!value) return undefined;
  const ids = value.split(',').map((v) => v.trim()).filter(Boolean);
  return ids.length ? { in: ids } : undefined;
}

/**
 * FSD §6.3 — all 12 standard reports (Warranty Cost Tracker added
 * 2026-08-01, once its mechanism was client-confirmed — see method #12
 * below). Built as plain, standalone functions (not tied to the controller)
 * per the FSD's own "all reports support scheduled auto-email" requirement —
 * ScheduledReportCron calls these same functions instead of a controller,
 * no rewrite needed.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingRates: BillingRateService,
    private readonly erpDb: ErpDbService,
  ) {}

  // ------------------------------------------------------------- 1. Open Tickets by Status
  async openTicketsByStatus(f: ReportFilters): Promise<ReportResult> {
    const where: Prisma.TicketWhereInput = {
      // Bug fix (2026-08-01, found while wiring the Executive Dashboard's
      // "Open Tickets" tile): this never actually excluded CLOSED tickets,
      // despite the report's own description saying "every ticket that is
      // not yet Closed." Didn't change any number in the current dataset
      // (no CLOSED tickets exist yet), but would have silently overcounted
      // once some do.
      status: { not: 'CLOSED' },
      ...(f.dateFrom || f.dateTo ? { createdAt: dateRange(f) } : {}),
      ...(f.region ? { customer: { region: f.region as any } } : {}),
      ...(f.serviceType ? { serviceType: f.serviceType as any } : {}),
      ...(f.asmId ? { assignedAsmId: idFilter(f.asmId) } : {}),
      ...(f.priority ? { priority: f.priority as any } : {}),
    };
    const tickets = await this.prisma.ticket.findMany({
      where,
      include: { customer: true, equipment: true, assignedAsm: true, assignedEngineer: true },
      orderBy: { createdAt: 'desc' },
    });
    const now = Date.now();
    const rows = tickets.map((t) => ({
      ticket_id: t.ticketNo,
      subject: t.subject,
      customer: t.customer.customerName,
      equipment_model: t.equipment?.itemName ?? 'N/A',
      service_type: t.serviceType ?? 'Not yet determined',
      priority: t.priority,
      status: t.status,
      asm: t.assignedAsm?.fullName ?? 'Unassigned',
      engineer: t.assignedEngineer?.fullName ?? 'Unassigned',
      days_open: Math.floor((now - t.createdAt.getTime()) / 86400000),
      sla_due: t.slaResolutionDue?.toISOString().slice(0, 10) ?? 'N/A',
    }));
    return {
      columns: [
        { key: 'ticket_id', label: 'Ticket ID' },
        { key: 'subject', label: 'Subject' },
        { key: 'customer', label: 'Customer' },
        { key: 'equipment_model', label: 'Equipment' },
        { key: 'service_type', label: 'Service Type' },
        { key: 'priority', label: 'Priority' },
        { key: 'status', label: 'Status' },
        { key: 'asm', label: 'ASM' },
        { key: 'engineer', label: 'Engineer' },
        { key: 'days_open', label: 'Days Open' },
        { key: 'sla_due', label: 'SLA Due' },
      ],
      rows,
    };
  }

  // ------------------------------------------------------------- 2. Ticket Status Timeline
  async ticketStatusTimeline(ticketId: string): Promise<ReportResult> {
    const ticket = await this.prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    const entries = await this.prisma.auditLog.findMany({
      where: { entityType: 'TICKET', entityId: ticketId, fieldName: 'status' },
      orderBy: { changedAt: 'asc' },
    });
    // No FK relation from AuditLog to User exists (raw changedByUserId
    // scalar only) — batch-fetch names separately rather than adding a
    // schema relation just for this report.
    const userIds = [...new Set(entries.map((e) => e.changedByUserId))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } });
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));

    const rows: Record<string, unknown>[] = [];
    let prevAt = ticket.createdAt;
    for (const e of entries) {
      const match = e.newValue?.match(/^([A-Z_]+)/);
      const stateName = match?.[1] ?? e.newValue ?? '';
      rows.push({
        state: stateName,
        entered_at: e.changedAt.toISOString(),
        entered_by: nameById.get(e.changedByUserId) ?? 'System',
        duration_hours: hoursBetween(prevAt, e.changedAt).toFixed(1),
      });
      prevAt = e.changedAt;
    }
    return {
      columns: [
        { key: 'state', label: 'State' },
        { key: 'entered_at', label: 'Entered At' },
        { key: 'entered_by', label: 'Entered By' },
        { key: 'duration_hours', label: 'Duration in Previous State (hrs)' },
      ],
      rows,
    };
  }

  // ------------------------------------------------------------- 3. SLA Compliance
  async slaCompliance(f: ReportFilters): Promise<ReportResult> {
    const where: Prisma.TicketWhereInput = {
      ...(f.dateFrom || f.dateTo ? { createdAt: dateRange(f) } : {}),
      ...(f.region ? { customer: { region: f.region as any } } : {}),
      ...(f.serviceType ? { serviceType: f.serviceType as any } : {}),
      ...(f.engineerId ? { assignedEngineerId: idFilter(f.engineerId) } : {}),
      status: 'CLOSED',
    };
    const tickets = await this.prisma.ticket.findMany({ where });

    const byMonth = new Map<string, { serviceType: string; total: number; met: number; breached: number; respHours: number[]; resHours: number[] }>();
    for (const t of tickets) {
      const key = `${monthKey(t.createdAt)}|${t.serviceType ?? 'Unassigned'}`;
      const bucket = byMonth.get(key) ?? { serviceType: t.serviceType ?? 'Unassigned', total: 0, met: 0, breached: 0, respHours: [], resHours: [] };
      bucket.total++;
      if (t.slaResolutionMet) bucket.met++;
      if (t.slaResolutionStatus === 'BREACHED') bucket.breached++;
      if (t.slaResponseDue) bucket.respHours.push(hoursBetween(t.createdAt, t.slaResponseDue));
      if (t.slaResolutionDue) bucket.resHours.push(hoursBetween(t.createdAt, t.slaResolutionDue));
      byMonth.set(key, bucket);
    }
    const avg = (arr: number[]) => (arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0);
    const rows = [...byMonth.entries()].map(([key, b]) => ({
      month: key.split('|')[0],
      service_type: b.serviceType,
      total_tickets: b.total,
      met_sla: b.met,
      breached: b.breached,
      compliance_pct: b.total ? ((b.met / b.total) * 100).toFixed(1) : '0.0',
      avg_response_hours: avg(b.respHours).toFixed(1),
      avg_resolution_hours: avg(b.resHours).toFixed(1),
    }));
    return {
      columns: [
        { key: 'month', label: 'Month' },
        { key: 'service_type', label: 'Service Type' },
        { key: 'total_tickets', label: 'Total Tickets' },
        { key: 'met_sla', label: 'Met SLA' },
        { key: 'breached', label: 'Breached' },
        { key: 'compliance_pct', label: 'Compliance %' },
        { key: 'avg_response_hours', label: 'Avg Response (hrs)' },
        { key: 'avg_resolution_hours', label: 'Avg Resolution (hrs)' },
      ],
      rows,
    };
  }

  // ------------------------------------------------------------- 4. MTTR Report
  async mttrReport(f: ReportFilters): Promise<ReportResult> {
    const where: Prisma.TicketWhereInput = {
      ...(f.dateFrom || f.dateTo ? { createdAt: dateRange(f) } : {}),
      ...(f.region ? { customer: { region: f.region as any } } : {}),
      ...(f.serviceType ? { serviceType: f.serviceType as any } : {}),
      status: 'CLOSED',
      closedAt: { not: null },
    };
    const tickets = await this.prisma.ticket.findMany({ where, include: { customer: true } });

    const byBucket = new Map<string, { serviceType: string; region: string; hours: number[] }>();
    for (const t of tickets) {
      if (!t.closedAt) continue;
      const key = `${monthKey(t.createdAt)}|${t.serviceType ?? 'Unassigned'}|${t.customer.region ?? 'Unknown'}`;
      const bucket = byBucket.get(key) ?? { serviceType: t.serviceType ?? 'Unassigned', region: t.customer.region ?? 'Unknown', hours: [] };
      bucket.hours.push(hoursBetween(t.createdAt, t.closedAt));
      byBucket.set(key, bucket);
    }
    const rows = [...byBucket.entries()].map(([key, b]) => {
      const avg = b.hours.reduce((s, n) => s + n, 0) / b.hours.length;
      return {
        month: key.split('|')[0],
        service_type: b.serviceType,
        region: b.region,
        ticket_count: b.hours.length,
        avg_resolution_hours: avg.toFixed(1),
        min_hours: Math.min(...b.hours).toFixed(1),
        max_hours: Math.max(...b.hours).toFixed(1),
      };
    });
    return {
      columns: [
        { key: 'month', label: 'Month' },
        { key: 'service_type', label: 'Service Type' },
        { key: 'region', label: 'Region' },
        { key: 'ticket_count', label: 'Ticket Count' },
        { key: 'avg_resolution_hours', label: 'Avg Resolution (hrs)' },
        { key: 'min_hours', label: 'Min (hrs)' },
        { key: 'max_hours', label: 'Max (hrs)' },
      ],
      rows,
    };
  }

  // ------------------------------------------------------------- 5. Service Revenue Report
  /**
   * Correctness fix (2026-08-04): `total`/`invoice_status` now reflect the
   * REAL ERPNext Sales Invoice (`grand_total`, `docstatus`) for quotations
   * that have one, not the internal quoted amount — previously every row
   * showed the quote's own parts+labour total regardless of whether it was
   * ever actually invoiced, which silently overstated revenue for anything
   * quoted-but-never-approved. `invoice_value_parts`/`invoice_value_labour`
   * stay this app's own line-item split (ERPNext's grand_total doesn't come
   * pre-split that way) — still shown for reference, but `total`/`invoice_status`
   * are now the authoritative numbers.
   */
  async serviceRevenueReport(f: ReportFilters): Promise<ReportResult> {
    const where: Prisma.QuotationWhereInput = {
      ...(f.dateFrom || f.dateTo ? { quotationDate: dateRange(f) } : {}),
      ...(f.customerId ? { customerId: idFilter(f.customerId) } : {}),
      ...(f.serviceType ? { ticket: { serviceType: f.serviceType as any } } : {}),
    };
    const quotations = await this.prisma.quotation.findMany({
      where,
      include: { customer: true, ticket: true, items: true },
    });
    const invoices = await this.fetchErpInvoices(quotations.map((q) => q.erpnextInvoiceId).filter((id): id is string => !!id));

    const rows = quotations.map((q) => {
      const partsValue = q.items.reduce((s, it) => s + Number(it.lineTotal), 0);
      const labourValue = Number(q.labourCharges ?? 0);
      const invoice = q.erpnextInvoiceId ? invoices.get(q.erpnextInvoiceId) : undefined;
      const total = invoice ? invoice.grand_total : partsValue + labourValue;
      return {
        month: monthKey(q.quotationDate),
        customer: q.customer.customerName,
        service_type: q.ticket.serviceType ?? 'N/A',
        ticket_id: q.ticket.ticketNo,
        invoice_value_parts: partsValue.toFixed(2),
        invoice_value_labour: labourValue.toFixed(2),
        total: total.toFixed(2),
        invoice_status: erpInvoiceStatusLabel(q.erpnextInvoiceId, invoice),
      };
    });
    return {
      columns: [
        { key: 'month', label: 'Month' },
        { key: 'customer', label: 'Customer' },
        { key: 'service_type', label: 'Service Type' },
        { key: 'ticket_id', label: 'Ticket ID' },
        { key: 'invoice_value_parts', label: 'Parts Value (quoted)' },
        { key: 'invoice_value_labour', label: 'Labour Value (quoted)' },
        { key: 'total', label: 'Total (real ERPNext invoice if available, else quoted)' },
        { key: 'invoice_status', label: 'Invoice Status' },
      ],
      rows,
    };
  }

  /** Batch-fetches real ERPNext Sales Invoice rows via the read-only ERP DB connection — grand_total/docstatus, keyed by invoice name. */
  private async fetchErpInvoices(erpnextInvoiceIds: string[]): Promise<Map<string, { grand_total: number; docstatus: number }>> {
    const byId = new Map<string, { grand_total: number; docstatus: number }>();
    const uniqueIds = [...new Set(erpnextInvoiceIds)];
    if (uniqueIds.length === 0) return byId;
    const placeholders = uniqueIds.map(() => '?').join(',');
    const rows = await this.erpDb.query<{ name: string; grand_total: string | number; docstatus: number }>(
      `SELECT name, grand_total, docstatus FROM \`tabSales Invoice\` WHERE name IN (${placeholders})`,
      uniqueIds,
    );
    for (const row of rows) byId.set(row.name, { grand_total: Number(row.grand_total), docstatus: row.docstatus });
    return byId;
  }

  /**
   * Revenue MTD (§6.1 dashboard tile, Manager + Executive) — "Sum of Sales
   * Invoice grand_total linked to tickets, current month." Scoped to
   * **Submitted** invoices only (docstatus=1) — every invoice this app
   * creates is a draft (never auto-submitted, per project policy), so a
   * draft hasn't actually become real revenue yet, just a pending one.
   * `pendingDraftTotal` is returned alongside so the UI can still show
   * what's sitting in Finance's queue, without conflating it with realized
   * revenue in the headline number.
   */
  async revenueMtd(
    dateFrom: Date,
    dateTo: Date,
    regions?: Region[],
  ): Promise<{ revenue: number; pendingDraftTotal: number; invoicedTicketCount: number }> {
    const tickets = await this.prisma.ticket.findMany({
      where: {
        closedAt: { gte: dateFrom, lte: dateTo },
        erpnextInvoiceId: { not: null },
        ...(regions && regions.length > 0 ? { customer: { region: { in: regions } } } : {}),
      },
      select: { erpnextInvoiceId: true },
    });
    const invoiceIds = tickets.map((t) => t.erpnextInvoiceId).filter((id): id is string => !!id);
    const invoices = await this.fetchErpInvoices(invoiceIds);

    let revenue = 0;
    let pendingDraftTotal = 0;
    for (const inv of invoices.values()) {
      if (inv.docstatus === 1) revenue += inv.grand_total;
      else if (inv.docstatus === 0) pendingDraftTotal += inv.grand_total;
    }
    return { revenue, pendingDraftTotal, invoicedTicketCount: invoiceIds.length };
  }

  // ------------------------------------------------------------- 6. Equipment Breakdown Frequency
  async equipmentBreakdownFrequency(f: ReportFilters): Promise<ReportResult> {
    const since = new Date();
    since.setMonth(since.getMonth() - 6);
    const where: Prisma.EquipmentWhereInput = {
      ...(f.equipmentCategory ? { equipmentCategory: f.equipmentCategory as any } : {}),
      ...(f.customerId ? { customerId: idFilter(f.customerId) } : {}),
    };
    const equipment = await this.prisma.equipment.findMany({
      where,
      include: {
        customer: true,
        site: true,
        tickets: { where: { serviceType: 'BREAKDOWN_CHARGEABLE', createdAt: { gte: since } } },
      },
    });
    const rows = equipment
      .filter((eq) => eq.tickets.length > 0)
      .map((eq) => {
        const closed = eq.tickets.filter((t) => t.status === 'CLOSED' && t.closedAt);
        const avgMttr = closed.length
          ? closed.reduce((s, t) => s + hoursBetween(t.createdAt, t.closedAt!), 0) / closed.length
          : 0;
        const lastBreakdown = eq.tickets.reduce((latest, t) => (t.createdAt > latest ? t.createdAt : latest), eq.tickets[0].createdAt);
        return {
          serial_no: eq.serialNo,
          equipment_model: eq.itemName,
          customer: eq.customer.customerName,
          site: eq.site?.siteName ?? 'N/A',
          breakdown_count: eq.tickets.length,
          last_breakdown_date: lastBreakdown.toISOString().slice(0, 10),
          avg_mttr_hours: avgMttr.toFixed(1),
        };
      })
      .sort((a, b) => b.breakdown_count - a.breakdown_count);
    return {
      columns: [
        { key: 'serial_no', label: 'Serial No.' },
        { key: 'equipment_model', label: 'Equipment' },
        { key: 'customer', label: 'Customer' },
        { key: 'site', label: 'Site' },
        { key: 'breakdown_count', label: 'Breakdowns (6mo)' },
        { key: 'last_breakdown_date', label: 'Last Breakdown' },
        { key: 'avg_mttr_hours', label: 'Avg MTTR (hrs)' },
      ],
      rows,
    };
  }

  // ------------------------------------------------------------- 7. Spares Demand Signal
  async sparesDemandSignal(): Promise<ReportResult> {
    const since = new Date();
    since.setMonth(since.getMonth() - 3);
    const items = await this.prisma.item.findMany();
    const consumed = await this.prisma.fsvPartConsumed.groupBy({
      by: ['itemCode'],
      where: { visit: { submittedAt: { gte: since } } },
      _sum: { qty: true },
    });
    const consumedMap = new Map(consumed.map((c) => [c.itemCode, Number(c._sum.qty ?? 0)]));

    const rows = items
      .map((item) => {
        const qtyConsumed = consumedMap.get(item.itemCode) ?? 0;
        const currentStock = item.currentStock ?? 0;
        const minStock = item.minimumStockLevel;
        const reorder = minStock != null && currentStock < minStock;
        return {
          item_code: item.itemCode,
          item_name: item.itemName,
          qty_consumed_3m: qtyConsumed,
          current_stock: currentStock,
          minimum_stock_level: minStock ?? 'N/A',
          reorder_flag: reorder ? 'Yes' : 'No',
          deficit: reorder ? (minStock! - currentStock).toFixed(1) : '0',
        };
      })
      .filter((r) => r.qty_consumed_3m > 0 || r.reorder_flag === 'Yes');
    return {
      columns: [
        { key: 'item_code', label: 'Item Code' },
        { key: 'item_name', label: 'Item Name' },
        { key: 'qty_consumed_3m', label: 'Qty Consumed (3mo)' },
        { key: 'current_stock', label: 'Current Stock' },
        { key: 'minimum_stock_level', label: 'Min Stock Level' },
        { key: 'reorder_flag', label: 'Reorder?' },
        { key: 'deficit', label: 'Deficit' },
      ],
      rows,
    };
  }

  // ------------------------------------------------------------- 8. AMC Portfolio Report
  async amcPortfolioReport(f: ReportFilters): Promise<ReportResult> {
    const where: Prisma.AmcContractWhereInput = {
      ...(f.customerId ? { customerId: idFilter(f.customerId) } : {}),
      ...(f.region ? { customer: { region: f.region as any } } : {}),
      ...(f.renewalStatus ? { renewalStatus: f.renewalStatus as any } : {}),
    };
    const contracts = await this.prisma.amcContract.findMany({
      where,
      include: { customer: true, coveredEquipment: true, scheduledVisits: true },
    });
    const rows = contracts.map((c) => ({
      contract_id: c.contractReferenceNo,
      customer: c.customer.customerName,
      equipment_count: c.coveredEquipment.length,
      start_date: c.startDate.toISOString().slice(0, 10),
      end_date: c.endDate.toISOString().slice(0, 10),
      contract_value: Number(c.contractValue).toFixed(2),
      visits_scheduled: c.scheduledVisits.length,
      visits_completed: c.scheduledVisits.filter((v) => v.status === 'TICKET_RAISED' || v.actualDate).length,
      renewal_status: c.renewalStatus,
    }));
    return {
      columns: [
        { key: 'contract_id', label: 'Contract ID' },
        { key: 'customer', label: 'Customer' },
        { key: 'equipment_count', label: 'Equipment Count' },
        { key: 'start_date', label: 'Start Date' },
        { key: 'end_date', label: 'End Date' },
        { key: 'contract_value', label: 'Contract Value' },
        { key: 'visits_scheduled', label: 'Visits Scheduled' },
        { key: 'visits_completed', label: 'Visits Completed' },
        { key: 'renewal_status', label: 'Renewal Status' },
      ],
      rows,
    };
  }

  // ------------------------------------------------------------- 9. Predictive Maintenance Alerts Log
  async predictiveMaintenanceAlertsLog(f: ReportFilters): Promise<ReportResult> {
    const where: Prisma.TicketWhereInput = {
      source: 'PREDICTIVE',
      ...(f.dateFrom || f.dateTo ? { createdAt: dateRange(f) } : {}),
      ...(f.equipmentCategory ? { equipment: { equipmentCategory: f.equipmentCategory as any } } : {}),
    };
    const tickets = await this.prisma.ticket.findMany({ where, include: { customer: true, equipment: true } });

    function ruleType(description: string): string {
      if (description.includes('Breakdown frequency')) return 'Breakdown Frequency';
      if (description.includes('operating hours') || description.toLowerCase().includes('operating hours interval')) return 'Operating Hours Interval';
      if (description.includes('Field Service Visit')) return 'Time Since Last Service';
      return 'Predictive';
    }
    let rows = tickets.map((t) => ({
      alert_date: t.createdAt.toISOString().slice(0, 10),
      rule_type: ruleType(t.description),
      equipment_serial: t.equipment?.serialNo ?? 'N/A',
      customer: t.customer.customerName,
      alert_description: t.description,
      ticket_created: 'Y',
      ticket_id: t.ticketNo,
    }));
    if (f.ruleType) rows = rows.filter((r) => r.rule_type === f.ruleType);
    return {
      columns: [
        { key: 'alert_date', label: 'Alert Date' },
        { key: 'rule_type', label: 'Rule Type' },
        { key: 'equipment_serial', label: 'Equipment Serial' },
        { key: 'customer', label: 'Customer' },
        { key: 'alert_description', label: 'Description' },
        { key: 'ticket_created', label: 'Ticket Created?' },
        { key: 'ticket_id', label: 'Ticket ID' },
      ],
      rows,
    };
  }

  // ------------------------------------------------------------- 10. Engineer Performance Report
  async engineerPerformanceReport(f: ReportFilters): Promise<ReportResult> {
    const where: Prisma.UserWhereInput = {
      role: 'ENGINEER',
      ...(f.engineerId ? { id: idFilter(f.engineerId) } : {}),
      ...(f.region ? { regions: { some: { region: f.region as any } } } : {}),
    };
    const engineers = await this.prisma.user.findMany({ where });
    const dateFilter = f.dateFrom || f.dateTo ? dateRange(f) : undefined;
    const hoursPerDay = await this.billingRates.getUtilizationHoursPerDay();

    const rows = [];
    for (const eng of engineers) {
      const tickets = await this.prisma.ticket.findMany({
        where: { assignedEngineerId: eng.id, ...(dateFilter ? { createdAt: dateFilter } : {}) },
      });
      if (tickets.length === 0) continue;
      const closed = tickets.filter((t) => t.status === 'CLOSED' && t.closedAt);
      const avgMttr = closed.length ? closed.reduce((s, t) => s + hoursBetween(t.createdAt, t.closedAt!), 0) / closed.length : 0;
      const firstAcceptCount = tickets.filter((t) => t.rejectionCount === 0).length;
      const csatScores = tickets.filter((t) => t.csatScore != null).map((t) => t.csatScore!);
      const avgCsat = csatScores.length ? csatScores.reduce((s, n) => s + n, 0) / csatScores.length : null;

      const fsvs = await this.prisma.fieldServiceVisit.findMany({
        where: { engineerId: eng.id, workStartTime: { not: null }, workEndTime: { not: null } },
      });
      const totalWorkedHours = fsvs.reduce((s, v) => s + hoursBetween(v.workStartTime!, v.workEndTime!), 0);
      const windowDays = f.dateFrom && f.dateTo ? (new Date(f.dateTo).getTime() - new Date(f.dateFrom).getTime()) / 86400000 : 30;
      // FSD formula divides by "engineer headcount × configurable
      // work_hours_per_day" — Admin-configurable (2026-08-04), see
      // BillingRateService.getUtilizationHoursPerDay(); was hardcoded to 8.
      const availableHours = windowDays * hoursPerDay;
      const utilizationPct = availableHours > 0 ? (totalWorkedHours / availableHours) * 100 : 0;

      rows.push({
        engineer_name: eng.fullName,
        total_tickets: tickets.length,
        avg_mttr_hours: avgMttr.toFixed(1),
        first_accept_rate_pct: ((firstAcceptCount / tickets.length) * 100).toFixed(1),
        avg_csat: avgCsat != null ? avgCsat.toFixed(1) : 'N/A',
        utilization_pct: Math.min(100, utilizationPct).toFixed(1),
      });
    }
    return {
      columns: [
        { key: 'engineer_name', label: 'Engineer' },
        { key: 'total_tickets', label: 'Total Tickets' },
        { key: 'avg_mttr_hours', label: 'Avg MTTR (hrs)' },
        { key: 'first_accept_rate_pct', label: 'First-Accept Rate %' },
        { key: 'avg_csat', label: 'Avg CSAT' },
        { key: 'utilization_pct', label: 'Utilization %' },
      ],
      rows,
    };
  }

  // ------------------------------------------------------------- 11. AMC Renewal Alert Summary
  async amcRenewalAlertSummary(f: ReportFilters): Promise<ReportResult> {
    const where: Prisma.AmcContractWhereInput = {
      renewalStatus: { in: ['RENEWAL_DUE', 'FINAL_NOTICE'] },
      ...(f.region ? { customer: { region: f.region as any } } : {}),
    };
    const contracts = await this.prisma.amcContract.findMany({ where, include: { customer: true, owningAsm: true } });
    let rows = contracts.map((c) => ({
      contract_id: c.contractReferenceNo,
      customer: c.customer.customerName,
      end_date: c.endDate.toISOString().slice(0, 10),
      days_remaining: Math.ceil((c.endDate.getTime() - Date.now()) / 86400000),
      renewal_status: c.renewalStatus,
      owning_asm: c.owningAsm?.fullName ?? 'Unassigned',
    }));
    if (f.month) rows = rows.filter((r) => r.end_date.startsWith(f.month!));
    return {
      columns: [
        { key: 'contract_id', label: 'Contract ID' },
        { key: 'customer', label: 'Customer' },
        { key: 'end_date', label: 'Expiry Date' },
        { key: 'days_remaining', label: 'Days Remaining' },
        { key: 'renewal_status', label: 'Renewal Status' },
        { key: 'owning_asm', label: 'Owning ASM' },
      ],
      rows,
    };
  }

  // ------------------------------------------------------------- 12. Warranty Cost Tracker
  /**
   * Client-confirmed mechanism (2026-08-01) — warranty tickets go through
   * the direct (non-Quotation) Sales Order path, with the SO carrying the
   * real item price and the Sales Invoice built from it zeroed out (see
   * QuotationService.createDirectInvoice). So this report is just "query
   * warranty-flagged Sales Invoices" as anticipated, not a new cost-capture
   * mechanism — filtered on a Delivery with no quotationId (the direct-path
   * marker) that has both a Sales Order and the zero-rate Invoice.
   */
  async warrantyCostTracker(f: ReportFilters): Promise<ReportResult> {
    const where: Prisma.TicketWhereInput = {
      ...(f.dateFrom || f.dateTo ? { closedAt: dateRange(f) } : {}),
      ...(f.region ? { customer: { region: f.region as any } } : {}),
      erpnextInvoiceId: { not: null },
      directDeliveries: { some: { quotationId: null, erpnextSalesOrderId: { not: null } } },
    };
    const tickets = await this.prisma.ticket.findMany({
      where,
      include: { customer: true, equipment: true, directDeliveries: true, visits: { include: { parts: true } } },
      orderBy: { closedAt: 'desc' },
    });
    const rows = tickets.map((t) => {
      const delivery = t.directDeliveries.find((d) => !d.quotationId && d.erpnextSalesOrderId);
      const partsCost = t.visits.flatMap((v) => v.parts).reduce((s, p) => s + Number(p.qty) * Number(p.sellingRate), 0);
      return {
        ticket_id: t.ticketNo,
        subject: t.subject,
        customer: t.customer.customerName,
        equipment_model: t.equipment?.itemName ?? 'N/A',
        classification: t.customerCategory ?? 'N/A',
        closed_at: t.closedAt?.toISOString().slice(0, 10) ?? 'N/A',
        parts_cost: partsCost.toFixed(2),
        erpnext_sales_order_id: delivery?.erpnextSalesOrderId ?? 'N/A',
        erpnext_invoice_id: t.erpnextInvoiceId ?? 'N/A',
      };
    });
    return {
      columns: [
        { key: 'ticket_id', label: 'Ticket ID' },
        { key: 'subject', label: 'Subject' },
        { key: 'customer', label: 'Customer' },
        { key: 'equipment_model', label: 'Equipment' },
        { key: 'classification', label: 'Classification' },
        { key: 'closed_at', label: 'Closed Date' },
        { key: 'parts_cost', label: 'Parts Cost (Internal, ₹)' },
        { key: 'erpnext_sales_order_id', label: 'ERPNext Sales Order' },
        { key: 'erpnext_invoice_id', label: 'ERPNext Invoice (₹0)' },
      ],
      rows,
    };
  }

  // ------------------------------------------------------------- 13. KPI Matrix (§6.2 Core KPIs)
  /**
   * FSD §6.2's 7 core KPIs, each with its stated target and breach-alert
   * threshold, computed fresh (not reused from the reports above — those are
   * shaped for the Reports UI's row/column export format, not a single
   * current-value-vs-target comparison). Deliberately excludes Revenue MTD —
   * that's a §6.1 dashboard tile, not one of the 7 §6.2 KPIs, and its
   * "Sales Invoice grand_total" formula needs a separate ERPNext-read
   * decision (draft vs submitted invoices) tracked as its own item.
   *
   * @param period Calendar month/quarter/year **to date**, ending now —
   * matches the FSD's own "MTD" framing elsewhere rather than a trailing
   * N-day window.
   * @param regions Scopes every KPI to these regions' customers/engineers
   * (2026-08-04, client decision: "Manager is region based so ... All KPI
   * should be region based") — omitted for Admin/MD's org-wide view, passed
   * for Manager (their own assigned regions, possibly more than one) and
   * per-region breach alerts.
   */
  async kpiMatrix(period: 'month' | 'quarter' | 'year', regions?: Region[]): Promise<KpiMatrixRow[]> {
    const now = new Date();
    const dateFrom =
      period === 'year'
        ? new Date(now.getFullYear(), 0, 1)
        : period === 'quarter'
          ? new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
          : new Date(now.getFullYear(), now.getMonth(), 1);

    const regionFilter = regions && regions.length > 0 ? { customer: { region: { in: regions } } } : {};

    const closedTickets = await this.prisma.ticket.findMany({
      where: { status: 'CLOSED', closedAt: { not: null }, createdAt: { gte: dateFrom, lte: now }, ...regionFilter },
    });

    // 1. SLA compliance %
    const slaTotal = closedTickets.length;
    const slaMet = closedTickets.filter((t) => t.slaResolutionMet).length;
    const slaPct = slaTotal ? (slaMet / slaTotal) * 100 : null;

    // 2/3. MTTR — Breakdown vs AMC/PM (FSD groups Scheduled PM + AMC together as "AMC/PM")
    const avgHours = (tickets: typeof closedTickets) =>
      tickets.length ? tickets.reduce((s, t) => s + hoursBetween(t.createdAt, t.closedAt!), 0) / tickets.length : null;
    const mttrBreakdown = avgHours(closedTickets.filter((t) => t.serviceType === 'BREAKDOWN_CHARGEABLE'));
    const mttrAmcPm = avgHours(closedTickets.filter((t) => t.serviceType === 'AMC' || t.serviceType === 'SCHEDULED_PM'));

    // 4. First response time — no `assignedAt` field on Ticket; first
    // ASSIGNED transition is in AuditLog (fieldName: 'status'), which
    // TicketsService writes on every status change. Tickets *created* in the
    // period, not just closed ones, since this measures response, not resolution.
    const createdTickets = await this.prisma.ticket.findMany({
      where: { createdAt: { gte: dateFrom, lte: now }, ...regionFilter },
      select: { id: true, createdAt: true, priority: true },
    });
    // Bug fix (2026-08-04): exact-match on newValue === 'ASSIGNED' silently
    // missed every transition with an attached comment — the audit log
    // stores those as "ASSIGNED (some note)" (see WorkflowService.applyTransition's
    // auditNote formatting), which includes the very common auto-routing
    // case ("ASSIGNED (Auto-routed to ...)"). `startsWith` matches both.
    const assignedLogs = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'TICKET',
        fieldName: 'status',
        newValue: { startsWith: 'ASSIGNED' },
        entityId: { in: createdTickets.map((t) => t.id) },
      },
      orderBy: { changedAt: 'asc' },
    });
    const firstAssignedAt = new Map<string, Date>();
    for (const log of assignedLogs) if (!firstAssignedAt.has(log.entityId)) firstAssignedAt.set(log.entityId, log.changedAt);
    const responseHoursByPriority = (priority: 'CRITICAL' | 'HIGH') =>
      avgHours(
        createdTickets
          .filter((t) => t.priority === priority && firstAssignedAt.has(t.id))
          .map((t) => ({ createdAt: t.createdAt, closedAt: firstAssignedAt.get(t.id)! }) as (typeof closedTickets)[number]),
      );
    const firstResponseCritical = responseHoursByPriority('CRITICAL');
    const firstResponseHigh = responseHoursByPriority('HIGH');

    // 5. CSAT score — org-wide average, asked at closure, so scoped to tickets closed in the period.
    const csatScores = closedTickets.map((t) => t.csatScore).filter((s): s is number => s != null);
    const csatAvg = csatScores.length ? csatScores.reduce((s, n) => s + n, 0) / csatScores.length : null;

    // 6. AMC renewal rate — "expired" = contracts whose term ended within the
    // period; "renewed within 30 days" = a successor contract (previousContractId
    // pointing back to it) exists, created within 30 days of the old endDate.
    const expiredContracts = await this.prisma.amcContract.findMany({
      where: { endDate: { gte: dateFrom, lte: now }, ...(regions && regions.length > 0 ? { customer: { region: { in: regions } } } : {}) },
    });
    let renewedInTime = 0;
    for (const c of expiredContracts) {
      const successor = await this.prisma.amcContract.findFirst({ where: { previousContractId: c.id } });
      if (successor && successor.createdAt.getTime() - c.endDate.getTime() <= 30 * 86400000) renewedInTime++;
    }
    const renewalRatePct = expiredContracts.length ? (renewedInTime / expiredContracts.length) * 100 : null;

    // 7. Engineer utilization — same formula as the Engineer Performance
    // Report (worked FSV hours / available hours), aggregated across all
    // engineers rather than per-engineer. work_hours_per_day is now
    // Admin-configurable (2026-08-04) — see BillingRateService.
    const engineers = await this.prisma.user.findMany({
      where: { role: 'ENGINEER', isActive: true, ...(regions && regions.length > 0 ? { regions: { some: { region: { in: regions } } } } : {}) },
    });
    const fsvs = await this.prisma.fieldServiceVisit.findMany({
      where: {
        workStartTime: { gte: dateFrom, lte: now },
        workEndTime: { not: null },
        ...(regions && regions.length > 0 ? { engineerId: { in: engineers.map((e) => e.id) } } : {}),
      },
    });
    const totalWorkedHours = fsvs.reduce((s, v) => s + hoursBetween(v.workStartTime!, v.workEndTime!), 0);
    const windowDays = Math.max(1, (now.getTime() - dateFrom.getTime()) / 86400000);
    const hoursPerDay = await this.billingRates.getUtilizationHoursPerDay();
    const availableHours = engineers.length * windowDays * hoursPerDay;
    const utilizationPct = availableHours > 0 ? (totalWorkedHours / availableHours) * 100 : null;

    const fmt = (v: number | null, digits = 1) => (v == null ? null : Number(v.toFixed(digits)));

    return [
      {
        kpi: 'SLA compliance %',
        formula: 'Resolved within SLA / Total resolved × 100',
        current: fmt(slaPct),
        unit: '%',
        target: '≥ 90%',
        breachAlert: '< 85% — alert to Ashwath',
        status: slaPct == null ? 'NO_DATA' : slaPct < 85 ? 'BREACHED' : slaPct < 90 ? 'BELOW_TARGET' : 'OK',
      },
      {
        kpi: 'MTTR — Breakdown',
        formula: 'Avg hours, creation to Engineer Resolved, Breakdown (Chargeable) tickets',
        current: fmt(mttrBreakdown),
        unit: 'hrs',
        target: '< 48 hours',
        breachAlert: 'Ashwath alert if rolling 7-day avg > 60h',
        status: mttrBreakdown == null ? 'NO_DATA' : mttrBreakdown > 48 ? 'BELOW_TARGET' : 'OK',
      },
      {
        kpi: 'MTTR — AMC/PM',
        formula: 'Same, AMC/Scheduled PM service types',
        current: fmt(mttrAmcPm),
        unit: 'hrs',
        target: '< 72 hours',
        breachAlert: '—',
        status: mttrAmcPm == null ? 'NO_DATA' : mttrAmcPm > 72 ? 'BELOW_TARGET' : 'OK',
      },
      {
        kpi: 'First response time — Critical',
        formula: "Avg hours, created_at to 'Assigned' state, Critical priority",
        current: fmt(firstResponseCritical),
        unit: 'hrs',
        target: '< 4 hours',
        breachAlert: 'Alert per SLA policy breach',
        status: firstResponseCritical == null ? 'NO_DATA' : firstResponseCritical > 4 ? 'BELOW_TARGET' : 'OK',
      },
      {
        kpi: 'First response time — High',
        formula: "Avg hours, created_at to 'Assigned' state, High priority",
        current: fmt(firstResponseHigh),
        unit: 'hrs',
        target: '< 8 hours',
        breachAlert: 'Alert per SLA policy breach',
        status: firstResponseHigh == null ? 'NO_DATA' : firstResponseHigh > 8 ? 'BELOW_TARGET' : 'OK',
      },
      {
        kpi: 'CSAT score',
        formula: 'Average customer CSAT rating 1–5',
        current: fmt(csatAvg, 2),
        unit: '/5',
        target: '≥ 4.0',
        breachAlert: '< 3.5 — alert to Ashwath',
        status: csatAvg == null ? 'NO_DATA' : csatAvg < 3.5 ? 'BREACHED' : csatAvg < 4.0 ? 'BELOW_TARGET' : 'OK',
      },
      {
        kpi: 'AMC renewal rate',
        formula: 'Contracts renewed within 30 days of expiry / Total expired contracts × 100',
        current: fmt(renewalRatePct),
        unit: '%',
        target: '≥ 80%',
        breachAlert: '< 70% — alert to Ashwath',
        status: renewalRatePct == null ? 'NO_DATA' : renewalRatePct < 70 ? 'BREACHED' : renewalRatePct < 80 ? 'BELOW_TARGET' : 'OK',
      },
      {
        kpi: 'Engineer utilization',
        formula: `Total FSV work_hours / (engineer headcount × work_hours_per_day, currently ${hoursPerDay}h/day, Admin-configurable)`,
        current: fmt(utilizationPct),
        unit: '%',
        target: '60–80%',
        breachAlert: '< 40% or > 90% flagged',
        status:
          utilizationPct == null
            ? 'NO_DATA'
            : utilizationPct < 40 || utilizationPct > 90
              ? 'BREACHED'
              : utilizationPct < 60 || utilizationPct > 80
                ? 'BELOW_TARGET'
                : 'OK',
      },
    ];
  }
}

export interface KpiMatrixRow {
  kpi: string;
  formula: string;
  current: number | null;
  unit: string;
  target: string;
  breachAlert: string;
  status: 'OK' | 'BELOW_TARGET' | 'BREACHED' | 'NO_DATA';
}
