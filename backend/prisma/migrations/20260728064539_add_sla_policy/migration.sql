-- CreateTable
CREATE TABLE "SlaPolicy" (
    "id" TEXT NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "priority" "Priority" NOT NULL,
    "responseHours" INTEGER NOT NULL,
    "resolutionHours" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SlaPolicy_serviceType_priority_key" ON "SlaPolicy"("serviceType", "priority");

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_slaPolicyId_fkey" FOREIGN KEY ("slaPolicyId") REFERENCES "SlaPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill from the previously hardcoded SLA_POLICY constant
-- (sla-policy.constants.ts) so nothing changes for existing tickets on cutover.
INSERT INTO "SlaPolicy" ("id", "serviceType", "priority", "responseHours", "resolutionHours", "createdAt", "updatedAt") VALUES
  (gen_random_uuid(), 'BREAKDOWN_CHARGEABLE', 'CRITICAL', 4, 24, now(), now()),
  (gen_random_uuid(), 'BREAKDOWN_CHARGEABLE', 'HIGH', 8, 48, now(), now()),
  (gen_random_uuid(), 'BREAKDOWN_CHARGEABLE', 'MEDIUM', 24, 72, now(), now()),
  (gen_random_uuid(), 'WARRANTY_REPAIR', 'HIGH', 8, 48, now(), now()),
  (gen_random_uuid(), 'WARRANTY_REPAIR', 'MEDIUM', 24, 72, now(), now()),
  (gen_random_uuid(), 'SCHEDULED_PM', 'MEDIUM', 8, 48, now(), now()),
  (gen_random_uuid(), 'TECHNICAL_AUDIT', 'HIGH', 48, 168, now(), now()),
  (gen_random_uuid(), 'TECHNICAL_AUDIT', 'MEDIUM', 48, 168, now(), now()),
  (gen_random_uuid(), 'RETROFIT_UPGRADE', 'MEDIUM', 48, 336, now(), now()),
  (gen_random_uuid(), 'AMC', 'MEDIUM', 8, 48, now(), now()),
  (gen_random_uuid(), 'SPARES_SUPPLY_INSTALLATION', 'MEDIUM', 24, 72, now(), now());

-- Point existing tickets at their matching seeded policy row, best-effort —
-- purely cosmetic/traceability, doesn't touch already-set due dates.
UPDATE "Ticket" t
SET "slaPolicyId" = sp."id"
FROM "SlaPolicy" sp
WHERE t."serviceType" = sp."serviceType" AND t."priority" = sp."priority" AND t."slaPolicyId" IS NULL;
