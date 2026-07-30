/**
 * Response/resolution hours per (serviceType, priority) moved to the
 * admin-configurable `SlaPolicy` DB model (2026-07-28) — see
 * `../sla-policy/sla-policy.service.ts`. Business-hours-clock config stays
 * here since it isn't part of that CRUD yet (holiday-list exclusion is a
 * separate, still-open TODO).
 */

/** Business hours: 08:00-18:00 IST, Mon-Sat (FSD §14.3). Holiday list: TODO, admin-configurable later. */
export const BUSINESS_HOURS = { start: 8, end: 18, workDays: [1, 2, 3, 4, 5, 6] }; // 0=Sun

import { ServiceType } from '@prisma/client';

/**
 * SLA Target Date (2026-07-30, FSD §14.3 client clarification) — these 3
 * service types are always manually created (no auto/cron path) and need a
 * client-facing calendar date/time captured at creation: Scheduled PM =
 * "Planned Date", Technical Audit = "Agreed Date", Retrofit/Upgrade =
 * "Quotation Schedule Date". One underlying Ticket.slaTargetDate column,
 * label varies by service type only. slaResolutionDue for these types =
 * exactly this value, never a business-hours computation, and never
 * recomputed by pause/resume or reopen (client confirmed the fixed date
 * never moves regardless of paused duration).
 */
export const SLA_TARGET_DATE_SERVICE_TYPES: ServiceType[] = ['SCHEDULED_PM', 'TECHNICAL_AUDIT', 'RETROFIT_UPGRADE'];
export const SLA_TARGET_DATE_LABEL: Partial<Record<ServiceType, string>> = {
  SCHEDULED_PM: 'Planned Date',
  TECHNICAL_AUDIT: 'Agreed Date',
  RETROFIT_UPGRADE: 'Quotation Schedule Date',
};
