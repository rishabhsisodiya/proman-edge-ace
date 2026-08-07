import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DASHBOARD_KEY } from './dashboard-key.decorator';
import { DashboardAccessService } from '../dashboards/dashboard-access/dashboard-access.service';

/** Replaces the old hardcoded @Roles(...) per dashboard controller (2026-08-07) — access is now Admin-configurable via DashboardAccessRule, checked here instead of a static decorator list. */
@Injectable()
export class DashboardAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly dashboardAccess: DashboardAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const dashboardKey = this.reflector.getAllAndOverride<string>(DASHBOARD_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!dashboardKey) return true;

    const { user } = context.switchToHttp().getRequest();
    // ADMIN is a universal bypass — same rule as RolesGuard, never subject to this table.
    if (user?.role === 'ADMIN') return true;
    if (!user?.role) return false;
    return this.dashboardAccess.isAllowed(user.role, dashboardKey);
  }
}
