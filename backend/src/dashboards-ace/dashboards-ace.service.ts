import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';

/**
 * CS Support + Executive/MD dashboards (2026-08-01) — the last 2 of the
 * FSD §6.1 role dashboards, previously placeholders (`href: null` in the
 * Dashboards hub). Separate module from `reports/` (Manager/Admin-only,
 * full filterable reports) — these are curated, read-only summaries for
 * different roles, but Executive/MD reuses ReportsService's methods
 * directly rather than re-deriving the same numbers client-side, unlike
 * the client-side-computed Call Center/ASM dashboards.
 */
@Injectable()
export class DashboardsAceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  /** Quotations pending PO, parts pending delivery — CS Support's work queue. */
  async csSupportSummary() {
    const quotationsPendingPo = await this.prisma.quotation.findMany({
      where: { status: 'SENT', customerPoNumber: null },
      include: { customer: true, ticket: true },
      orderBy: { sentAt: 'asc' },
    });
    const deliveriesPending = await this.prisma.delivery.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL'] } },
      include: { ticket: { include: { customer: true } }, quotation: true },
      orderBy: { deliveryDate: 'asc' },
    });

    return {
      quotationsPendingPo: quotationsPendingPo.map((q) => ({
        id: q.id,
        quotationNo: q.quotationNo,
        customer: q.customer.customerName,
        ticketNo: q.ticket.ticketNo,
        sentAt: q.sentAt,
        daysWaiting: q.sentAt ? Math.floor((Date.now() - q.sentAt.getTime()) / 86400000) : null,
      })),
      deliveriesPending: deliveriesPending.map((d) => ({
        id: d.id,
        ticketId: d.ticketId,
        status: d.status,
        ticketNo: d.ticket?.ticketNo ?? null,
        customer: d.ticket?.customer?.customerName ?? null,
        quotationNo: d.quotation?.quotationNo ?? null,
        deliveryDate: d.deliveryDate,
      })),
    };
  }

  /** 5 summary tiles — reuses ReportsService's own methods, no new aggregation logic. */
  async executiveSummary() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

    const [openTickets, slaCompliance, mttr, revenue, amcRenewals] = await Promise.all([
      this.reports.openTicketsByStatus({}),
      this.reports.slaCompliance({}),
      this.reports.mttrReport({}),
      this.reports.serviceRevenueReport({ dateFrom: monthStart }),
      this.reports.amcRenewalAlertSummary({}),
    ]);

    const totalSla = slaCompliance.rows.reduce((s, r) => s + Number(r.total_tickets), 0);
    const metSla = slaCompliance.rows.reduce((s, r) => s + Number(r.met_sla), 0);
    const compliancePct = totalSla > 0 ? (metSla / totalSla) * 100 : null;

    const totalMttrTickets = mttr.rows.reduce((s, r) => s + Number(r.ticket_count), 0);
    const weightedMttrHours = mttr.rows.reduce((s, r) => s + Number(r.avg_resolution_hours) * Number(r.ticket_count), 0);
    const avgMttrHours = totalMttrTickets > 0 ? weightedMttrHours / totalMttrTickets : null;

    const revenueMtd = revenue.rows.reduce((s, r) => s + Number(r.total), 0);

    return {
      openTicketsCount: openTickets.rows.length,
      slaCompliancePct: compliancePct != null ? Number(compliancePct.toFixed(1)) : null,
      avgMttrHours: avgMttrHours != null ? Number(avgMttrHours.toFixed(1)) : null,
      revenueMtd: Number(revenueMtd.toFixed(2)),
      amcRenewalsDue: amcRenewals.rows.length,
    };
  }
}
