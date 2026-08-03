import { AsyncLocalStorage } from 'async_hooks';
import { ChangeSource } from '@prisma/client';

/**
 * Generic field-level audit trail (2026-08-03) — request-scoped "who is
 * making this change" context, read by the automatic diffing hook installed
 * on PrismaService (see prisma.service.ts) so every FieldServiceVisit/
 * AmcContract/Quotation/User `.update()` call gets attributed to a real
 * actor without every single call site needing to pass one explicitly.
 *
 * Set once per HTTP request by AuditContextInterceptor (global), and once
 * per cron run by wrapping that cron's `run()` body in `runWithAuditContext`
 * with a system actor — see amc-renewal.cron.ts for the pattern. If nothing
 * sets this (e.g. a script run outside a request/cron), the diffing hook
 * finds no context and skips logging entirely rather than guessing an actor.
 */
export interface AuditActorContext {
  userId: string;
  changeSource: ChangeSource;
  ipAddress?: string;
}

const storage = new AsyncLocalStorage<AuditActorContext>();

export function runWithAuditContext<T>(ctx: AuditActorContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function getAuditContext(): AuditActorContext | undefined {
  return storage.getStore();
}
