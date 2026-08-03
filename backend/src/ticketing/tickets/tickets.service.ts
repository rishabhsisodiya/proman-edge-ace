import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, Priority, Source, PendingReason, TicketStatus, CustomerCategory, NotifChannel, Region } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { nextTicketNo } from './ticket-number.util';
import { addBusinessHours } from './business-hours.util';
import { SLA_TARGET_DATE_SERVICE_TYPES, SLA_TARGET_DATE_LABEL } from './sla-policy.constants';
import { WorkflowService } from '../workflow/workflow.service';
import { SlaPolicyService } from '../sla-policy/sla-policy.service';
import { HolidayService } from '../holiday/holiday.service';
import { ServiceTypeConfigService } from '../service-types/service-type.service';
import { NotificationService } from '../../notifications/notification.service';
import { NotificationTemplateService } from '../../notifications/notification-template.service';

/**
 * FSD §7.1 rule 4 — auto-classification for auto-sources (AMC->Scheduled PM/
 * Medium, warranty->Warranty Repair/High, predictive->Technical Audit/High).
 * Genuinely nothing to do yet: those 3 auto-sources (amc_scheduled,
 * warranty_triggered, predictive) aren't in the `Source` enum at all — they
 * only get created once the AMC/Warranty/Predictive engines exist (Build
 * Plan Days 4-10, T2). Left as an explicit stub rather than faking
 * classification for sources that can't occur today.
 */
function autoClassify(source: Source): { serviceType?: string; priority?: Priority } {
  return {};
}

