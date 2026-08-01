-- CreateTable
CREATE TABLE "PriorityLabel" (
    "priority" "Priority" NOT NULL,
    "label" TEXT NOT NULL,
    "definition" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriorityLabel_pkey" PRIMARY KEY ("priority")
);

-- Seeds today's display text (raw enum values were shown as-is before this
-- table existed) plus a sensible starting definition Admin can edit.
-- ON CONFLICT DO NOTHING — never overwrites a row Admin has since edited.
INSERT INTO "PriorityLabel" ("priority", "label", "definition", "updatedAt") VALUES
('CRITICAL', 'Critical', 'Service-affecting, immediate response required.', now()),
('HIGH', 'High', 'Significant impact, respond same day.', now()),
('MEDIUM', 'Medium', 'Standard priority, respond within normal SLA.', now()),
('LOW', 'Low', 'Minor or non-urgent, schedule as convenient.', now())
ON CONFLICT ("priority") DO NOTHING;
