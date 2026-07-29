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

  async create(serviceType: ServiceType, priority: Priority, responseHours: number, resolutionHours: number) {
    const existing = await this.prisma.slaPolicy.findUnique({ where: { serviceType_priority: { serviceType, priority } } });
    if (existing) throw new ConflictException('A policy for this service type + priority already exists');
    return this.prisma.slaPolicy.create({ data: { serviceType, priority, responseHours, resolutionHours } });
  }

  update(id: string, responseHours: number, resolutionHours: number) {
    return this.prisma.slaPolicy.update({ where: { id }, data: { responseHours, resolutionHours } });
  }

  remove(id: string) {
    return this.prisma.slaPolicy.delete({ where: { id } });
  }

  /** Used by TicketsService — not exposed via the controller. */
  async resolve(serviceType: ServiceType | null, priority: Priority): Promise<{ id: string; responseHours: number; resolutionHours: number } | null> {
    if (!serviceType) return null;
    return this.prisma.slaPolicy.findUnique({ where: { serviceType_priority: { serviceType, priority } } });
  }
}