// FSD §5.2 Priority Matrix (service_type + customer_type + equipment_category
// -> default priority) — full 3-dimension version needs the Admin config
// screen (not built yet). This is the service_type-only slice of it: enough
// to give Call Center a sensible default without forcing a manual pick every
// time, per §5.3 ("priority auto-set by Priority Matrix, overridable by CC/ASM").
// Partial (2026-08-02, Service Types Tier 1) — was `Record<ServiceType,
// Priority>`, a total map, guaranteed to have every key. Now that Admin can
// add new service types not in this map, every lookup MUST fall back to
// DEFAULT_PRIORITY_WHEN_UNKNOWN — see the `??` fix at the two call sites
// below (this was the "missing-key fallback bug" flagged when this pass was
// scoped: a lookup miss previously would have silently produced `undefined`
// instead of falling back).
const DEFAULT_PRIORITY_BY_SERVICE_TYPE: Partial<Record<string, Priority>> = {
  BREAKDOWN_CHARGEABLE: 'CRITICAL',
  WARRANTY_REPAIR: 'HIGH',
  TECHNICAL_AUDIT: 'MEDIUM',
  RETROFIT_UPGRADE: 'MEDIUM',
  SCHEDULED_PM: 'MEDIUM',
  AMC: 'MEDIUM',
  SPARES_SUPPLY_INSTALLATION: 'LOW',
  WARRANTY_RENEWAL_OUTREACH: 'LOW',
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
// Same minimum as FSV's "Work Performed" field (fsv.service.ts) — resolving
// a ticket without an FSV should require at least as much explanation, not less.
const MIN_RESOLUTION_SUMMARY_LENGTH = 20;
const AUTO_MERGE_SOURCES: Source[] = ['API_PARTNER'];

// Human-readable labels for the auto-generated subject (§5.3) — using the raw
// enum value there leaks "BREAKDOWN_CHARGEABLE" straight into a user-facing field.
// Partial (2026-08-02, Service Types Tier 1) — same reasoning as
// DEFAULT_PRIORITY_BY_SERVICE_TYPE above. An Admin-added custom service type
// won't have an entry here; serviceTypeLabel() below falls back to the raw
// code itself rather than crashing or mislabeling — a known, accepted Tier 1
// degradation (a custom type's subject/audit-log text shows its raw code,
// e.g. "ONSITE_TRAINING", until/unless this map is fetched from
// ServiceTypeConfig instead — out of scope for this pass).
const SERVICE_TYPE_LABEL: Partial<Record<string, string>> = {
  WARRANTY_REPAIR: 'Warranty Repair',
  // Client request: drop "(Chargeable)" from the display label — billing
  // behavior is unchanged, this is a display-only rename.
  BREAKDOWN_CHARGEABLE: 'Breakdown',
  SCHEDULED_PM: 'Scheduled PM',
  TECHNICAL_AUDIT: 'Technical Audit',
  RETROFIT_UPGRADE: 'Retrofit / Upgrade',
  AMC: 'AMC',
  SPARES_SUPPLY_INSTALLATION: 'Spares Supply (with installation)',
  WARRANTY_RENEWAL_OUTREACH: 'Warranty Renewal Outreach',
};
const NOT_YET_DETERMINED_LABEL = 'Not Yet Determined';
function serviceTypeLabel(s: string | null): string {
  return s ? (SERVICE_TYPE_LABEL[s] ?? s) : NOT_YET_DETERMINED_LABEL;
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
    private readonly holidays: HolidayService,
    private readonly serviceTypes: ServiceTypeConfigService,
    private readonly notifications: NotificationService,
    private readonly notificationTemplates: NotificationTemplateService,
  ) {}

  /**
   * N-01/N-02 (FSD §9) — fires after the create() transaction commits (a
   * notification failure must never roll back ticket creation, and
   * NotificationService never throws anyway, but this keeps the concerns
   * separate). N-01 always fires (customer); N-02 only if auto-routing
   * actually found an ASM to assign.
   *
   * WARRANTY_RENEWAL_OUTREACH is the one exception (2026-07-31) — it's a
   * system-generated sales lead, not a real customer service request, so
   * N-01's "your service request has been registered" would be actively
   * wrong to send the customer. N-23 (the FSD's actual trigger for this
   * ticket type) goes to the ASM instead of the generic N-02.
   */
  private async fireTicketCreatedNotifications(ticketId: string) {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      include: { customer: true, equipment: true, site: true, assignedAsm: true },
    });
    const vars = {
      ticket_no: ticket.ticketNo,
      equipment_model: ticket.equipment?.itemName ?? 'N/A',
      site_name: ticket.site?.siteName ?? ticket.customer.customerName,
      service_type: ticket.serviceType ?? 'Unassigned',
      priority: ticket.priority,
      customer_name: ticket.customer.customerName,
    };

    if (ticket.serviceType === 'WARRANTY_RENEWAL_OUTREACH') {
      if (ticket.assignedAsm) {
        const outreachVars = {
          equipment_serial: ticket.equipment?.serialNo ?? 'N/A',
          warranty_end_date: ticket.equipment?.warrantyEndDate?.toISOString().slice(0, 10) ?? 'N/A',
          ticket_no: ticket.ticketNo,
        };
        await this.fireNotification('N-23', 'EMAIL', ticket.assignedAsm.email, outreachVars, ticket.id);
        await this.fireNotification('N-23', 'PUSH', ticket.assignedAsm.email, outreachVars, ticket.id, ticket.assignedAsm.id);
      }
      return;
    }

    // Same reasoning as WARRANTY_RENEWAL_OUTREACH above — system-generated,
    // not a real customer request. N-22 goes to ASM (territory) + Manager,
    // per FSD, instead of the generic N-01/N-02.
    if (ticket.source === 'PREDICTIVE') {
      const predictiveVars = {
        // description already carries the specific reason (set by
        // createFromPredictiveTrigger) — more accurate than re-deriving a
        // rule name from serviceType alone, since two different rules both
        // produce TECHNICAL_AUDIT tickets.
        rule_name: ticket.description,
        equipment_serial: ticket.equipment?.serialNo ?? 'N/A',
        equipment_model: ticket.equipment?.itemName ?? 'N/A',
        customer_name: ticket.customer.customerName,
        ticket_no: ticket.ticketNo,
      };
      const recipients: { email: string; userId: string }[] = [];
      if (ticket.assignedAsm) recipients.push({ email: ticket.assignedAsm.email, userId: ticket.assignedAsm.id });
      recipients.push(...(await this.managersForRegion(ticket.customer.region)).map((u) => ({ email: u.email, userId: u.id })));
      for (const r of recipients) {
        await this.fireNotification('N-22', 'EMAIL', r.email, predictiveVars, ticket.id);
        await this.fireNotification('N-22', 'PUSH', r.email, predictiveVars, ticket.id, r.userId);
      }
      return;
    }

    const emailTemplate = await this.notificationTemplates.render('N-01', 'EMAIL', vars);
    if (emailTemplate && ticket.customer.primaryContactEmail) {
      await this.notifications.send({
        channel: 'EMAIL',
        recipient: ticket.customer.primaryContactEmail,
        templateName: 'N-01 Ticket created',
        subject: emailTemplate.subject,
        body: emailTemplate.body,
        ticketId: ticket.id,
      });
    }
    const waTemplate = await this.notificationTemplates.render('N-01', 'WHATSAPP', vars);
    if (waTemplate && ticket.customer.primaryContactMobile) {
      await this.notifications.send({
        channel: 'WHATSAPP',
        recipient: ticket.customer.primaryContactMobile,
        templateName: 'N-01 Ticket created',
        body: waTemplate.body,
        ticketId: ticket.id,
      });
    }

    if (ticket.assignedAsm) {
      const asmVars = { ...vars };
      const asmEmailTemplate = await this.notificationTemplates.render('N-02', 'EMAIL', asmVars);
      if (asmEmailTemplate) {
        await this.notifications.send({
          channel: 'EMAIL',
          recipient: ticket.assignedAsm.email,
          templateName: 'N-02 Ticket assigned to ASM',
          subject: asmEmailTemplate.subject,
          body: asmEmailTemplate.body,
          ticketId: ticket.id,
        });
      }
      const asmPushTemplate = await this.notificationTemplates.render('N-02', 'PUSH', asmVars);
      if (asmPushTemplate) {
        await this.notifications.send({
          channel: 'PUSH',
          recipient: ticket.assignedAsm.email,
          templateName: 'N-02 Ticket assigned to ASM',
          subject: asmPushTemplate.subject,
          body: asmPushTemplate.body,
          ticketId: ticket.id,
          userId: ticket.assignedAsm.id,
        });
      }
    }
  }

  /** Shared render+send for the per-status triggers (N-03 through N-09) — looks up the template, no-ops (no send) if that trigger/channel combination has no template row. */
  private async fireNotification(
    triggerCode: string,
    channel: NotifChannel,
    recipient: string,
    vars: Record<string, string | number | null | undefined>,
    ticketId?: string,
    userId?: string,
  ) {
    const template = await this.notificationTemplates.render(triggerCode, channel, vars);
    if (!template) return;
    await this.notifications.send({
      channel,
      recipient,
      templateName: `${triggerCode}`,
      subject: template.subject,
      body: template.body,
      ticketId,
      userId,
    });
  }

  /**
   * Region-scoped Manager lookup (client decision, 2026-08-02) — replaces
   * every `findMany({ where: { role: 'MANAGER' } })` notification lookup
   * that used to notify ALL Managers regardless of the ticket's region, now
   * that the Manager role itself is region-scoped (same UserRegion table
   * ASM already used). Null `region` (customer has none set) matches no one
   * — same fail-safe as an unassigned Manager seeing nothing, rather than
   * silently falling back to notifying everyone.
   */
  private async managersForRegion(region: Region | null) {
    if (!region) return [];
    const regions = await this.prisma.userRegion.findMany({ where: { region, user: { role: 'MANAGER', isActive: true } } });
    if (regions.length === 0) return [];
    return this.prisma.user.findMany({ where: { id: { in: regions.map((r) => r.userId) } } });
  }

  /**
   * §7.1 rule 5 — round-robin ASM assignment (client confirmed 2026-07-31,
   * reversing the earlier Q12 load-based default). No separate "last
   * assigned index" counter table needed: rotation is derived from each
   * candidate's own most recent ticket assignment (`Ticket.createdAt` for
   * the ticket where they're `assignedAsmId`) — whoever hasn't been handed a
   * ticket in the longest time goes next; an ASM never yet assigned any
   * ticket goes first. This is stateless/self-correcting (survives server
   * restarts, doesn't drift if an ASM is added/removed from a region) unlike
   * a plain incrementing index, at the cost of one extra query per routing
   * decision — negligible next to ticket-creation's other DB calls.
   * `candidateIds` should be in a stable order (caller orders by `userId`) so
   * a tie between two never-assigned ASMs resolves deterministically rather
   * than depending on query-result ordering.
   */
  private async pickRoundRobinAsm(db: PrismaService | Prisma.TransactionClient, candidateIds: string[]): Promise<string> {
    const lastAssigned = await db.ticket.groupBy({
      by: ['assignedAsmId'],
      where: { assignedAsmId: { in: candidateIds } },
      _max: { createdAt: true },
    });
    const lastAssignedAt = new Map(lastAssigned.map((r) => [r.assignedAsmId as string, r._max.createdAt as Date]));

    let chosenId = candidateIds[0];
    let chosenTime = lastAssignedAt.get(chosenId) ?? new Date(0);
    for (const id of candidateIds.slice(1)) {
      const t = lastAssignedAt.get(id) ?? new Date(0);
      if (t < chosenTime) {
        chosenId = id;
        chosenTime = t;
      }
    }
    return chosenId;
  }

  /**
   * The single ticket-creation entry point (FSD §7.1 rule 1) — every source
   * (call, WhatsApp, bulk import, partner API, internal) must go through this.
   */
  async create(dto: CreateTicketDto, actor: RequestUser) {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: dto.customerId } });

    // FSD Customer entity spec — "Inactive/Blacklisted block new ticket
    // creation by default" (both statuses, not just Blacklisted — the
    // original check here only tested BLACKLISTED, an FSD gap fixed
    // 2026-07-31). FSD-Analysis Q2's resolved override flow: Manager already
    // has unconditional "Create ticket" rights (§15.1 Permission Matrix), so
    // Manager bypasses this block entirely rather than a separate
    // approval-request object — Call Center/ASM's blocked attempt instead
    // notifies every Manager so one of them can create it directly.
    if ((customer.accountStatus === 'INACTIVE' || customer.accountStatus === 'BLACKLISTED') && actor.role !== 'MANAGER') {
      const attemptedBy = await this.prisma.user.findUnique({ where: { id: actor.userId }, select: { fullName: true } });
      const managers = await this.managersForRegion(customer.region);
      const vars = {
        customer_name: customer.customerName,
        account_status: customer.accountStatus === 'BLACKLISTED' ? 'Blacklisted' : 'Inactive',
        attempted_by: attemptedBy?.fullName ?? 'A Call Center/ASM user',
      };
      for (const manager of managers) {
        await this.fireNotification('CUST-BLOCKED', 'EMAIL', manager.email, vars);
        await this.fireNotification('CUST-BLOCKED', 'PUSH', manager.email, vars, undefined, manager.id);
      }
      throw new ForbiddenException(
        `Customer account is ${customer.accountStatus === 'BLACKLISTED' ? 'blacklisted' : 'inactive'}. A Manager has been notified and can create this ticket directly.`,
      );
    }

    let equipment = null;
    if (dto.equipmentId) {
      equipment = await this.prisma.equipment.findUniqueOrThrow({ where: { id: dto.equipmentId }, include: { site: true } });
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
    const serviceType: string | null = dto.serviceType ?? autoClass.serviceType ?? null;
    // Replaces the old `@IsEnum(ServiceType)` DTO-level guarantee (2026-08-02,
    // Service Types Tier 1) — serviceType is now a free string validated
    // against ServiceTypeConfig here instead of a fixed TS enum.
    if (dto.serviceType && !(await this.serviceTypes.isValidActiveCode(dto.serviceType))) {
      throw new BadRequestException(`Unknown or inactive service type "${dto.serviceType}"`);
    }
    const priority =
      dto.priority ??
      autoClass.priority ??
      (serviceType ? (DEFAULT_PRIORITY_BY_SERVICE_TYPE[serviceType] ?? DEFAULT_PRIORITY_WHEN_UNKNOWN) : DEFAULT_PRIORITY_WHEN_UNKNOWN);

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

    // SLA Target Date types: slaResolutionDue is exactly the entered
    // date/time, not a business-hours computation — the response clock is
    // untouched, still computed from SlaPolicy as normal (Scheduled PM has
    // no response SLA, so its policy row stays blank by design).
    const usesTargetDate = serviceType != null && SLA_TARGET_DATE_SERVICE_TYPES.includes(serviceType);
    if (usesTargetDate && !dto.slaTargetDate) {
      throw new BadRequestException(
        `${SLA_TARGET_DATE_LABEL[serviceType!]} is required for ${serviceTypeLabel(serviceType)} tickets.`,
      );
    }

    const policy = await this.slaPolicies.resolve(serviceType, priority);
    const holidayDates = await this.holidays.listDateSet();
    const now = new Date();
    const slaResponseDue = policy?.responseHours != null ? addBusinessHours(now, policy.responseHours, holidayDates) : null;
    const slaTargetDate = usesTargetDate ? new Date(dto.slaTargetDate!) : null;
    const slaResolutionDue = usesTargetDate
      ? slaTargetDate
      : policy?.resolutionHours != null
        ? addBusinessHours(now, policy.resolutionHours, holidayDates)
        : null;

    const ticketNo = await nextTicketNo(this.prisma);
    // §14.1 rule 18 / FSD-Analysis Q11 — auto-generated subject format is
    // "[Equipment model] — [service_type] — [customer.site_name]"; was
    // customer.customerName here, not the ticket's actual site (fixed
    // 2026-07-31). Falls back to the customer name only if this equipment
    // has no site on file yet.
    const subject =
      dto.subject ??
      `${equipment?.itemName ?? 'General'} — ${serviceTypeLabel(serviceType)} — ${equipment?.site?.siteName ?? customer.customerName}`;

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
          slaTargetDate,
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
      // round-robin (client confirmed 2026-07-31, reversing the Q12
      // load-based default — see pickRoundRobinAsm() for how rotation works
      // without a separate counter table). A customer whose region hasn't
      // been resolved yet (needsReview from the nightly sync) can't be
      // routed — falls through to unassigned, same as the "no ASM covers
      // this region" case below.
      const regionAsms = customer.region
        ? await tx.userRegion.findMany({
            where: { region: customer.region, user: { role: 'ASM' } },
            include: { user: true },
            orderBy: { userId: 'asc' },
          })
        : [];
      if (regionAsms.length > 0) {
        const chosenAsmId = await this.pickRoundRobinAsm(tx, regionAsms.map((r) => r.user.id));

        await tx.ticket.update({ where: { id: ticket.id }, data: { assignedAsmId: chosenAsmId } });
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

    await this.fireTicketCreatedNotifications(ticketId);

    return this.prisma.ticket.findUniqueOrThrow({ where: { id: ticketId } });
  }

  /** Region/assignment-scoped list — enforced at the query layer, not the UI. */
  async list(actor: RequestUser, filters: Record<string, string | undefined>) {
    const where: Prisma.TicketWhereInput = {};

    if (actor.role === 'ENGINEER') {
      where.assignedEngineerId = actor.userId;
    } else if (actor.role === 'ASM' || actor.role === 'MANAGER') {
      // Looked up here (not passed in by the caller) so no controller can
      // forget to scope a user's regions and silently return everything —
      // or, as previously happened for ASM, nothing at all (empty regions ->
      // empty result — the same fail-safe now applies to MANAGER too, client
      // decision 2026-08-02: an unassigned Manager sees nothing rather than
      // silently falling back to full visibility).
      const regions = await this.prisma.userRegion.findMany({ where: { userId: actor.userId } });
      where.customer = { region: { in: regions.map((r) => r.region) } };
    }
    // CALL_CENTER, ADMIN: unscoped (full visibility)

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
    // Client feedback (2026-07-31) — rejected tickets weren't distinguishable
    // from any other unassigned ASSIGNED ticket anywhere in the UI.
    if (filters.rejected === 'true') where.rejectionCount = { gt: 0 };
    // Free-text tags (client decision, 2026-08-01) — comma-separated exact
    // tag matches, searchable by ASM/Manager/Admin from the ticket list.
    if (filters.tags) {
      const tagList = filters.tags.split(',').map((t) => t.trim()).filter(Boolean);
      if (tagList.length) where.tags = { hasSome: tagList };
    }

    // Capped well above 100 — a few dashboards (Call Center, ASM, Manager/
    // Service) still need one unbounded-ish fetch for their own client-side
    // aggregate stat tiles (SLA at risk/breached, etc.) until they get a real
    // server-side stats endpoint; true paginated list views use the default
    // 25. BUG FIX (2026-08-01): this was 500 — real ticket volume passed that
    // (545 in this dataset), so Manager/Admin's SLA count tiles silently
    // undercounted, missing whatever fell outside the first 500 rows. Bumped
    // to 5000 as a stopgap with real headroom; the comment above about
    // needing a real server-side stats endpoint still stands — this will
    // eventually need to stop being a hardcoded ceiling entirely.
    const page = Math.max(1, parseInt(filters.page ?? '1', 10) || 1);
    const pageSize = Math.min(5000, Math.max(1, parseInt(filters.pageSize ?? '25', 10) || 25));

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

    const ticket = await this.prisma.ticket.findUniqueOrThrow({
      where: { id },
      include: { customer: true, equipment: true, site: true },
    });

    await this.prisma.ticket.update({ where: { id }, data: { assignedEngineerId: engineerId } });

    if (ticket.status === 'OPEN') {
      await this.workflow.transition({
        ticketId: id,
        targetStatus: 'ASSIGNED',
        actorUserId: actor.userId,
        actorRole: actor.role,
      });
    }
    const result = await this.workflow.transition({
      ticketId: id,
      targetStatus: 'ENGINEER_ASSIGNED',
      actorUserId: actor.userId,
      actorRole: actor.role,
      comment: `Assigned to ${engineer.fullName}`,
    });

    // N-03 (FSD §9) — notify the newly-assigned engineer.
    const vars = {
      ticket_no: ticket.ticketNo,
      customer_name: ticket.customer.customerName,
      site_name: ticket.site?.siteName ?? ticket.customer.customerName,
      equipment_model: ticket.equipment?.itemName ?? 'N/A',
      priority: ticket.priority,
    };
    await this.fireNotification('N-03', 'PUSH', engineer.email, vars, id, engineer.id);
    await this.fireNotification('N-03', 'WHATSAPP', engineer.mobile, vars, id);

    return result;
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
      include: { user: true },
      orderBy: { userId: 'asc' },
    });
    if (regionAsms.length === 0) {
      throw new BadRequestException(`Still no ASM covers region ${ticket.customer.region} — nothing to route to yet`);
    }

    const chosenAsmId = await this.pickRoundRobinAsm(this.prisma, regionAsms.map((r) => r.user.id));
    const chosenAsm = regionAsms.find((r) => r.user.id === chosenAsmId)!.user;

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
  async accept(id: string, actor: RequestUser) {
    const result = await this.workflow.transition({
      ticketId: id,
      targetStatus: 'ACCEPTED',
      actorUserId: actor.userId,
      actorRole: actor.role,
    });

    // N-04 (FSD §9) — notify customer + the ASM who assigned this engineer.
    const ticket = await this.prisma.ticket.findUniqueOrThrow({
      where: { id },
      include: { customer: true, assignedAsm: true, assignedEngineer: true },
    });
    const vars = {
      ticket_no: ticket.ticketNo,
      engineer_name: ticket.assignedEngineer?.fullName ?? 'Your engineer',
      site_name: ticket.customer.customerName,
      visit_date: 'shortly', // no scheduled-visit-date concept on a manual ticket yet
    };
    if (ticket.customer.primaryContactEmail) {
      await this.fireNotification('N-04', 'EMAIL', ticket.customer.primaryContactEmail, vars, id);
    }
    if (ticket.customer.primaryContactMobile) {
      await this.fireNotification('N-04', 'WHATSAPP', ticket.customer.primaryContactMobile, vars, id);
    }
    if (ticket.assignedAsm) {
      await this.fireNotification('N-04', 'PUSH', ticket.assignedAsm.email, vars, id, ticket.assignedAsm.id);
    }

    return result;
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
    const ticket = await this.prisma.ticket.findUniqueOrThrow({
      where: { id },
      include: { assignedAsm: true, assignedEngineer: true, customer: true },
    });
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

    // Comment surfaces this in the Timeline (2026-07-31 fix — this transition
    // previously passed no comment at all, so a rejection left literally no
    // visible trace beyond the raw rejectionCount/rejectionReasons fields,
    // which nothing in the UI read either).
    const updated = await this.workflow.transition({
      ticketId: id,
      targetStatus: 'ASSIGNED',
      actorUserId: actor.userId,
      actorRole: actor.role,
      comment: `Rejected by ${ticket.assignedEngineer?.fullName ?? 'Engineer'}: ${reason}`,
    });

    const escalationTier =
      rejectionCount >= 3 ? 'ESCALATED_TO_MANAGER' : rejectionCount === 2 ? 'MANAGER_ALERTED' : 'ASM_NOTIFIED';

    // N-05/06/07 (FSD §9) — tier picked by rejection count. 2nd/3rd tiers also
    // notify every active Manager (no "owning Manager" concept on a ticket).
    const triggerCode = rejectionCount >= 3 ? 'N-07' : rejectionCount === 2 ? 'N-06' : 'N-05';
    const vars = {
      ticket_no: ticket.ticketNo,
      engineer_name: ticket.assignedEngineer?.fullName ?? actor.userId,
      rejection_reason: reason,
    };
    if (ticket.assignedAsm) {
      await this.fireNotification(triggerCode, 'PUSH', ticket.assignedAsm.email, vars, id, ticket.assignedAsm.id);
      await this.fireNotification(triggerCode, 'EMAIL', ticket.assignedAsm.email, vars, id);
    }
    if (rejectionCount >= 2) {
      const managers = await this.managersForRegion(ticket.customer.region);
      for (const manager of managers) {
        await this.fireNotification(triggerCode, 'EMAIL', manager.email, vars, id);
        await this.fireNotification(triggerCode, 'PUSH', manager.email, vars, id, manager.id);
      }
    }

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
  async updateServiceType(id: string, serviceType: string, slaTargetDate: string | undefined, actor: RequestUser) {
    if (!(await this.serviceTypes.isValidActiveCode(serviceType))) {
      throw new BadRequestException(`Unknown or inactive service type "${serviceType}"`);
    }
    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id } });
    const usesTargetDate = SLA_TARGET_DATE_SERVICE_TYPES.includes(serviceType);
    if (usesTargetDate && !slaTargetDate) {
      throw new BadRequestException(`${SLA_TARGET_DATE_LABEL[serviceType]} is required for ${serviceTypeLabel(serviceType)} tickets.`);
    }

    const policy = await this.slaPolicies.resolve(serviceType, ticket.priority);
    const holidayDates = await this.holidays.listDateSet();
    const now = new Date();
    const newTargetDate = usesTargetDate ? new Date(slaTargetDate!) : null;

    const updated = await this.prisma.ticket.update({
      where: { id },
      data: {
        serviceType,
        slaTargetDate: newTargetDate,
        slaResponseDue: policy?.responseHours != null ? addBusinessHours(now, policy.responseHours, holidayDates) : ticket.slaResponseDue,
        slaResolutionDue: usesTargetDate
          ? newTargetDate
          : policy?.resolutionHours != null
            ? addBusinessHours(now, policy.resolutionHours, holidayDates)
            : ticket.slaResolutionDue,
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

  // Client decision (2026-08-01): free-text tags, entered by Call
  // Center/ASM/Manager/Admin, searchable by ASM/Manager/Admin via the
  // `tags` list filter (exact match on any tag, see `list()` below).
  async updateTags(id: string, tags: string[], actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id } });
    const cleaned = [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
    const updated = await this.prisma.ticket.update({ where: { id }, data: { tags: cleaned } });

    await this.prisma.ticketAuditLog.create({
      data: {
        ticketId: id,
        fieldName: 'tags',
        oldValue: ticket.tags.join(', '),
        newValue: cleaned.join(', '),
        changedByUserId: actor.userId,
        changeSource: 'WEB_UI',
      },
    });

    return updated;
  }

  /**
   * FSD §14.5 rule 34 / §15.1 permission matrix ("Override warranty flag" —
   * Manager/Admin) — the endpoint itself didn't exist at all until now
   * (2026-07-31); `Ticket.overrideReason` was a scaffolded, never-written
   * field. `warrantyStatusAtCreation` (the immutable auto-computed snapshot)
   * is deliberately left untouched here — only the functional
   * `warrantyEligible` flag changes, same "auto value stays, functional
   * classification changes" rule the client confirmed elsewhere for the
   * Customer Category override case.
   */
  async overrideWarrantyEligible(id: string, warrantyEligible: boolean, overrideReason: string, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.ticket.update({ where: { id }, data: { warrantyEligible, overrideReason } });

    await this.prisma.ticketAuditLog.create({
      data: {
        ticketId: id,
        fieldName: 'warrantyEligible',
        oldValue: String(ticket.warrantyEligible),
        newValue: `${warrantyEligible} (${overrideReason})`,
        changedByUserId: actor.userId,
        changeSource: 'WEB_UI',
      },
    });

    return updated;
  }

  /**
   * Engineer marks arrival at the customer site. `gpsLat`/`gpsLong` are a
   * best-effort client-captured GPS point (2026-07-31) — both optional, a
   * denied/unavailable location never blocks the transition itself.
   */
  async reachedSite(id: string, actor: RequestUser, comment?: string, gpsLat?: number, gpsLong?: number) {
    const result = await this.workflow.transition({
      ticketId: id,
      targetStatus: 'REACHED_SITE',
      actorUserId: actor.userId,
      actorRole: actor.role,
      comment,
    });

    if (gpsLat != null && gpsLong != null) {
      await this.prisma.ticket.update({ where: { id }, data: { reachedSiteGpsLat: gpsLat, reachedSiteGpsLong: gpsLong } });
    }

    // N-08 (FSD §9) — notify customer + the ASM.
    const ticket = await this.prisma.ticket.findUniqueOrThrow({
      where: { id },
      include: { customer: true, assignedAsm: true, assignedEngineer: true },
    });
    const vars = {
      ticket_no: ticket.ticketNo,
      engineer_name: ticket.assignedEngineer?.fullName ?? 'Your engineer',
      site_name: ticket.customer.customerName,
    };
    if (ticket.customer.primaryContactMobile) {
      await this.fireNotification('N-08', 'WHATSAPP', ticket.customer.primaryContactMobile, vars, id);
    }
    if (ticket.assignedAsm) {
      await this.fireNotification('N-08', 'PUSH', ticket.assignedAsm.email, vars, id, ticket.assignedAsm.id);
    }

    return result;
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
  async markPending(id: string, pendingReason: PendingReason, pendingNotes: string, actor: RequestUser) {
    const result = await this.workflow.transition({
      ticketId: id,
      targetStatus: 'PENDING',
      actorUserId: actor.userId,
      actorRole: actor.role,
      pendingReason,
      pendingNotes,
    });

    // N-09 (FSD §9) — notify customer + ASM + Call Center.
    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id }, include: { customer: true, assignedAsm: true } });
    const vars = { ticket_no: ticket.ticketNo, pending_reason: `${pendingReason} — ${pendingNotes}` };
    if (ticket.customer.primaryContactMobile) {
      await this.fireNotification('N-09', 'WHATSAPP', ticket.customer.primaryContactMobile, vars, id);
    }
    if (ticket.assignedAsm) {
      await this.fireNotification('N-09', 'PUSH', ticket.assignedAsm.email, vars, id, ticket.assignedAsm.id);
    }
    const callCenterUsers = await this.prisma.user.findMany({ where: { role: 'CALL_CENTER', isActive: true } });
    for (const cc of callCenterUsers) {
      await this.fireNotification('N-09', 'PUSH', cc.email, vars, id, cc.id);
    }

    return result;
  }

  /**
   * Client feedback (2026-08-01) — resolves the "Engineer-Resolved UX
   * clarification" pending item (reading B): a genuinely separate action
   * from the FSV form, not a label/nav fix. **FSV remains mandatory** — this
   * does not let an engineer skip it. What changes is that submitting the
   * FSV no longer *automatically* moves the ticket to ENGINEER_RESOLVED
   * (see FsvService.submit()); the engineer now takes this separate,
   * explicit step afterward — own screen, own resolution-summary text —
   * once at least one FSV for this ticket has actually been submitted.
   * `WorkflowService.transition()` already requires `resolutionSummary` for
   * this target status; it does NOT check generically whether the caller is
   * *this ticket's* assigned engineer (only that their role is ENGINEER),
   * so that ownership check lives here, same as the "has an FSV been
   * submitted" gate that keeps this from being a bypass.
   */
  async engineerResolve(id: string, resolutionSummary: string, actor: RequestUser) {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id }, include: { visits: true } });
    if (ticket.assignedEngineerId !== actor.userId) {
      throw new ForbiddenException('Only the assigned engineer can resolve this ticket');
    }
    if (!ticket.visits.some((v) => v.status === 'SUBMITTED')) {
      throw new BadRequestException('Submit a Field Service Visit for this ticket before marking it resolved');
    }
    if (resolutionSummary.trim().length < MIN_RESOLUTION_SUMMARY_LENGTH) {
      throw new BadRequestException(`Resolution summary must be at least ${MIN_RESOLUTION_SUMMARY_LENGTH} characters`);
    }

    return this.workflow.transition({
      ticketId: id,
      targetStatus: 'ENGINEER_RESOLVED',
      actorUserId: actor.userId,
      actorRole: actor.role,
      resolutionSummary: resolutionSummary.trim(),
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
  async close(id: string, actor: RequestUser, comment?: string) {
    const updated = await this.workflow.transition({
      ticketId: id,
      targetStatus: 'CLOSED',
      actorUserId: actor.userId,
      actorRole: actor.role,
      comment,
    });

    await this.sendCsatSurvey(id);

    return updated;
  }

  /**
   * N-14 (FSD §9) — "Ticket closed / Feedback." FSD wording specifies
   * Email + SMS; SMS is dropped project-wide (client decision, 2026-07-30),
   * substituted with WhatsApp per the same pattern used for N-17. Survey
   * link is just the ticket id (already an unguessable UUID) — no separate
   * token needed, same reasoning as most one-time survey links. Extracted
   * from close() so it can also be called as a manual "Resend Survey"
   * action (2026-07-31, client request) — e.g. if the original send failed
   * silently (no real Email/WhatsApp credentials yet) or the customer just
   * never responded.
   */
  private async sendCsatSurvey(id: string) {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id }, include: { customer: true } });
    const surveyLink = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/csat/${id}`;
    const vars = { ticket_no: ticket.ticketNo, survey_link: surveyLink };
    if (ticket.customer.primaryContactEmail) {
      await this.fireNotification('N-14', 'EMAIL', ticket.customer.primaryContactEmail, vars, id);
    }
    if (ticket.customer.primaryContactMobile) {
      await this.fireNotification('N-14', 'WHATSAPP', ticket.customer.primaryContactMobile, vars, id);
    }
    await this.prisma.ticket.update({ where: { id }, data: { csatSurveySent: true } });
  }

  /** Manual "Resend Survey" action (2026-07-31, client request) — Call Center/ASM/Manager/Admin can retrigger N-14 from the Ticket Detail page. */
  async resendCsatSurvey(id: string) {
    const ticket = await this.prisma.ticket.findUniqueOrThrow({ where: { id } });
    if (ticket.status !== 'CLOSED') {
      throw new BadRequestException('CSAT survey can only be sent for a Closed ticket');
    }
    if (ticket.csatScore != null) {
      throw new BadRequestException('Customer has already submitted feedback for this ticket');
    }
    await this.sendCsatSurvey(id);
    return { ok: true };
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
      const holidayDates = await this.holidays.listDateSet();
      const now = new Date();
      // SLA Target Date types: resolution due stays the fixed target date,
      // unaffected by reopen — same "never moves" rule as pause/resume.
      const usesTargetDate = ticket.serviceType != null && SLA_TARGET_DATE_SERVICE_TYPES.includes(ticket.serviceType);

      await tx.ticket.update({
        where: { id },
        data: {
          reOpenCount: { increment: 1 },
          slaResponseMet: false,
          slaResolutionMet: false,
          slaResponseStatus: 'ON_TRACK',
          slaResolutionStatus: 'ON_TRACK',
          slaResponseDue: policy?.responseHours != null ? addBusinessHours(now, policy.responseHours, holidayDates) : null,
          slaResolutionDue: usesTargetDate
            ? ticket.slaTargetDate
            : policy?.resolutionHours != null
              ? addBusinessHours(now, policy.resolutionHours, holidayDates)
              : null,
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
        if (row.serviceType && !(await this.serviceTypes.isValidActiveCode(row.serviceType))) {
          throw new Error(`Invalid "serviceType" (got "${row.serviceType}")`);
        }
        if (row.priority && !Object.values(Priority).includes(row.priority as Priority)) {
          throw new Error(`Invalid "priority" (got "${row.priority}")`);
        }

        const { customerId, equipmentId } = await this.resolveExternalRefs(row);

        const dto: CreateTicketDto = {
          source: row.source as Source,
          serviceType: row.serviceType || undefined,
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
    if (row.serviceType && !(await this.serviceTypes.isValidActiveCode(row.serviceType))) {
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
      serviceType: row.serviceType || undefined,
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

  /**
   * FSD §7.3 rule 15 — warranty-engine 45-day outreach ticket. "Routed to
   * owning ASM as a sales lead rather than a service job. Does not trigger
   * engineer assignment" — satisfied by going through the same create()
   * path every other ticket uses: region-based ASM auto-routing already
   * happens there, and engineer assignment was never automatic for any
   * ticket (a separate manual step), so nothing extra needs suppressing.
   */
  async createFromWarrantyOutreach(params: { customerId: string; equipmentId: string; equipmentSerialNo: string; warrantyEndDate: Date }) {
    let actorUserId = process.env.PARTNER_ACTOR_USER_ID;
    if (!actorUserId) {
      const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
      if (!admin) throw new BadRequestException('No PARTNER_ACTOR_USER_ID configured and no ADMIN user exists to attribute this ticket to');
      actorUserId = admin.id;
    }

    const dto: CreateTicketDto = {
      source: 'WARRANTY_TRIGGERED',
      serviceType: 'WARRANTY_RENEWAL_OUTREACH',
      priority: 'LOW',
      description: `Warranty expiry outreach: ${params.equipmentSerialNo} warranty expires ${params.warrantyEndDate.toISOString().slice(0, 10)}. No AMC in place — contact customer for AMC proposal.`,
      customerId: params.customerId,
      equipmentId: params.equipmentId,
    };

    return this.create(dto, { userId: actorUserId, role: 'ADMIN' });
  }

  /** FSD §7.4 — Predictive maintenance rule fired (any of the 3). Always `source=predictive`; serviceType/priority vary by which rule fired (see PredictiveEngineCron). */
  async createFromPredictiveTrigger(params: {
    customerId: string;
    equipmentId: string;
    equipmentSerialNo: string;
    serviceType: 'TECHNICAL_AUDIT' | 'SCHEDULED_PM';
    priority: 'MEDIUM' | 'HIGH';
    reasonNote: string;
  }) {
    let actorUserId = process.env.PARTNER_ACTOR_USER_ID;
    if (!actorUserId) {
      const admin = await this.prisma.user.findFirst({ where: { role: 'ADMIN' } });
      if (!admin) throw new BadRequestException('No PARTNER_ACTOR_USER_ID configured and no ADMIN user exists to attribute this ticket to');
      actorUserId = admin.id;
    }

    const dto: CreateTicketDto = {
      source: 'PREDICTIVE',
      serviceType: params.serviceType,
      priority: params.priority,
      description: `Predictive maintenance alert for ${params.equipmentSerialNo}: ${params.reasonNote}`,
      customerId: params.customerId,
      equipmentId: params.equipmentId,
    };

    return this.create(dto, { userId: actorUserId, role: 'ADMIN' });
  }
}
