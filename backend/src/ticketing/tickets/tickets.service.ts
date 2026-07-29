import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, ServiceType, Priority, Source, PendingReason, TicketStatus, CustomerCategory } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { nextTicketNo } from './ticket-number.util';
import { addBusinessHours } from './business-hours.util';
import { WorkflowService } from '../workflow/workflow.service';
import { SlaPolicyService } from '../sla-policy/sla-policy.service';

/**
 * FSD §7.1 rule 4 — auto-classification for auto-sources (AMC->Scheduled PM/
 * Medium, warranty->Warranty Repair/High, predictive->Technical Audit/High).
 * Genuinely nothing to do yet: those 3 auto-sources (amc_scheduled,
 * warranty_triggered, predictive) aren't in the `Source` enum at all — they
 * only get created once the AMC/Warranty/Predictive engines exist (Build
 * Plan Days 4-10, T2). Left as an explicit stub rather than faking
 * classification for sources that can't occur today.
 */
function autoClassify(source: Source): { serviceType?: ServiceType; priority?: Priority } {
  return {};
}

// FSD §5.2 Priority Matrix (service_type + customer_type + equipment_category
// -> default priority) — full 3-dimension version needs the Admin config
// screen (not built yet). This is the service_type-only slice of it: enough
// to give Call Center a sensible default without forcing a manual pick every
// time, per §5.3 ("priority auto-set by Priority Matrix, overridable by CC/ASM").
const DEFAULT_PRIORITY_BY_SERVICE_TYPE: Record<ServiceType, Priority> = {
  BREAKDOWN_CHARGEABLE: 'CRITICAL',
  WARRANTY_REPAIR: 'HIGH',
  TECHNICAL_AUDIT: 'MEDIUM',
  RETROFIT_UPGRADE: 'MEDIUM',
  SCHEDULED_PM: 'MEDIUM',
  AMC: 'MEDIUM',
  SPARES_SUPPLY_INSTALLATION: 'LOW',
};
// Used when service type isn't known yet at creation — same neutral default
// as the priority-picker's own fallback.
const DEFAULT_PRIORITY_WHEN_UNKNOWN: Priority = 'MEDIUM';

// FSD §7.1 rule 2 — 24h dedup window (configurable; hardcoded until the
// Admin config screen for this exists). Only auto-sources merge into the
// existing ticket; customer-initiated/manual sources always create a new
// ticket with a cross-reference note instead. API_PARTNER is the only
// "auto" source that actually exists in our Source enum today — AMC/
// warranty/predictive auto-sources don't exist yet (see autoClassify above).
const DEDUP_WINDOW_HOURS = 24;
const AUTO_MERGE_SOURCES: Source[] = ['API_PARTNER'];

// Human-readable labels for the auto-generated subject (§5.3) — using the raw
// enum value there leaks "BREAKDOWN_CHARGEABLE" straight into a user-facing field.
const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  WARRANTY_REPAIR: 'Warranty Repair',
  // Client request: drop "(Chargeable)" from the display label — billing
  // behavior is unchanged, this is a display-only rename.
  BREAKDOWN_CHARGEABLE: 'Breakdown',
  SCHEDULED_PM: 'Scheduled PM',
  TECHNICAL_AUDIT: 'Technical Audit',
  RETROFIT_UPGRADE: 'Retrofit / Upgrade',
  AMC: 'AMC',
  SPARES_SUPPLY_INSTALLATION: 'Spares Supply (with installation)',
};
const NOT_YET_DETERMINED_LABEL = 'Not Yet Determined';
function serviceTypeLabel(s: ServiceType | null): string {
  return s ? SERVICE_TYPE_LABEL[s] : NOT_YET_DETERMINED_LABEL;
}

