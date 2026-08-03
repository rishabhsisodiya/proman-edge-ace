-- Generic field-level audit trail (2026-08-03, client-agreed scope) —
-- replaces ticket-only "TicketAuditLog" with a polymorphic "AuditLog"
-- shared across Ticket/FSV/AMC/Quotation/User. Historical Ticket audit
-- rows are copied over (entityType='TICKET') before the old table is
-- dropped, so nothing is lost.

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedByUserId" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeSource" "ChangeSource" NOT NULL,
    "ipAddress" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- Copy historical Ticket audit rows into the new table.
INSERT INTO "AuditLog" ("id", "entityType", "entityId", "fieldName", "oldValue", "newValue", "changedByUserId", "changedAt", "changeSource", "ipAddress")
SELECT "id", 'TICKET', "ticketId", "fieldName", "oldValue", "newValue", "changedByUserId", "changedAt", "changeSource", "ipAddress"
FROM "TicketAuditLog";

-- DropForeignKey (the FK from TicketAuditLog to Ticket)
ALTER TABLE "TicketAuditLog" DROP CONSTRAINT IF EXISTS "TicketAuditLog_ticketId_fkey";

-- DropTable
DROP TABLE "TicketAuditLog";
