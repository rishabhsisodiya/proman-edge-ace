-- Seed notification templates added after the initial 13-trigger seed
-- (see migration 20260730170000_add_notification_template, which both
-- created the table and seeded the first batch). This migration follows the
-- same "bake the seed data into the migration" convention rather than a
-- separate script, so every environment (dev/staging/prod) gets these rows
-- automatically on `prisma migrate deploy`, with no extra manual step.
--
-- ON CONFLICT DO NOTHING — never overwrites a row Admin has since edited via
-- the Notification Templates admin screen, same guarantee the old seed
-- script's upsert(update: {}) gave.

-- CUST-BLOCKED (2026-07-31) — not one of the FSD's original 23 numbered §9
-- triggers. Added per FSD Customer entity spec ("Inactive/Blacklisted block
-- new ticket creation by default") + FSD-Analysis Q2's resolved override
-- flow: Call Center/ASM's blocked create attempt notifies every Manager,
-- since Manager already has unconditional create rights and can just create
-- it directly.
INSERT INTO "NotificationTemplate" ("id", "triggerCode", "triggerName", "channel", "subject", "body", "updatedAt") VALUES
(gen_random_uuid(), 'CUST-BLOCKED', 'Blocked ticket attempt — Inactive/Blacklisted customer', 'EMAIL', 'Ticket creation blocked — {{customer_name}} ({{account_status}})', '{{attempted_by}} attempted to create a ticket for {{customer_name}}, whose account is {{account_status}}. As a Manager, you can create this ticket directly if appropriate.', now()),
(gen_random_uuid(), 'CUST-BLOCKED', 'Blocked ticket attempt — Inactive/Blacklisted customer', 'PUSH', 'Ticket blocked — {{customer_name}}', '{{attempted_by}} attempted to create a ticket for {{customer_name}} ({{account_status}}). You can create it directly.', now())
ON CONFLICT ("triggerCode", "channel") DO NOTHING;

-- N-14 (FSD §9) — "Ticket closed / Feedback." FSD wording specifies Email +
-- SMS; SMS is dropped project-wide (client decision, 2026-07-30), substituted
-- with WhatsApp — same pattern already used for N-17. Body text matches the
-- FSD's own wording exactly.
INSERT INTO "NotificationTemplate" ("id", "triggerCode", "triggerName", "channel", "subject", "body", "updatedAt") VALUES
(gen_random_uuid(), 'N-14', 'Ticket closed / Feedback', 'EMAIL', 'Service Request {{ticket_no}} Closed — Share Your Feedback', 'Your service request {{ticket_no}} is now closed. How did we do? Rate your experience (1–5): {{survey_link}}. Thank you for choosing Proman.', now()),
(gen_random_uuid(), 'N-14', 'Ticket closed / Feedback', 'WHATSAPP', NULL, 'Your service request {{ticket_no}} is now closed. How did we do? Rate your experience (1–5): {{survey_link}}. Thank you for choosing Proman.', now())
ON CONFLICT ("triggerCode", "channel") DO NOTHING;
