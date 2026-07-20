import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, ServiceType, Priority, Source, PendingReason, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { nextTicketNo } from './ticket-number.util';
import { addBusinessHours } from './business-hours.util';
import { SLA_POLICY } from './sla-policy.constants';
import { WorkflowService } from '../workflow/workflow.service';

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

    const policy = serviceType ? SLA_POLICY[serviceType]?.[priority] : undefined;
    const now = new Date();
    const slaResponseDue = policy ? addBusinessHours(now, policy.responseHours) : null;
    const slaResolutionDue = policy ? addBusinessHours(now, policy.resolutionHours) : null;

    const ticketNo = await nextTicketNo(this.prisma);
    const subject =
      dto.subject ??
      `${equipment?.itemName ?? 'General'} — ${serviceTypeLabel(serviceType)} — ${customer.customerName}`;

    const ticket = await this.prisma.ticket.create({
      data: {
        ticketNo,
        source: dto.source,
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
        createdByUserId: actor.userId,
      },
    });

    // Manual/customer-initiated sources: never merge, just cross-reference
    // note pointing at the likely-duplicate ticket so Call Center/ASM can
    // decide for themselves whether to consolidate.
    if (duplicateCandidate && !AUTO_MERGE_SOURCES.includes(dto.source)) {
      await this.prisma.ticketAuditLog.create({
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
      ? await this.prisma.userRegion.findMany({
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

      await this.prisma.ticket.update({ where: { id: ticket.id }, data: { assignedAsmId: chosenAsm.id } });
      await this.workflow.transition({
        ticketId: ticket.id,
        targetStatus: 'ASSIGNED',
        actorUserId: actor.userId,
        actorRole: actor.role,
      });
    }
    // No ASM covers this region: ticket stays OPEN/unassigned, already
    // surfaced correctly by the existing "Unassigned" dashboard views.

    return this.prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
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
    if (filters.priority) where.priority = filters.priority as any;
    if (filters.region) where.customer = { ...(where.customer as object), region: filters.region as any };

    return this.prisma.ticket.findMany({
      where,
      include: { customer: true, equipment: true, assignedEngineer: true, assignedAsm: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      include: { customer: true, equipment: true, site: true, visits: true, assignedEngineer: true, assignedAsm: true },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (actor.role === 'ENGINEER' && ticket.assignedEngineerId !== actor.userId) {
      throw new ForbiddenException('Not your ticket');
    }
    return ticket;
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
   * Client request: service type can be set/updated after ticket creation
   * (it may genuinely be unknown at creation time) — restricted to
   * ASM/Engineer/Manager/Admin (enforced at the controller), not Call
   * Center, since they're the ones actually diagnosing the issue. Priority
   * and SLA due dates are recomputed against the newly-known service type,
   * since there was no SLA clock running at all while it was unset.
   */
  async updateServiceType(id: string, serviceType: ServiceType, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id } });
    const policy = SLA_POLICY[serviceType]?.[ticket.priority];
    const now = new Date();

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        serviceType,
        slaResponseDue: policy ? addBusinessHours(now, policy.responseHours) : ticket.slaResponseDue,
        slaResolutionDue: policy ? addBusinessHours(now, policy.resolutionHours) : ticket.slaResolutionDue,
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

  /**
   * Engineer marks the ticket resolved. §14.2 rule 23 says this should only
   * happen via a submitted, linked FSV — FSV isn't built yet (Days 4-10), so
   * this is a direct action for now, gated on resolutionSummary same as the
   * FSD requires. Revisit once FSV submit exists.
   */
  resolve(id: string, resolutionSummary: string, actor: RequestUser) {
    return this.workflow.transition({
      ticketId: id,
      targetStatus: 'ENGINEER_RESOLVED',
      actorUserId: actor.userId,
      actorRole: actor.role,
      resolutionSummary,
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
   * Call Center/Manager closes the ticket. §14.4 rule 30 (chargeable tickets
   * need a draft Sales Invoice before closure) isn't enforceable yet — no
   * Quotation/billing handoff exists (Days 4-10, T3). TODO: add that check
   * once erpnextInvoiceId is actually populated by that work.
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

  /** Admin-only reopen from Closed (§5.4 — "re-openable by Admin only"). */
  reopen(id: string, actor: RequestUser) {
    return this.workflow.transition({
      ticketId: id,
      targetStatus: 'ASM_RESOLVED',
      actorUserId: actor.userId,
      actorRole: actor.role,
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
}
