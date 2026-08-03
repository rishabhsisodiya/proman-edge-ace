import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditLogFilters {
  entityType?: string;
  entityId?: string;
  changedByUserId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Admin "Audit Log" viewer (2026-08-03) — reads the same `AuditLog` table
 * the automatic diffing hook (PrismaService) and Ticket's 12 hand-written
 * call sites both write into. Resolves `changedByUserId` -> a real name and
 * `entityId` -> a human-readable label (ticketNo/visitNo/quotationNo/
 * contractReferenceNo/fullName) per entity type, batched to avoid N+1
 * queries, purely for display — same batching pattern already used by
 * TicketsService.timeline().
 */
@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filters: AuditLogFilters) {
    const where: Prisma.AuditLogWhereInput = {};
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.changedByUserId) where.changedByUserId = filters.changedByUserId;
    if (filters.dateFrom || filters.dateTo) {
      where.changedAt = {
        ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
      };
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { fieldName: { contains: q, mode: 'insensitive' } },
        { oldValue: { contains: q, mode: 'insensitive' } },
        { newValue: { contains: q, mode: 'insensitive' } },
      ];
    }

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { changedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const userIds = [...new Set(data.map((e) => e.changedByUserId))];
    const users = await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true } });
    const nameById = new Map(users.map((u) => [u.id, u.fullName]));

    const idsByType = new Map<string, Set<string>>();
    for (const e of data) {
      if (!idsByType.has(e.entityType)) idsByType.set(e.entityType, new Set());
      idsByType.get(e.entityType)!.add(e.entityId);
    }
    const labelByKey = new Map<string, string>();
    for (const [type, idSet] of idsByType) {
      const ids = [...idSet];
      switch (type) {
        case 'TICKET': {
          const rows = await this.prisma.ticket.findMany({ where: { id: { in: ids } }, select: { id: true, ticketNo: true } });
          rows.forEach((r) => labelByKey.set(`TICKET:${r.id}`, r.ticketNo));
          break;
        }
        case 'FSV': {
          const rows = await this.prisma.fieldServiceVisit.findMany({ where: { id: { in: ids } }, select: { id: true, visitNo: true } });
          rows.forEach((r) => labelByKey.set(`FSV:${r.id}`, r.visitNo));
          break;
        }
        case 'AMC': {
          const rows = await this.prisma.amcContract.findMany({ where: { id: { in: ids } }, select: { id: true, contractReferenceNo: true } });
          rows.forEach((r) => labelByKey.set(`AMC:${r.id}`, r.contractReferenceNo));
          break;
        }
        case 'QUOTATION': {
          const rows = await this.prisma.quotation.findMany({ where: { id: { in: ids } }, select: { id: true, quotationNo: true } });
          rows.forEach((r) => labelByKey.set(`QUOTATION:${r.id}`, r.quotationNo));
          break;
        }
        case 'USER': {
          const rows = await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } });
          rows.forEach((r) => labelByKey.set(`USER:${r.id}`, r.fullName));
          break;
        }
      }
    }

    return {
      data: data.map((e) => ({
        ...e,
        changedByName: nameById.get(e.changedByUserId) ?? 'System',
        entityLabel: labelByKey.get(`${e.entityType}:${e.entityId}`) ?? e.entityId,
      })),
      total,
      page,
      pageSize,
    };
  }
}
