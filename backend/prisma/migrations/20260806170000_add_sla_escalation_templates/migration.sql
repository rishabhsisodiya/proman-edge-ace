-- Seed missing NotificationTemplate rows for the SLA escalation ladder
-- (SLA-ESCALATION-L2 / SLA-ESCALATION-L3, added 2026-08-06 alongside the
-- escalation cron logic itself). Without these, SlaBreachCron's fireEscalationLevel()
-- correctly detects and advances the escalation level, but sendOne() silently
-- no-ops when render() returns null for a trigger code with no template row —
-- so notifications were never actually sent for any ticket, despite the
-- escalation state being tracked correctly. Content follows the same style
-- as N-15/N-17 (the Level 1 breach notifications), generalized to cover
-- either clock via {{clock_type}} since Level 2/3 apply to both Response
-- and Resolution escalation. Admin can edit these via the Notification
-- Templates admin screen once seeded, same as every other template.
INSERT INTO "NotificationTemplate" ("id", "triggerCode", "triggerName", "channel", "subject", "body", "updatedAt") VALUES
(gen_random_uuid(), 'SLA-ESCALATION-L2', 'SLA Escalation Level 2', 'EMAIL', 'SLA ESCALATION — LEVEL 2: {{ticket_no}}', 'SLA ESCALATION — LEVEL 2: Ticket {{ticket_no}} is still breached on its {{clock_type}} SLA and has now escalated to Level 2. Immediate action required.', now()),
(gen_random_uuid(), 'SLA-ESCALATION-L2', 'SLA Escalation Level 2', 'PUSH', 'SLA Escalation L2: {{ticket_no}}', 'Ticket {{ticket_no}} — {{clock_type}} SLA breach escalated to Level 2.', now()),

(gen_random_uuid(), 'SLA-ESCALATION-L3', 'SLA Escalation Level 3', 'EMAIL', 'SLA ESCALATION — LEVEL 3 (FINAL): {{ticket_no}}', 'SLA ESCALATION — LEVEL 3: Ticket {{ticket_no}} is still breached on its {{clock_type}} SLA and has now escalated to Level 3, the final tier. Immediate action required.', now()),
(gen_random_uuid(), 'SLA-ESCALATION-L3', 'SLA Escalation Level 3', 'PUSH', 'SLA Escalation L3: {{ticket_no}}', 'Ticket {{ticket_no}} — {{clock_type}} SLA breach escalated to Level 3 (final).', now());
