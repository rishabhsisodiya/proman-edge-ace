-- Service Types Tier 1 (2026-08-02, client-agreed scope) — Ticket.serviceType
-- moves from the `ServiceType` Postgres enum to a plain TEXT column, and a
-- new ServiceTypeConfig table lets Admin add new service types without a
-- schema change. The `ServiceType` enum itself is kept (SlaPolicy still
-- keys on it, unchanged in this pass).
--
-- Hand-written rather than Prisma-generated: `prisma migrate dev` flagged
-- this column would be "dropped and recreated" (data loss) by its default
-- diff — existing tickets' serviceType values must survive, so this uses an
-- explicit USING cast instead.

-- CreateTable
CREATE TABLE "ServiceTypeConfig" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isSystemManaged" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceTypeConfig_pkey" PRIMARY KEY ("code")
);

-- Seed the 8 existing enum values as rows — labels transcribed from the
-- frontend's own SERVICE_TYPE_LABEL map so display text doesn't change.
-- ON CONFLICT DO NOTHING — never overwrites a row Admin has since edited.
INSERT INTO "ServiceTypeConfig" ("code", "label", "isSystemManaged", "isActive", "updatedAt") VALUES
('WARRANTY_REPAIR', 'Warranty Repair', false, true, now()),
('BREAKDOWN_CHARGEABLE', 'Breakdown', false, true, now()),
('SCHEDULED_PM', 'Scheduled PM', false, true, now()),
('TECHNICAL_AUDIT', 'Technical Audit', false, true, now()),
('RETROFIT_UPGRADE', 'Retrofit / Upgrade', false, true, now()),
('AMC', 'AMC', true, true, now()),
('SPARES_SUPPLY_INSTALLATION', 'Spares Supply (with installation)', false, true, now()),
('WARRANTY_RENEWAL_OUTREACH', 'Warranty Renewal Outreach', true, true, now())
ON CONFLICT ("code") DO NOTHING;

-- AlterTable: Ticket.serviceType enum -> text. Explicit USING cast preserves
-- every existing ticket's value (545+ tickets in the seeded dataset) instead
-- of dropping/recreating the column.
ALTER TABLE "Ticket" ALTER COLUMN "serviceType" TYPE TEXT USING "serviceType"::TEXT;
