import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
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

// asmId/engineerId/customerId filters accept a comma-separated list from the
// frontend's multi-select search box (2026-07-31) — always built as an `in`
// filter so single- and multi-select take the same code path.
function idFilter(value?: string): { in: string[] } | undefined {
  if (!value) return undefined;
  const ids = value.split(',').map((v) => v.trim()).filter(Boolean);
  return ids.length ? { in: ids } : undefined;
}

/**
 * FSD §6.3 — 12 standard reports. 11 of 12 buildable (Warranty Cost Tracker
 * still blocked — see ACE-Ticket-Engine-Build-Plan.md T5 section). Built as
 * plain, standalone functions (not tied to the controller) per the FSD's own
 * "all reports support scheduled auto-email" requirement — Phase 2 (not yet
 * built, client decision 2026-07-31: view + export now, scheduling later)
 * just needs to call these same functions from a cron instead of a
 * controller, no rewrite. On-demand view + Excel/PDF export only, this pass.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------- 1. Open Tickets by Status
  async openTicketsByStatus(f: ReportFilters): Promise<ReportResult> {
    const where: Prisma.TicketWhereInput = {
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
    const entries = await this.prisma.ticketAuditLog.findMany({
      where: { ticketId, fieldName: 'status' },
      orderBy: { changedAt: 'asc' },
    });
    // No FK relation from TicketAuditLog to User exists (raw changedByUserId
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
    const rows = quotations.map((q) => {
      const partsValue = q.items.reduce((s, it) => s + Number(it.lineTotal), 0);
      const labourValue = Number(q.labourCharges ?? 0);
      return {
        month: monthKey(q.quotationDate),
        customer: q.customer.customerName,
        service_type: q.ticket.serviceType ?? 'N/A',
        ticket_id: q.ticket.ticketNo,
        invoice_value_parts: partsValue.toFixed(2),
        invoice_value_labour: labourValue.toFixed(2),
        total: (partsValue + labourValue).toFixed(2),
        invoice_status: q.erpnextInvoiceId ? 'Invoiced' : 'Not Invoiced',
      };
    });
    return {
      columns: [
        { key: 'month', label: 'Month' },
        { key: 'customer', label: 'Customer' },
        { key: 'service_type', label: 'Service Type' },
        { key: 'ticket_id', label: 'Ticket ID' },
        { key: 'invoice_value_parts', label: 'Parts Value' },
        { key: 'invoice_value_labour', label: 'Labour Value' },
        { key: 'total', label: 'Total' },
        { key: 'invoice_status', label: 'Invoice Status' },
      ],
      rows,
    };
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
      // FSD formula divides by a "configurable work_hours_per_day" — no such
      // admin setting exists yet; defaulted to a constant 8h/day until it does.
      const availableHours = windowDays * 8;
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
}
