import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, ServiceType, Priority, Source } from '@prisma/client';
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
      `${equipment?.itemName ?? 'General'} — ${serviceType} — ${customer.customerName}`;

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

  /** Region/assignment-scoped list — FSD §15.2: enforced at the query layer, not the UI. */
  async list(actor: RequestUser & { regions?: string[] }, filters: Record<string, string | undefined>) {
    const where: Prisma.TicketWhereInput = {};

    if (actor.role === 'ENGINEER') {
      where.assignedEngineerId = actor.userId;
    } else if (actor.role === 'ASM') {
      where.customer = { region: { in: (actor.regions ?? []) as any } };
    }
    // CALL_CENTER, MANAGER, ADMIN: unscoped (full visibility per §15.1)

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
      include: { customer: true, equipment: true, site: true, visits: true },
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
}
