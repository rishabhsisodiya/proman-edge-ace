import { Injectable } from '@nestjs/common';
import { Region, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';

export interface DashboardActor {
  userId: string;
  role: Role;
}

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
    // §6.1 spec: "Quotations in 'Sent' status > 3 days" — was returning
    // every pending quotation regardless of age (2026-08-04 fix); the UI
    // only ever used the 3-day/7-day marks as cosmetic red-highlighting,
    // never as an actual filter, so the tile counted quotations that had
    // only just been sent minutes ago as "pending PO" alongside genuinely
    // stale ones.
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
    const quotationsPendingPo = await this.prisma.quotation.findMany({
      where: { status: 'SENT', customerPoNumber: null, sentAt: { lte: threeDaysAgo } },
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

  /**
   * FSD §6.1's exact tile set: "Open, SLA%, Revenue MTD, CSAT avg" (+ AMC
   * Renewals Due, kept from the original build). Reuses ReportsService's
   * own methods, no new aggregation logic, so this can never drift from
   * what the Reports page itself shows.
   *
   * Revenue MTD fixed (2026-08-04) — was summing internal Quotation amounts
   * regardless of invoice status; now calls `reports.revenueMtd()`, which
   * sums the real ERPNext Sales Invoice `grand_total` for Submitted
   * invoices only, matching the FSD's literal formula. CSAT avg added
   * (2026-08-04) — was missing entirely despite being explicitly listed.
   */
  async executiveSummary() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [openTickets, slaCompliance, mttr, revenue, amcRenewals, csatTickets] = await Promise.all([
      this.reports.openTicketsByStatus({}),
      this.reports.slaCompliance({}),
      this.reports.mttrReport({}),
      this.reports.revenueMtd(monthStart, now),
      this.reports.amcRenewalAlertSummary({}),
      this.prisma.ticket.findMany({
        where: { closedAt: { gte: monthStart, lte: now }, csatScore: { not: null } },
        select: { csatScore: true },
      }),
    ]);

    const totalSla = slaCompliance.rows.reduce((s, r) => s + Number(r.total_tickets), 0);
    const metSla = slaCompliance.rows.reduce((s, r) => s + Number(r.met_sla), 0);
    const compliancePct = totalSla > 0 ? (metSla / totalSla) * 100 : null;

    const totalMttrTickets = mttr.rows.reduce((s, r) => s + Number(r.ticket_count), 0);
    const weightedMttrHours = mttr.rows.reduce((s, r) => s + Number(r.avg_resolution_hours) * Number(r.ticket_count), 0);
    const avgMttrHours = totalMttrTickets > 0 ? weightedMttrHours / totalMttrTickets : null;

    const csatAvg = csatTickets.length
      ? csatTickets.reduce((s, t) => s + (t.csatScore ?? 0), 0) / csatTickets.length
      : null;

    return {
      openTicketsCount: openTickets.rows.length,
      slaCompliancePct: compliancePct != null ? Number(compliancePct.toFixed(1)) : null,
      avgMttrHours: avgMttrHours != null ? Number(avgMttrHours.toFixed(1)) : null,
      revenueMtd: Number(revenue.revenue.toFixed(2)),
      revenueMtdPendingDrafts: Number(revenue.pendingDraftTotal.toFixed(2)),
      csatAvg: csatAvg != null ? Number(csatAvg.toFixed(2)) : null,
      amcRenewalsDue: amcRenewals.rows.length,
    };
  }

  /**
   * §10.1 W-05 Manager Dashboard (2026-08-04) — "Full KPI suite, regional
   * pie charts, AMC renewal pipeline, revenue, top at-risk accounts." Was
   * never built; Manager only ever got the plain Ticket List (§10.1 W-07).
   * This is additive — doesn't replace the Ticket List, sits above it.
   *
   * "Full KPI suite" = all 8 `kpiMatrix()` rows, matching the FSD's literal
   * wording (2026-08-04 correction — a first pass trimmed this to 4 of 8 as
   * a "glance-value" call, which undercounted against the actual spec). The
   * full KPI Matrix page still exists separately for the period selector,
   * per-KPI formula/breach-threshold detail, and (Admin-only) region filter.
   *
   * Region-scoped for Manager (2026-08-04, client decision — "Manager is
   * region based so he should not see other region details and All KPI
   * should be region based"): every number here, including which of the
   * (up to) 6 regional pie charts even appear, is limited to the Manager's
   * own assigned regions. Admin gets the full org-wide view (all 6 regions,
   * unscoped KPIs/revenue/pipeline/at-risk list) — same "Admin sees
   * everything" convention used everywhere else in this app.
   */
  async managerSummary(actor: DashboardActor) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysOut = new Date(now.getTime() + 30 * 86400000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    const managerRegions: Region[] =
      actor.role === 'MANAGER'
        ? (await this.prisma.userRegion.findMany({ where: { userId: actor.userId } })).map((r) => r.region)
        : [];
    const regionScope = actor.role === 'MANAGER' ? { region: { in: managerRegions } } : { region: { not: null } };

    const [kpiRows, revenue, regionalTickets, amcPipeline, atRiskTickets] = await Promise.all([
      this.reports.kpiMatrix('month', actor.role === 'MANAGER' ? managerRegions : undefined),
      this.reports.revenueMtd(monthStart, now, actor.role === 'MANAGER' ? managerRegions : undefined),
      this.prisma.ticket.findMany({
        where: { customer: regionScope },
        select: { status: true, customer: { select: { region: true } } },
      }),
      this.prisma.amcContract.findMany({
        where: {
          endDate: { gte: now, lte: thirtyDaysOut },
          renewalStatus: { notIn: ['RENEWED', 'LAPSED'] },
          customer: regionScope,
        },
        include: { customer: true },
        orderBy: { endDate: 'asc' },
      }),
      this.prisma.ticket.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo, lte: now },
          OR: [{ slaResponseStatus: 'BREACHED' }, { slaResolutionStatus: 'BREACHED' }],
          customer: regionScope,
        },
        select: { customerId: true, customer: { select: { customerName: true } } },
      }),
    ]);

    // Regional pie charts — one per region, but only the Manager's own
    // region(s) for Manager; all 6 for Admin.
    const regions =
      actor.role === 'MANAGER'
        ? managerRegions
        : (['NORTH', 'SOUTH', 'EAST', 'WEST', 'CENTRAL', 'BANGLADESH'] as const);
    const regionalBreakdown = regions.map((region) => {
      const tickets = regionalTickets.filter((t) => t.customer.region === region);
      const byStatus = new Map<string, number>();
      for (const t of tickets) byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1);
      return {
        region,
        total: tickets.length,
        byStatus: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
      };
    });

    // Top at-risk accounts — customers with 2+ SLA-breached tickets in the trailing 30 days.
    const breachCountByCustomer = new Map<string, { customerName: string; count: number }>();
    for (const t of atRiskTickets) {
      const existing = breachCountByCustomer.get(t.customerId);
      if (existing) existing.count++;
      else breachCountByCustomer.set(t.customerId, { customerName: t.customer.customerName, count: 1 });
    }
    const topAtRiskAccounts = [...breachCountByCustomer.entries()]
      .filter(([, v]) => v.count >= 2)
      .map(([customerId, v]) => ({ customerId, customerName: v.customerName, breachedCount: v.count }))
      .sort((a, b) => b.breachedCount - a.breachedCount)
      .slice(0, 10);

    return {
      // All 8 rows (7 KPIs, First Response Time split by priority) — the
      // FSD's own W-05 wording is "Full KPI suite," not a trimmed subset
      // (2026-08-04 fix: was filtered down to 4 of 8 as a "glance-value"
      // design call that turned out to undercount against the actual spec).
      kpiCards: kpiRows,
      revenueMtd: Number(revenue.revenue.toFixed(2)),
      revenueMtdPendingDrafts: Number(revenue.pendingDraftTotal.toFixed(2)),
      regionalBreakdown,
      amcRenewalPipeline: amcPipeline.map((c) => ({
        id: c.id,
        contractReferenceNo: c.contractReferenceNo,
        customerName: c.customer.customerName,
        endDate: c.endDate,
        daysRemaining: Math.ceil((c.endDate.getTime() - now.getTime()) / 86400000),
        renewalStatus: c.renewalStatus,
      })),
      topAtRiskAccounts,
    };
  }
}
