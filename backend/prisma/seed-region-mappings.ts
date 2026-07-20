import { PrismaClient, Region } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Confident territory -> Region mappings, derived from the ~33 distinct
 * `tabCustomer.territory` values seen in real ERPNext data (read-only query,
 * 2,024 customers). Used by the nightly Customer Sync job to resolve
 * Customer.region — a territory with no row here leaves that customer
 * flagged needsReview instead of failing the sync.
 *
 * Deliberately excluded (not guessed) — these need a business decision, not
 * a geography lookup:
 *   - "Rajasthan"                (NORTH vs WEST — how does the business group it?)
 *   - "India" / "All Territories" (catch-all, not real geography)
 *   - "Industrial Minerals & MHE" (looks like a business segment stored in
 *                                  the territory field by mistake — ERPNext
 *                                  data-quality issue, flag to Shivam)
 *   - "UAE" / "United Arab Emirates" / "OMAN" / "Spain" / "Rest Of The World"
 *     (international — no matching Region enum value exists; only
 *     BANGLADESH covers non-India, and none of these are Bangladesh)
 * Add these once a decision is made, either here or via the Region Mapping
 * admin screen (/dashboard/admin/region-mapping).
 */
const MAPPINGS: { erpTerritory: string; region: Region }[] = [
  { erpTerritory: 'Karnataka', region: Region.SOUTH },
  { erpTerritory: 'Tamilnadu', region: Region.SOUTH },
  { erpTerritory: 'Tamil Nadu', region: Region.SOUTH },
  { erpTerritory: 'Kerala', region: Region.SOUTH },
  { erpTerritory: 'Telangana', region: Region.SOUTH },
  { erpTerritory: 'Andhra Pradesh', region: Region.SOUTH },
  { erpTerritory: 'Goa and surroundings', region: Region.WEST },
  { erpTerritory: 'Gujarat', region: Region.WEST },
  { erpTerritory: 'Maharashtra', region: Region.WEST },
  { erpTerritory: 'Other Parts of Maharashtra', region: Region.WEST },
  { erpTerritory: 'Nasik and surroundings', region: Region.WEST },
  { erpTerritory: 'North India', region: Region.NORTH },
  { erpTerritory: 'Haryana', region: Region.NORTH },
  { erpTerritory: 'Uttar Pradesh', region: Region.NORTH },
  { erpTerritory: 'Uttarakhand and surroundings', region: Region.NORTH },
  { erpTerritory: 'Madhya Pradesh', region: Region.CENTRAL },
  { erpTerritory: 'Central India', region: Region.CENTRAL },
  { erpTerritory: 'Nagpur and surroundings', region: Region.CENTRAL },
  { erpTerritory: 'East India', region: Region.EAST },
  { erpTerritory: 'West Bengal', region: Region.EAST },
  { erpTerritory: 'ORISSA', region: Region.EAST },
  { erpTerritory: 'JHARKHAND', region: Region.EAST },
  { erpTerritory: 'ASSAM', region: Region.EAST },
];

async function main() {
  for (const m of MAPPINGS) {
    await prisma.regionMapping.upsert({
      where: { erpTerritory: m.erpTerritory },
      create: m,
      update: { region: m.region },
    });
  }
  console.log(`Seeded ${MAPPINGS.length} region mappings.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
