import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { getAuditContext } from '../common/audit-context';

/**
 * Generic field-level audit trail (2026-08-03, client-agreed scope) — every
 * `.update()` call on these 4 models is diffed field-by-field and written to
 * `AuditLog` automatically, with zero code needed at each call site. Ticket
 * is deliberately NOT included here — its 12 existing audit call sites
 * (tickets.service.ts, workflow.service.ts, sla-breach.cron.ts,
 * notification.service.ts) carry hand-written narrative context (e.g.
 * "Rejected by John: reason X") that a plain field diff can't reproduce, and
 * running both would double-log every Ticket field change.
 *
 * Needs an actor in AsyncLocalStorage (see audit-context.ts) to attribute
 * the change to — set per-request by AuditContextInterceptor (main.ts), or
 * per-cron-run by wrapping that cron's `run()` in `runWithAuditContext()`
 * with a system actor (see amc-renewal.cron.ts for the pattern). No actor
 * in context = skip logging entirely, rather than guessing one.
 *
 * Scope limitations, accepted: only `.update()` is hooked, not `updateMany()`
 * (quotation-expiry.cron.ts's bulk expiry sweep isn't diffed per-row — a
 * bulk operation doesn't have one single "before" state to diff against
 * cleanly) or `create()`/`delete()` (this is a change trail, not a full
 * lifecycle log). Only scalar fields present in the update's own `data`
 * payload are compared — nested relation writes (e.g. User's
 * `regions: { deleteMany, create }`) aren't diffed, since Prisma's default
 * `update()` return doesn't include relations unless explicitly `include`d.
 */
const AUDITED_MODELS: Record<string, { entityType: string; exclude: string[] }> = {
  user: {
    entityType: 'USER',
    // passwordHash: never log a credential, hashed or not. tokenVersion:
    // internal security counter, not a meaningful business change.
    // currentGpsLat/currentGpsLong/lastLocationUpdate: updated on frequent
    // mobile location pings — would flood the log with noise, not a
    // deliberate business change.
    exclude: ['passwordHash', 'tokenVersion', 'currentGpsLat', 'currentGpsLong', 'lastLocationUpdate', 'updatedAt', 'createdAt'],
  },
  fieldServiceVisit: { entityType: 'FSV', exclude: ['updatedAt', 'createdAt'] },
  amcContract: { entityType: 'AMC', exclude: ['updatedAt', 'createdAt'] },
  quotation: { entityType: 'QUOTATION', exclude: ['updatedAt', 'createdAt'] },
};

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  // Covers Prisma.Decimal and anything else with a meaningful toString().
  return String(a) === String(b);
}

function stringifyValue(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    this.installAuditHooks();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private installAuditHooks() {
    for (const [modelKey, cfg] of Object.entries(AUDITED_MODELS)) {
      const delegate = (this as any)[modelKey];
      if (!delegate?.update) continue;
      const originalUpdate = delegate.update.bind(delegate);
      delegate.update = async (args: any) => {
        const actor = getAuditContext();
        if (!actor) return originalUpdate(args);

        const before = await delegate.findUnique({ where: args.where });
        const after = await originalUpdate(args);
        if (!before) return after;

        const changedKeys = Object.keys(args.data ?? {}).filter((k) => !cfg.exclude.includes(k));
        for (const key of changedKeys) {
          const oldVal = (before as any)[key];
          const newVal = (after as any)[key];
          if (valuesEqual(oldVal, newVal)) continue;
          await this.auditLog.create({
            data: {
              entityType: cfg.entityType,
              entityId: (after as any).id,
              fieldName: key,
              oldValue: stringifyValue(oldVal),
              newValue: stringifyValue(newVal),
              changedByUserId: actor.userId,
              changeSource: actor.changeSource,
              ipAddress: actor.ipAddress ?? null,
            },
          });
        }
        return after;
      };
    }
  }
}
