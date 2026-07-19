import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, ServiceType, Priority, Source, PendingReason, TicketStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { nextTicketNo } from './ticket-number.util';
import { addBusinessHours } from './business-hours.util';
import { SLA_POLICY } from './sla-policy.constants';
import { WorkflowService } from '../workflow/workflow.service';

/** FSD §7.1 rule 4 — auto-classification for auto-sources. */
function autoClassify(source: Source): { serviceType?: ServiceType; priority?: Priority } {
  // AMC/warranty/predictive auto-sources aren't in this MVP's ticket-creation surface
  // (no AMC engine, no warranty engine yet) — kept here as the single extension point
  // so Sprint 3+ work adds cases, not a second creation path.
  return {};
}

// Human-readable labels for the auto-generated subject (§5.3) — using the raw
// enum value there leaks "BREAKDOWN_CHARGEABLE" straight into a user-facing field.
const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  WARRANTY_REPAIR: 'Warranty Repair',
  BREAKDOWN_CHARGEABLE: 'Breakdown (Chargeable)',
  SCHEDULED_PM: 'Scheduled PM',
  TECHNICAL_AUDIT: 'Technical Audit',
  RETROFIT_UPGRADE: 'Retrofit / Upgrade',
  AMC: 'AMC',
  SPARES_SUPPLY_INSTALLATION: 'Spares Supply (with installation)',
};

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

    const autoClass = autoClassify(dto.source);
    const serviceType = dto.serviceType ?? autoClass.serviceType;
    const priority = dto.priority ?? autoClass.priority;
    if (!serviceType || !priority) {
      throw new BadRequestException('serviceType and priority are required for this source');
    }

    const warrantyStatusAtCreation = equipment?.warrantyStatus ?? null;
    const warrantyEligible = warrantyStatusAtCreation === 'UNDER_WARRANTY';

    const policy = SLA_POLICY[serviceType]?.[priority];
    const now = new Date();
    const slaResponseDue = policy ? addBusinessHours(now, policy.responseHours) : null;
    const slaResolutionDue = policy ? addBusinessHours(now, policy.resolutionHours) : null;

    const ticketNo = await nextTicketNo(this.prisma);
    const subject =
      dto.subject ??
      `${equipment?.itemName ?? 'General'} — ${SERVICE_TYPE_LABEL[serviceType]} — ${customer.customerName}`;

    return this.prisma.ticket.create({
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
        // Auto-routing to an ASM by matching region is Sprint 1 follow-up work
        // once User.regions seed data exists — left null here rather than guessed.
      },
    });
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
    return this.prisma.ticketAuditLog.findMany({
      where: { ticketId: id },
      orderBy: { changedAt: 'asc' },
    });
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

  /** Engineer marks arrival at the customer site. */
  reachedSite(id: string, actor: RequestUser) {
    return this.workflow.transition({
      ticketId: id,
      targetStatus: 'REACHED_SITE',
      actorUserId: actor.userId,
      actorRole: actor.role,
    });
  }

  /** Engineer begins on-site work. */
  startWorking(id: string, actor: RequestUser) {
    return this.workflow.transition({
      ticketId: id,
      targetStatus: 'WORKING',
      actorUserId: actor.userId,
      actorRole: actor.role,
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
  asmResolve(id: string, actor: RequestUser) {
    return this.workflow.transition({
      ticketId: id,
      targetStatus: 'ASM_RESOLVED',
      actorUserId: actor.userId,
      actorRole: actor.role,
    });
  }

  /**
   * Call Center/Manager closes the ticket. §14.4 rule 30 (chargeable tickets
   * need a draft Sales Invoice before closure) isn't enforceable yet — no
   * Quotation/billing handoff exists (Days 4-10, T3). TODO: add that check
   * once erpnextInvoiceId is actually populated by that work.
   */
  close(id: string, actor: RequestUser) {
    return this.workflow.transition({
      ticketId: id,
      targetStatus: 'CLOSED',
      actorUserId: actor.userId,
      actorRole: actor.role,
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
