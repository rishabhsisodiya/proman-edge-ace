import { Injectable, ConflictException } from '@nestjs/common';
import { Priority, ServiceType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Admin-configurable SLA target per FSD §14.3 — replaces the previously
 * hardcoded SLA_POLICY constant (sla-policy.constants.ts). Read by
 * TicketsService at creation and on service-type change to compute
 * slaResponseDue/slaResolutionDue. Missing (serviceType, priority)
 * combinations resolve to undefined — same "no SLA window" fallback the
 * hardcoded table always had, not a new behavior.
 */
@Injectable()
export class SlaPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.slaPolicy.findMany({ orderBy: [{ serviceType: 'asc' }, { priority: 'asc' }] });
  }

  async create(
    serviceType: ServiceType,
    priority: Priority,
    responseHours: number | null,
    resolutionHours: number | null,
    level2DelayHours?: number | null,
    level3DelayHours?: number | null,
  ) {
    const existing = await this.prisma.slaPolicy.findUnique({ where: { serviceType_priority: { serviceType, priority } } });
    if (existing) throw new ConflictException('A policy for this service type + priority already exists');
    return this.prisma.slaPolicy.create({
      data: { serviceType, priority, responseHours, resolutionHours, level2DelayHours, level3DelayHours },
    });
  }

  update(
    id: string,
    responseHours: number | null,
    resolutionHours: number | null,
    level2DelayHours?: number | null,
    level3DelayHours?: number | null,
  ) {
    return this.prisma.slaPolicy.update({
      where: { id },
      data: { responseHours, resolutionHours, level2DelayHours, level3DelayHours },
    });
  }

  remove(id: string) {
    return this.prisma.slaPolicy.delete({ where: { id } });
  }

  /**
   * Used by TicketsService — not exposed via the controller. A row can exist
   * with null hours (seeded blank, e.g. Breakdown/Low — no FSD-defined
   * target yet); callers must treat that the same as no row at all, not
   * dereference responseHours/resolutionHours as if guaranteed present.
   *
   * Takes `string | null` (2026-08-02, Service Types Tier 1) — was
   * `ServiceType | null`; Ticket.serviceType is now a plain string, and this
   * table deliberately stays keyed on the original `ServiceType` enum (not
   * touched in this pass — see schema.prisma's comment on that enum). An
   * Admin-added custom service type is, by definition, not one of the
   * enum's members, so it's checked here before ever building a Prisma
   * query — passing an arbitrary string into an enum-typed WHERE clause
   * would make Postgres itself error ("invalid input value for enum"),
   * not just return zero rows. Returning null here for an unrecognized
   * type is exactly the "no SLA window" graceful degradation this pass
   * promised for unconfigured new types.
   */
  async resolve(serviceType: string | null, priority: Priority): Promise<{ id: string; responseHours: number | null; resolutionHours: number | null } | null> {
    if (!serviceType || !(Object.values(ServiceType) as string[]).includes(serviceType)) return null;
    return this.prisma.slaPolicy.findUnique({ where: { serviceType_priority: { serviceType: serviceType as ServiceType, priority } } });
  }
}