export interface RequestUser {
  userId: string;
  role: Role;
}

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    private readonly slaPolicies: SlaPolicyService,
  ) {}

  /**
   * The single ticket-creation entry point (FSD §7.1 rule 1) — every source
   * (call, WhatsApp, bulk import, partner API, internal) must go through this.
   */
  async create(dto: CreateTicketDto, actor: RequestUser) {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: dto.customerId } });
    if (customer.accountStatus === 'BLACKLISTED') {
      throw new ForbiddenException(
        'Customer is blacklisted. Manager approval required to create a ticket for this account.',
      );
    }

    let equipment = null;
    if (dto.equipmentId) {
      equipment = await this.prisma.equipment.findUniqueOrThrow({ where: { id: dto.equipmentId } });
      if (equipment.status === 'DECOMMISSIONED' || equipment.status === 'SOLD') {
        throw new BadRequestException(
          `Equipment ${equipment.serialNo} is decommissioned. Please contact the system administrator to update the equipment record.`,
        );
      }
    }

    // Client request: service type may genuinely not be known yet at ticket
    // creation (Call Center hasn't diagnosed the issue) — stays null rather
    // than blocking creation. ASM/Engineer/Manager/Admin set the real value
    // later via updateServiceType() once it's known.
    const autoClass = autoClassify(dto.source);
    const serviceType: ServiceType | null = dto.serviceType ?? autoClass.serviceType ?? null;
    const priority =
      dto.priority ??
      autoClass.priority ??
      (serviceType ? DEFAULT_PRIORITY_BY_SERVICE_TYPE[serviceType] : DEFAULT_PRIORITY_WHEN_UNKNOWN);

    // §7.1 rule 2 — dedup check: same customer + equipment, created within
    // the last 24h, not already closed.
    const dedupWindowStart = new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000);
    const duplicateCandidate = dto.equipmentId
      ? await this.prisma.ticket.findFirst({
          where: {
            customerId: dto.customerId,
            equipmentId: dto.equipmentId,
            status: { not: 'CLOSED' },
            createdAt: { gte: dedupWindowStart },
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;

    if (duplicateCandidate && AUTO_MERGE_SOURCES.includes(dto.source)) {
      // Auto-source duplicate: don't create a second ticket — merge as a note
      // on the existing one instead.
      await this.prisma.ticketAuditLog.create({
        data: {
          ticketId: duplicateCandidate.id,
          fieldName: 'duplicate_merge',
          oldValue: null,
          newValue: `Merged duplicate ${dto.source} report: ${dto.description}`,
          changedByUserId: actor.userId,
          changeSource: 'SYSTEM_JOB',
        },
      });
      return duplicateCandidate;
    }

    const warrantyStatusAtCreation = equipment?.warrantyStatus ?? null;
    const warrantyEligible = warrantyStatusAtCreation === 'UNDER_WARRANTY';

    const policy = await this.slaPolicies.resolve(serviceType, priority);
    const now = new Date();
    const slaResponseDue = policy ? addBusinessHours(now, policy.responseHours) : null;
    const slaResolutionDue = policy ? addBusinessHours(now, policy.resolutionHours) : null;

    const ticketNo = await nextTicketNo(this.prisma);
    const subject =
      dto.subject ??
      `${equipment?.itemName ?? 'General'} — ${serviceTypeLabel(serviceType)} — ${customer.customerName}`;

    // Ticket creation + duplicate note + auto-assignment + the ASSIGNED
    // transition all happen in one transaction — a failure at any step
    // (e.g. the transition's own role check) rolls back the whole thing,
    // instead of leaving a committed ticket behind that the caller sees as
    // a hard error and retries, creating another one each time.
    const ticketId = await this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.create({
        data: {
          ticketNo,
          source: dto.source,
          customerCategory: dto.customerCategory,
          serviceType,
          priority,
          subject,
          description: dto.description,
          customerId: dto.customerId,
          equipmentId: dto.equipmentId,
          siteId: equipment?.siteId,
          warrantyStatusAtCreation,
          warrantyEligible,
          slaResponseDue,
          slaResolutionDue,
          slaPolicyId: policy?.id,
          createdByUserId: actor.userId,
        },
      });

      // Manual/customer-initiated sources: never merge, just cross-reference
      // note pointing at the likely-duplicate ticket so Call Center/ASM can
      // decide for themselves whether to consolidate. FSD Analysis decisions
      // log (20 Jul 2026): this needs a manual merge-or-dismiss action, not
      // just a timeline note — possibleDuplicateOfId/duplicateFlagResolved
      // make that actionable (see resolveDuplicate() below).
      if (duplicateCandidate && !AUTO_MERGE_SOURCES.includes(dto.source)) {
        await tx.ticket.update({ where: { id: ticket.id }, data: { possibleDuplicateOfId: duplicateCandidate.id } });
        await tx.ticketAuditLog.create({
          data: {
            ticketId: ticket.id,
            fieldName: 'duplicate_reference',
            oldValue: null,
            newValue: `Possible duplicate of ${duplicateCandidate.ticketNo} (created ${duplicateCandidate.createdAt.toISOString()})`,
            changedByUserId: actor.userId,
            changeSource: 'SYSTEM_JOB',
          },
        });
      }

      // §7.1 rule 5 — auto-routing to an ASM covering the customer's region,
      // load-based (fewest current open tickets), per Q12's documented default.
      // A customer whose region hasn't been resolved yet (needsReview from the
      // nightly sync) can't be routed — falls through to unassigned, same as
      // the "no ASM covers this region" case below.
      const regionAsms = customer.region
        ? await tx.userRegion.findMany({
            where: { region: customer.region, user: { role: 'ASM' } },
            include: {
              user: { include: { _count: { select: { ticketsAsAsm: { where: { status: { not: 'CLOSED' } } } } } } },
            },
          })
        : [];
      if (regionAsms.length > 0) {
        const chosenAsm = regionAsms.reduce((best, cur) =>
          cur.user._count.ticketsAsAsm < best.user._count.ticketsAsAsm ? cur : best,
        ).user;

        await tx.ticket.update({ where: { id: ticket.id }, data: { assignedAsmId: chosenAsm.id } });
        await this.workflow.transition({
          ticketId: ticket.id,
          targetStatus: 'ASSIGNED',
          actorUserId: actor.userId,
          actorRole: actor.role,
          tx,
        });
      }
      // No ASM covers this region: ticket stays OPEN/unassigned, already
      // surfaced correctly by the existing "Unassigned" dashboard views.

      return ticket.id;
    });

    return this.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  }

  /** Region/assignment-scoped list — enforced at the query layer, not the UI. */
  async list(actor: RequestUser, filters: Record<string, string | undefined>) {
    const where: Prisma.TicketWhereInput = {};

    if (actor.role === 'ENGINEER') {
      where.assignedEngineerId = actor.userId;
    } else if (actor.role === 'ASM') {
      // Looked up here (not passed in by the caller) so no controller can
      // forget to scope an ASM's regions and silently return everything —
      // or, as previously happened, nothing at all (empty regions -> empty result).
      const asmRegions = await this.prisma.userRegion.findMany({ where: { userId: actor.userId } });
      where.customer = { region: { in: asmRegions.map((r) => r.region) } };
    }
    // CALL_CENTER, MANAGER, ADMIN: unscoped (full visibility)

    if (filters.status) where.status = filters.status as any;
    else if (filters.excludeClosed === 'true') where.status = { not: 'CLOSED' };
    if (filters.priority) where.priority = filters.priority as any;
    if (filters.region) where.customer = { ...(where.customer as object), region: filters.region as any };
    if (filters.serviceType) where.serviceType = filters.serviceType as any;
    if (filters.assigned === 'true') where.assignedEngineerId = { not: null };
    if (filters.assigned === 'false') where.assignedEngineerId = null;
    if (filters.slaBreached === 'true') {
      where.OR = [{ slaResponseStatus: 'BREACHED' }, { slaResolutionStatus: 'BREACHED' }];
    }

    // Capped at 500 rather than 100 — a couple of dashboards (Call Center,
    // My Tickets) still need one unbounded-ish fetch for their own
    // client-side aggregate stats until they get a real server-side stats
    // endpoint; true paginated list views (ASM, Manager) use the default 25.
    const page = Math.max(1, parseInt(filters.page ?? '1', 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(filters.pageSize ?? '25', 10) || 25));

    // Clickable column-header sorting (client request, 2026-07-27) — server-side
    // so it's consistent across pages, not just the currently-fetched one.
    const sortDir: Prisma.SortOrder = filters.sortDir === 'asc' ? 'asc' : 'desc';
    const sortableColumns: Record<string, Prisma.TicketOrderByWithRelationInput> = {
      ticketNo: { ticketNo: sortDir },
      customerName: { customer: { customerName: sortDir } },
      priority: { priority: sortDir },
      status: { status: sortDir },
      engineerName: { assignedEngineer: { fullName: sortDir } },
      region: { customer: { region: sortDir } },
      createdAt: { createdAt: sortDir },
    };
    const orderBy = (filters.sortBy && sortableColumns[filters.sortBy]) || { createdAt: 'desc' as const };

    const [data, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: { customer: true, equipment: true, assignedEngineer: true, assignedAsm: true },
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async findOne(id: string, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        customer: true,
        equipment: true,
        site: true,
        visits: true,
        assignedEngineer: true,
        assignedAsm: true,
        possibleDuplicateOf: { select: { id: true, ticketNo: true, status: true } },
        slaPolicy: true,
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (actor.role === 'ENGINEER' && ticket.assignedEngineerId !== actor.userId) {
      throw new ForbiddenException('Not your ticket');
    }
    return ticket;
  }

  /**
   * FSD Analysis decisions log (20 Jul 2026): manual merge-or-dismiss action
   * for the possible-duplicate flag set at creation (see create() above).
   * "Merge" closes this ticket via the existing regularize path (always
   * reasoned + audit-logged) rather than deleting it — the original ticket
   * and its FSVs/audit trail stay intact, just marked closed and linked to
   * the canonical one. "Dismiss" just clears the flag with no status change.
   */
  async resolveDuplicate(id: string, action: 'MERGE' | 'DISMISS', actor: RequestUser, reason?: string) {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({
      where: { id },
      include: { possibleDuplicateOf: true },
    });
    if (!ticket.possibleDuplicateOfId) {
      throw new BadRequestException('This ticket has no unresolved duplicate flag');
    }
    if (ticket.duplicateFlagResolved) {
      throw new BadRequestException('This duplicate flag has already been resolved');
    }

    if (action === 'MERGE') {
      if (!reason?.trim()) {
        throw new BadRequestException('A reason is required to merge this ticket');
      }
      // Deliberately not routed through WorkflowService.regularize() — that's
      // gated to REGULARIZE_ROLES (Admin/Call Center only) for its
      // general-purpose "force to any status" power. This action is narrower
      // (duplicate -> Closed only) and per the FSD decisions log is meant to
      // be available to Call Center *and* ASM, so it has its own self-
      // contained permission check (this method's callers, gated in the
      // controller) rather than inheriting Regularize's stricter one.
      await this.prisma.$transaction([
        this.prisma.ticket.update({ where: { id }, data: { status: 'CLOSED', closedAt: new Date() } }),
        this.prisma.ticketAuditLog.create({
          data: {
            ticketId: id,
            fieldName: 'status',
            oldValue: ticket.status,
            newValue: `CLOSED (Merged as duplicate of ${ticket.possibleDuplicateOf!.ticketNo}: ${reason.trim()})`,
            changedByUserId: actor.userId,
            changeSource: 'WEB_UI',
          },
        }),
      ]);
    } else {
      await this.prisma.ticketAuditLog.create({
        data: {
          ticketId: id,
          fieldName: 'duplicate_reference',
          oldValue: null,
          newValue: `Dismissed — confirmed not a duplicate of ${ticket.possibleDuplicateOf!.ticketNo}${reason?.trim() ? `: ${reason.trim()}` : ''}`,
          changedByUserId: actor.userId,
          changeSource: 'WEB_UI',
        },
      });
    }

    return this.prisma.ticket.update({ where: { id }, data: { duplicateFlagResolved: true } });
  }

  async timeline(id: string) {
    const entries = await this.prisma.ticketAuditLog.findMany({
      where: { ticketId: id },
      orderBy: { changedAt: 'asc' },
    });
    const userIds = [...new Set(entries.map((e) => e.changedByUserId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));
    return entries.map((e) => ({ ...e, changedByName: nameById.get(e.changedByUserId) ?? 'System' }));
  }

  /**
   * ASM/Manager picks an engineer. Covers both the OPEN→ASSIGNED (territory
   * routing) and ASSIGNED→ENGINEER_ASSIGNED hops in one action for MVP — status
   * is still only ever written via WorkflowService, never directly here.
   */
  async assign(id: string, engineerId: string, actor: RequestUser) {
    const engineer = await this.prisma.user.findUniqueOrThrow({ where: { id: engineerId } });
    if (engineer.role !== 'ENGINEER') throw new BadRequestException('Target user is not an Engineer');

    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id } });

    await this.prisma.ticket.update({ where: { id }, data: { assignedEngineerId: engineerId } });

    if (ticket.status === 'OPEN') {
      await this.workflow.transition({
        ticketId: id,
        targetStatus: 'ASSIGNED',
        actorUserId: actor.userId,
        actorRole: actor.role,
      });
    }
    return this.workflow.transition({
      ticketId: id,
      targetStatus: 'ENGINEER_ASSIGNED',
      actorUserId: actor.userId,
      actorRole: actor.role,
      comment: `Assigned to ${engineer.fullName}`,
    });
  }

  /**
   * Re-runs the same region→ASM auto-routing check create() does, for a
   * ticket that's still stuck OPEN/unassigned because no ASM covered its
   * customer's region *at creation time*. Auto-routing is a one-time
   * decision made when the ticket is created — it never re-fires just
   * because the customer's region or the region's ASM staffing changes
   * afterward, so this gives ASM/Manager a manual way to retry it once that
   * changes (e.g. an ASM gets added to the region, or the customer's region
   * gets corrected).
   */
  async retryAutoRouting(id: string, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id }, include: { customer: true } });
    if (ticket.status !== 'OPEN') {
      throw new BadRequestException('This ticket has already moved past New — auto-routing only applies while unassigned');
    }
    if (ticket.assignedAsmId) {
      throw new BadRequestException('This ticket already has an ASM assigned');
    }
    if (!ticket.customer.region) {
      throw new BadRequestException("This ticket's customer still has no region set — resolve that first");
    }

    const regionAsms = await this.prisma.userRegion.findMany({
      where: { region: ticket.customer.region, user: { role: 'ASM' } },
      include: { user: { include: { _count: { select: { ticketsAsAsm: { where: { status: { not: 'CLOSED' } } } } } } } },
    });
    if (regionAsms.length === 0) {
      throw new BadRequestException(`Still no ASM covers region ${ticket.customer.region} — nothing to route to yet`);
    }

    const chosenAsm = regionAsms.reduce((best, cur) =>
      cur.user._count.ticketsAsAsm < best.user._count.ticketsAsAsm ? cur : best,
    ).user;

    await this.prisma.ticket.update({ where: { id }, data: { assignedAsmId: chosenAsm.id } });
    return this.workflow.transition({
      ticketId: id,
      targetStatus: 'ASSIGNED',
      actorUserId: actor.userId,
      actorRole: actor.role,
      comment: `Auto-routed to ${chosenAsm.fullName} on retry`,
    });
  }

  /** Engineer accepts an assignment. */
  accept(id: string, actor: RequestUser) {
    return this.workflow.transition({
      ticketId: id,
      targetStatus: 'ACCEPTED',
      actorUserId: actor.userId,
      actorRole: actor.role,
    });
  }

  /**
   * Engineer rejects an assignment (§5.4 Rejection Rule). Ticket returns to
   * Assigned (engineer unassigned) for ASM to manually reassign. Tracks
   * rejectionCount/rejectionReasons for the 3-tier escalation (1st: ASM
   * notified, 2nd: +Manager alert, 3rd: escalates) — actual notification
   * dispatch is a separate track (T4, not built yet), so this just returns
   * the tier for the caller to act on/display.
   */
  async reject(id: string, reason: string, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id } });
    const existingReasons = Array.isArray(ticket.rejectionReasons) ? ticket.rejectionReasons : [];
    const rejectionCount = ticket.rejectionCount + 1;

    await this.prisma.ticket.update({
      where: { id },
      data: {
        rejectionCount,
        rejectionReasons: [
          ...existingReasons,
          { engineerId: actor.userId, reason, timestamp: new Date().toISOString() },
        ] as any,
        assignedEngineerId: null,
      },
    });

    const updated = await this.workflow.transition({
      ticketId: id,
      targetStatus: 'ASSIGNED',
      actorUserId: actor.userId,
      actorRole: actor.role,
    });

    const escalationTier =
      rejectionCount >= 3 ? 'ESCALATED_TO_MANAGER' : rejectionCount === 2 ? 'MANAGER_ALERTED' : 'ASM_NOTIFIED';

    return { ...updated, escalationTier };
  }

  /**
   * ASM rejects an Engineer Resolved ticket (Ashwath feedback 2026-07-25) —
   * two options folded into one method via `engineerId`: pass the same
   * engineer to redo the work, or a different one to reassign. Either way
   * the ticket goes back to ENGINEER_ASSIGNED (must Accept again, per
   * client decision — no shortcut for the same-engineer case) rather than
   * skipping straight to Accepted/Working. Shares the same
   * rejectionCount/rejectionReasons/escalation-tier ladder as the engineer's
   * own pre-resolution reject() above (client decision — one bounce counter
   * for the whole ticket, not a separate one per reject flow).
   */
  async asmRejectResolution(id: string, engineerId: string, reason: string, actor: RequestUser) {
    const engineer = await this.prisma.user.findUniqueOrThrow({ where: { id: engineerId } });
    if (engineer.role !== 'ENGINEER') throw new BadRequestException('Target user is not an Engineer');

    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id } });
    if (ticket.status !== 'ENGINEER_RESOLVED') {
      throw new BadRequestException('Only an Engineer Resolved ticket can be rejected this way');
    }

    const existingReasons = Array.isArray(ticket.rejectionReasons) ? ticket.rejectionReasons : [];
    const rejectionCount = ticket.rejectionCount + 1;

    await this.prisma.ticket.update({
      where: { id },
      data: {
        rejectionCount,
        rejectionReasons: [
          ...existingReasons,
          { engineerId: ticket.assignedEngineerId, reason, timestamp: new Date().toISOString() },
        ] as any,
        assignedEngineerId: engineerId,
      },
    });

    const updated = await this.workflow.transition({
      ticketId: id,
      targetStatus: 'ENGINEER_ASSIGNED',
      actorUserId: actor.userId,
      actorRole: actor.role,
      comment: `ASM rejected: ${reason} — reassigned to ${engineer.fullName}`,
    });

    const escalationTier =
      rejectionCount >= 3 ? 'ESCALATED_TO_MANAGER' : rejectionCount === 2 ? 'MANAGER_ALERTED' : 'ASM_NOTIFIED';

    return { ...updated, escalationTier };
  }

  /**
   * Client request: service type can be set/updated after ticket creation
   * (it may genuinely be unknown at creation time) — restricted to
   * ASM/Engineer/Manager/Admin (enforced at the controller), not Call
   * Center, since they're the ones actually diagnosing the issue. Priority
   * and SLA due dates are recomputed against the newly-known service type,
   * since there was no SLA clock running at all while it was unset.
   */
  async updateServiceType(id: string, serviceType: ServiceType, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id } });
    const policy = await this.slaPolicies.resolve(serviceType, ticket.priority);
    const now = new Date();

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        serviceType,
        slaResponseDue: policy ? addBusinessHours(now, policy.responseHours) : ticket.slaResponseDue,
        slaResolutionDue: policy ? addBusinessHours(now, policy.resolutionHours) : ticket.slaResolutionDue,
        slaPolicyId: policy?.id ?? ticket.slaPolicyId,
      },
    });

    await this.prisma.ticketAuditLog.create({
      data: {
        ticketId: id,
        fieldName: 'serviceType',
        oldValue: serviceTypeLabel(ticket.serviceType),
        newValue: serviceTypeLabel(serviceType),
        changedByUserId: actor.userId,
        changeSource: 'WEB_UI',
      },
    });

    return updated;
  }

  /** Manual "Customer Category" field — separate from the auto-calculated warranty/AMC chargeability check. */
  async updateCustomerCategory(id: string, customerCategory: CustomerCategory, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.ticket.update({ where: { id }, data: { customerCategory } });

    await this.prisma.ticketAuditLog.create({
      data: {
        ticketId: id,
        fieldName: 'customerCategory',
        oldValue: ticket.customerCategory,
        newValue: customerCategory,
        changedByUserId: actor.userId,
        changeSource: 'WEB_UI',
      },
    });

    return updated;
  }

  /** Engineer marks arrival at the customer site. */
  reachedSite(id: string, actor: RequestUser, comment?: string) {
    return this.workflow.transition({
      ticketId: id,
      targetStatus: 'REACHED_SITE',
      actorUserId: actor.userId,
      actorRole: actor.role,
      comment,
    });
  }

  /** Engineer begins on-site work. */
  startWorking(id: string, actor: RequestUser, comment?: string) {
    return this.workflow.transition({
      ticketId: id,
      targetStatus: 'WORKING',
      actorUserId: actor.userId,
      actorRole: actor.role,
      comment,
    });
  }

  /** Engineer pauses work (awaiting parts/customer/approval/other). SLA clock keeps running (§14.1 rule 21). */
  markPending(id: string, pendingReason: PendingReason, pendingNotes: string | undefined, actor: RequestUser) {
    return this.workflow.transition({
      ticketId: id,
      targetStatus: 'PENDING',
      actorUserId: actor.userId,
      actorRole: actor.role,
      pendingReason,
      pendingNotes,
    });
  }

  /** Engineer resumes work after Pending clears. */
  resume(id: string, actor: RequestUser) {
    return this.workflow.transition({
      ticketId: id,
      targetStatus: 'WORKING',
      actorUserId: actor.userId,
      actorRole: actor.role,
    });
  }

  /** ASM/Manager confirms resolution. */
  asmResolve(id: string, actor: RequestUser, comment?: string) {
    return this.workflow.transition({
      ticketId: id,
      targetStatus: 'ASM_RESOLVED',
      actorUserId: actor.userId,
      actorRole: actor.role,
      comment,
    });
  }

  /**
   * Call Center/Manager closes the ticket. Per Shivam's revised pipeline
   * (2026-07-23), Sales Invoice creation is fully decoupled from ticket
   * close — it's driven by the Sales Order reaching ERPNext status
   * "To Bill" (after a manual Delivery Note), via webhook/poll (see
   * quotations/quotation.service.ts). Closing the ticket doesn't create,
   * gate on, or wait for an invoice at all anymore.
   */
  close(id: string, actor: RequestUser, comment?: string) {
    return this.workflow.transition({
      ticketId: id,
      targetStatus: 'CLOSED',
      actorUserId: actor.userId,
      actorRole: actor.role,
      comment,
    });
  }

  /**
   * FSD §14.1 rule 20 — Admin-only reopen from Closed back to Open (was
   * ASM_RESOLVED, a TCB default that deviated from spec — fixed 2026-07-28).
   * Increments reOpenCount and resets the SLA clocks for the restarted
   * lifecycle (fresh due dates from the ticket's own service type/priority
   * policy, same computation ticket creation uses) — the old due dates were
   * relative to the original creation time and would otherwise show as
   * already breached the instant the ticket reopens.
   */
  async reopen(id: string, actor: RequestUser) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUniqueOrThrow({ where: { id } });
      const policy = await this.slaPolicies.resolve(ticket.serviceType, ticket.priority);
      const now = new Date();

      await tx.ticket.update({
        where: { id },
        data: {
          reOpenCount: { increment: 1 },
          slaResponseMet: false,
          slaResolutionMet: false,
          slaResponseStatus: 'ON_TRACK',
          slaResolutionStatus: 'ON_TRACK',
          slaResponseDue: policy ? addBusinessHours(now, policy.responseHours) : null,
          slaResolutionDue: policy ? addBusinessHours(now, policy.resolutionHours) : null,
          slaPausedAt: null,
          slaPausedMinutes: 0,
        },
      });

      return this.workflow.transition({
        ticketId: id,
        targetStatus: 'OPEN',
        actorUserId: actor.userId,
        actorRole: actor.role,
        tx,
      });
    });
  }

  /** "Regularize Ticket" — Admin/Call Center force-move, always reasoned + audited. */
  regularize(id: string, targetStatus: TicketStatus, reason: string, actor: RequestUser) {
    return this.workflow.regularize({
      ticketId: id,
      targetStatus,
      actorUserId: actor.userId,
      actorRole: actor.role,
      reason,
    });
  }

  /**
   * Bulk CSV ticket import (Build Plan, Days 4-10, T1 — "genuinely simple, no
   * external dependency"). Validates each row against the same create()
   * entry point every other source uses (dedup, auto-routing, priority
   * matrix all apply identically) — partial success, not all-or-nothing: a
   * bad row is reported with its error, valid rows still create tickets.
   *
   * Expected columns (header row required): source, description, and either
   * customerId (UUID) or customerErpId (Customer.erpnextCustomerId) — plus
   * optional serviceType, priority, subject, and either equipmentId (UUID)
   * or equipmentSerialNo (Equipment.serialNo). CSV rows realistically won't
   * know internal UUIDs, so the human-friendly identifiers are resolved here
   * before handing off to create().
   */
  async bulkImport(csvBuffer: Buffer, actor: RequestUser) {
    let rows: Record<string, string>[];
    try {
      rows = parse(csvBuffer, { columns: true, skip_empty_lines: true, trim: true });
    } catch (err: any) {
      throw new BadRequestException(`Could not parse CSV: ${err?.message ?? err}`);
    }
    if (rows.length === 0) {
      throw new BadRequestException('CSV has no data rows');
    }

    const results: { row: number; ticketNo?: string; error?: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // +1 for 0-index, +1 for the header row
      try {
        if (!row.source || !Object.values(Source).includes(row.source as Source)) {
          throw new Error(`Invalid or missing "source" (got "${row.source ?? ''}")`);
        }
        if (!row.description?.trim()) {
          throw new Error('Missing "description"');
        }
        if (row.serviceType && !Object.values(ServiceType).includes(row.serviceType as ServiceType)) {
          throw new Error(`Invalid "serviceType" (got "${row.serviceType}")`);
        }
        if (row.priority && !Object.values(Priority).includes(row.priority as Priority)) {
          throw new Error(`Invalid "priority" (got "${row.priority}")`);
        }

        const { customerId, equipmentId } = await this.resolveExternalRefs(row);

        const dto: CreateTicketDto = {
          source: row.source as Source,
          serviceType: (row.serviceType as ServiceType) || undefined,
          priority: (row.priority as Priority) || undefined,
          description: row.description.trim(),
          customerId,
          equipmentId,
          subject: row.subject?.trim() || undefined,
        };

        const ticket = await this.create(dto, actor);
        results.push({ row: rowNum, ticketNo: ticket.ticketNo });
      } catch (err: any) {
        results.push({ row: rowNum, error: err?.message ?? String(err) });
      }
    }

    return {
      total: rows.length,
      succeeded: results.filter((r) => r.ticketNo).length,
      failed: results.filter((r) => r.error).length,
      results,
    };
  }

  /** Shared by bulkImport() and createFromPartner() — resolves human-friendly identifiers to internal UUIDs. */
  private async resolveExternalRefs(row: {
    customerId?: string;
    customerErpId?: string;
    equipmentId?: string;
    equipmentSerialNo?: string;
  }): Promise<{ customerId: string; equipmentId?: string }> {
    let customerId = row.customerId?.trim();
    if (!customerId && row.customerErpId?.trim()) {
      const customer = await this.prisma.customer.findFirst({ where: { erpnextCustomerId: row.customerErpId.trim() } });
      if (!customer) throw new Error(`No customer found with erpnextCustomerId "${row.customerErpId}"`);
      customerId = customer.id;
    }
    if (!customerId) throw new Error('Missing "customerId" or "customerErpId"');

    let equipmentId = row.equipmentId?.trim() || undefined;
    if (!equipmentId && row.equipmentSerialNo?.trim()) {
      const equipment = await this.prisma.equipment.findUnique({ where: { serialNo: row.equipmentSerialNo.trim() } });
      if (!equipment) throw new Error(`No equipment found with serialNo "${row.equipmentSerialNo}"`);
      equipmentId = equipment.id;
    }

    return { customerId, equipmentId };
  }

  /**
   * Partner/IoT webhook entry point (Build Plan Phase 2 item 7 — scaffolding
   * only, no real adapter exists yet since no partner/sensor vendor is
   * confirmed). Always tagged source=API_PARTNER regardless of what the
   * caller sends (the whole point of this source value is knowing it came
   * from here, not from a logged-in user) — dedup/auto-classification/
   * auto-routing all apply identically via the same create() entry point.
   * There's no authenticated user for createdByUserId here (API-key auth,
   * not JWT), so this attributes to whichever user ID
   * PARTNER_ACTOR_USER_ID names — falls back to the first ADMIN found if
   * unset, since some real user must own the FK.
   */
  async createFromPartner(row: {
    description: string;
    customerId?: string;
    customerErpId?: string;
    equipmentId?: string;
    equipmentSerialNo?: string;
    serviceType?: string;
    priority?: string;
    subject?: string;
  }) {
    if (!row.description?.trim()) throw new BadRequestException('Missing "description"');
    if (row.serviceType && !Object.values(ServiceType).includes(row.serviceType as ServiceType)) {
      throw new BadRequestException(`Invalid "serviceType" (got "${row.serviceType}")`);
    }
    if (row.priority && !Object.values(Priority).includes(row.priority as Priority)) {
      throw new BadRequestException(`Invalid "priority" (got "${row.priority}")`);
    }

    let customerId: string, equipmentId: string | undefined;
    try {
      ({ customerId, equipmentId } = await this.resolveExternalRefs(row));
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? String(err));
    }

    let actorUserId = process.env.PARTNER_ACTOR_USER_ID;
    if (!actorUserId) {
      const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
      if (!admin) throw new BadRequestException('No PARTNER_ACTOR_USER_ID configured and no ADMIN user exists to attribute this ticket to');
      actorUserId = admin.id;
    }

    const dto: CreateTicketDto = {
      source: 'API_PARTNER',
      serviceType: (row.serviceType as ServiceType) || undefined,
      priority: (row.priority as Priority) || undefined,
      description: row.description.trim(),
      customerId,
      equipmentId,
      subject: row.subject?.trim() || undefined,
    };

    return this.create(dto, { userId: actorUserId, role: 'ADMIN' });
  }

  /**
   * AMC nightly cron entry point (2026-07-27, build plan's "AMC engine:
   * nightly auto-ticket job") — a scheduled visit's planned date has
   * arrived, so raise a real Ticket for it via the same create() engine
   * every other source uses (dedup/auto-routing/priority matrix all apply
   * identically), tagged source=AMC_SCHEDULED, serviceType=AMC. Same
   * no-logged-in-user problem as the partner webhook — attributes to
   * PARTNER_ACTOR_USER_ID (falls back to the first ADMIN) since a cron has
   * no actual user either.
   */
  async createFromAmcSchedule(params: {
    contractId: string;
    customerId: string;
    equipmentId: string;
    visitSeqNo: number;
    contractReferenceNo: string;
  }) {
    let actorUserId = process.env.PARTNER_ACTOR_USER_ID;
    if (!actorUserId) {
      const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
      if (!admin) throw new BadRequestException('No PARTNER_ACTOR_USER_ID configured and no ADMIN user exists to attribute this ticket to');
      actorUserId = admin.id;
    }

    const dto: CreateTicketDto = {
      source: 'AMC_SCHEDULED',
      serviceType: 'AMC',
      customerCategory: 'AMC',
      description: `Scheduled AMC visit #${params.visitSeqNo} for contract ${params.contractReferenceNo}`,
      customerId: params.customerId,
      equipmentId: params.equipmentId,
    };

    return this.create(dto, { userId: actorUserId, role: 'ADMIN' });
  }
}
