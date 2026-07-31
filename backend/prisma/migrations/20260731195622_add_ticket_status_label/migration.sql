-- CreateTable
CREATE TABLE "TicketStatusLabel" (
    "status" "TicketStatus" NOT NULL,
    "label" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketStatusLabel_pkey" PRIMARY KEY ("status")
);

-- Seeds today's exact display labels (frontend's STATUS_LABEL constant,
-- types.ts) so this table starts identical to what's on screen already.
-- ON CONFLICT DO NOTHING — never overwrites a row Admin has since edited.
INSERT INTO "TicketStatusLabel" ("status", "label", "updatedAt") VALUES
('OPEN', 'New', now()),
('ASSIGNED', 'In Review', now()),
('ENGINEER_ASSIGNED', 'Engineer Assigned', now()),
('ACCEPTED', 'Accepted', now()),
('REACHED_SITE', 'Reached Site', now()),
('WORKING', 'Working', now()),
('PENDING', 'Pending', now()),
('ENGINEER_RESOLVED', 'Engineer Resolved', now()),
('ASM_RESOLVED', 'ASM Resolved', now()),
('CLOSED', 'Closed', now())
ON CONFLICT ("status") DO NOTHING;
