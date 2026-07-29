/**
 * Response/resolution hours per (serviceType, priority) moved to the
 * admin-configurable `SlaPolicy` DB model (2026-07-28) — see
 * `../sla-policy/sla-policy.service.ts`. Business-hours-clock config stays
 * here since it isn't part of that CRUD yet (holiday-list exclusion is a
 * separate, still-open TODO).
 */

/** Business hours: 08:00-18:00 IST, Mon-Sat (FSD §14.3). Holiday list: TODO, admin-configurable later. */
export const BUSINESS_HOURS = { start: 8, end: 18, workDays: [1, 2, 3, 4, 5, 6] }; // 0=Sun
