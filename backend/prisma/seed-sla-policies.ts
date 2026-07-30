import { PrismaClient, Priority, ServiceType } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * FSD §14.3 "SLA default policies" — the table only defines 9 of the 24
 * possible (serviceType, priority) combinations (Breakdown x3, Warranty x2,
 * and AMC/Scheduled PM/Technical Audit/Retrofit-Upgrade each as a single
 * "Any" row applying to all 4 priorities). Everything else is either:
 *   - a genuine FSD gap (Breakdown/LOW, Warranty/CRITICAL, Warranty/LOW —
 *     no target defined anywhere in the doc), or
 *   - the "Any" rows expanded to all 4 priorities per FSD wording (same
 *     value regardless of priority), confirmed 2026-07-30.
 * Gaps are seeded with null hours (not omitted) so they show up as blank,
 * editable rows in the SLA Policies admin screen rather than being silently
 * absent — ticket creation and updateServiceType() already treat null hours
 * the same as "no policy" (no due date computed), so this is safe.
 * SPARES_SUPPLY_INSTALLATION isn't in the FSD's SLA table at all — left
 * fully blank (all 4 priorities) for the same reason.
 */
const POLICIES: { serviceType: ServiceType; priority: Priority; responseHours: number | null; resolutionHours: number | null }[] = [
  // Breakdown (Chargeable) — FSD-defined for Critical/High/Medium; Low is a gap.
  { serviceType: ServiceType.BREAKDOWN_CHARGEABLE, priority: Priority.CRITICAL, responseHours: 4, resolutionHours: 24 },
  { serviceType: ServiceType.BREAKDOWN_CHARGEABLE, priority: Priority.HIGH, responseHours: 8, resolutionHours: 48 },
  { serviceType: ServiceType.BREAKDOWN_CHARGEABLE, priority: Priority.MEDIUM, responseHours: 24, resolutionHours: 72 },
  { serviceType: ServiceType.BREAKDOWN_CHARGEABLE, priority: Priority.LOW, responseHours: null, resolutionHours: null },

  // Warranty Repair — FSD-defined for High/Medium; Critical and Low are gaps.
  { serviceType: ServiceType.WARRANTY_REPAIR, priority: Priority.CRITICAL, responseHours: null, resolutionHours: null },
  { serviceType: ServiceType.WARRANTY_REPAIR, priority: Priority.HIGH, responseHours: 8, resolutionHours: 48 },
  { serviceType: ServiceType.WARRANTY_REPAIR, priority: Priority.MEDIUM, responseHours: 24, resolutionHours: 72 },
  { serviceType: ServiceType.WARRANTY_REPAIR, priority: Priority.LOW, responseHours: null, resolutionHours: null },

  // AMC — FSD Priority = "Any", same value for all 4 priorities.
  { serviceType: ServiceType.AMC, priority: Priority.CRITICAL, responseHours: 8, resolutionHours: 48 },
  { serviceType: ServiceType.AMC, priority: Priority.HIGH, responseHours: 8, resolutionHours: 48 },
  { serviceType: ServiceType.AMC, priority: Priority.MEDIUM, responseHours: 8, resolutionHours: 48 },
  { serviceType: ServiceType.AMC, priority: Priority.LOW, responseHours: 8, resolutionHours: 48 },

  // Scheduled PM — FSD: no response SLA (pre-planned); resolution is the
  // ticket's own slaTargetDate (Planned Date), not a business-hours offset —
  // responseHours/resolutionHours here are intentionally left null; the
  // resolution due date for these tickets comes from slaTargetDate instead
  // (see SLA Target Date feature), never from this table's resolutionHours.
  { serviceType: ServiceType.SCHEDULED_PM, priority: Priority.CRITICAL, responseHours: null, resolutionHours: null },
  { serviceType: ServiceType.SCHEDULED_PM, priority: Priority.HIGH, responseHours: null, resolutionHours: null },
  { serviceType: ServiceType.SCHEDULED_PM, priority: Priority.MEDIUM, responseHours: null, resolutionHours: null },
  { serviceType: ServiceType.SCHEDULED_PM, priority: Priority.LOW, responseHours: null, resolutionHours: null },

  // Technical Audit — FSD: 48h response; resolution is "per agreed date"
  // (slaTargetDate), so resolutionHours stays null here for the same reason
  // as Scheduled PM above.
  { serviceType: ServiceType.TECHNICAL_AUDIT, priority: Priority.CRITICAL, responseHours: 48, resolutionHours: null },
  { serviceType: ServiceType.TECHNICAL_AUDIT, priority: Priority.HIGH, responseHours: 48, resolutionHours: null },
  { serviceType: ServiceType.TECHNICAL_AUDIT, priority: Priority.MEDIUM, responseHours: 48, resolutionHours: null },
  { serviceType: ServiceType.TECHNICAL_AUDIT, priority: Priority.LOW, responseHours: 48, resolutionHours: null },

  // Retrofit/Upgrade — FSD: 48h response; resolution is "per quotation
  // schedule" (slaTargetDate), resolutionHours null for the same reason.
  { serviceType: ServiceType.RETROFIT_UPGRADE, priority: Priority.CRITICAL, responseHours: 48, resolutionHours: null },
  { serviceType: ServiceType.RETROFIT_UPGRADE, priority: Priority.HIGH, responseHours: 48, resolutionHours: null },
  { serviceType: ServiceType.RETROFIT_UPGRADE, priority: Priority.MEDIUM, responseHours: 48, resolutionHours: null },
  { serviceType: ServiceType.RETROFIT_UPGRADE, priority: Priority.LOW, responseHours: 48, resolutionHours: null },

  // Spares Supply/Installation — not in the FSD's SLA table at all; left
  // fully blank for Admin to define if/when this service type needs SLA
  // tracking.
  { serviceType: ServiceType.SPARES_SUPPLY_INSTALLATION, priority: Priority.CRITICAL, responseHours: null, resolutionHours: null },
  { serviceType: ServiceType.SPARES_SUPPLY_INSTALLATION, priority: Priority.HIGH, responseHours: null, resolutionHours: null },
  { serviceType: ServiceType.SPARES_SUPPLY_INSTALLATION, priority: Priority.MEDIUM, responseHours: null, resolutionHours: null },
  { serviceType: ServiceType.SPARES_SUPPLY_INSTALLATION, priority: Priority.LOW, responseHours: null, resolutionHours: null },
];

async function main() {
  // update: {} — never overwrites a row that already exists. Unlike region
  // mappings, these hours are admin-editable in production; re-running this
  // script (e.g. by accident in a deploy step) must not stomp on values
  // Admin has since customized. Only missing rows get created.
  for (const p of POLICIES) {
    await prisma.slaPolicy.upsert({
      where: { serviceType_priority: { serviceType: p.serviceType, priority: p.priority } },
      create: p,
      update: {},
    });
  }
  console.log(`Seeded ${POLICIES.length} SLA policy rows (existing rows left untouched).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
