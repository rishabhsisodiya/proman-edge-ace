import { Priority, ServiceType } from '@prisma/client';

/** FSD §14.3 default SLA policy — response/resolution hours, business-hours-only clock. */
export const SLA_POLICY: Record<ServiceType, Partial<Record<Priority, { responseHours: number; resolutionHours: number }>>> = {
  BREAKDOWN_CHARGEABLE: {
    CRITICAL: { responseHours: 4, resolutionHours: 24 },
    HIGH: { responseHours: 8, resolutionHours: 48 },
    MEDIUM: { responseHours: 24, resolutionHours: 72 },
  },
  WARRANTY_REPAIR: {
    HIGH: { responseHours: 8, resolutionHours: 48 },
    MEDIUM: { responseHours: 24, resolutionHours: 72 },
  },
  SCHEDULED_PM: {
    MEDIUM: { responseHours: 8, resolutionHours: 48 },
  },
  TECHNICAL_AUDIT: {
    HIGH: { responseHours: 48, resolutionHours: 168 },
    MEDIUM: { responseHours: 48, resolutionHours: 168 },
  },
  RETROFIT_UPGRADE: {
    MEDIUM: { responseHours: 48, resolutionHours: 336 },
  },
  // FSD §14.3: "AMC-Any: 8h/48h" — added now that AMC exists in the enum
  // (previously missing entirely, same root cause noted in the FSD Analysis doc).
  AMC: {
    MEDIUM: { responseHours: 8, resolutionHours: 48 },
  },
  // Not in the FSD's §14.3 table at all (7th service type added late in review) —
  // placeholder matching Breakdown-Medium until confirmed; flag before go-live.
  SPARES_SUPPLY_INSTALLATION: {
    MEDIUM: { responseHours: 24, resolutionHours: 72 },
  },
};

/** Business hours: 08:00-18:00 IST, Mon-Sat (FSD §14.3). Holiday list: TODO, admin-configurable later. */
export const BUSINESS_HOURS = { start: 8, end: 18, workDays: [1, 2, 3, 4, 5, 6] }; // 0=Sun
