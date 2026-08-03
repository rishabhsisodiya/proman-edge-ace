import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { runWithAuditContext } from './audit-context';

/**
 * Generic field-level audit trail (2026-08-03) — registered globally
 * (main.ts) so every authenticated HTTP request runs with a
 * userId/ipAddress in AsyncLocalStorage, which PrismaService's automatic
 * diffing hook reads to attribute FieldServiceVisit/AmcContract/Quotation/
 * User field changes to a real actor. Runs after JwtAuthGuard, so `req.user`
 * is already populated for any authenticated route; unauthenticated routes
 * (login, health checks, partner API-key routes) simply get no context set,
 * which the diffing hook treats as "skip logging" rather than guessing.
 */
@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    if (!req.user?.userId) return next.handle();

    return new Observable((subscriber) => {
      runWithAuditContext({ userId: req.user.userId, changeSource: 'WEB_UI', ipAddress: req.ip }, () => {
        next.handle().subscribe({
          next: (v) => subscriber.next(v),
          error: (e) => subscriber.error(e),
          complete: () => subscriber.complete(),
        });
        return Promise.resolve();
      });
    });
  }
}
