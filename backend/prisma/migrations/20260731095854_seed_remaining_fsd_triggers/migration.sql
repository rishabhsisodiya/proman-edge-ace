-- Seeds notification templates for all 7 remaining FSD §9 triggers that
-- weren't wired yet as of 2026-07-31 (client request: seed everything now,
-- so when each blocking feature gets built later, the template already
-- exists — the build step is just wiring render()/send() to an existing
-- trigger code, no new migration/seed needed at that point).
--
-- Content/recipients/channels transcribed directly from the FSD's own §9
-- Notification Trigger Specification table. SMS substituted with WHATSAPP
-- throughout, per the already-established project-wide decision (no SMS
-- sender was ever built — see Notification Module section, client decision
-- 2026-07-30). Whether an internal-only recipient trigger (no customer
-- involved) actually fires the WHATSAPP row or substitutes PUSH instead
-- (internal users have no phone/WhatsApp number on file) is a decision for
-- whoever wires each trigger's dispatch code — same precedent as N-17,
-- which has a seeded WHATSAPP row that the actual SlaBreachCron code never
-- calls, sending EMAIL+PUSH instead for its internal recipients.
--
-- ON CONFLICT DO NOTHING — never overwrites a row Admin has since edited.

-- N-11 — Customer PO received (quotation status updated). Recipients:
-- CS Support (role doesn't exist yet) + ASM, App push only per FSD (no
-- SMS/email listed for this one). Blocked on the CS_SUPPORT role existing.
INSERT INTO "NotificationTemplate" ("id", "triggerCode", "triggerName", "channel", "subject", "body", "updatedAt") VALUES
(gen_random_uuid(), 'N-11', 'Customer PO received', 'PUSH', 'PO received — {{quotation_no}}', 'PO received from {{customer_name}} for {{quotation_no}}. Parts can be dispatched.', now())
ON CONFLICT ("triggerCode", "channel") DO NOTHING;

-- N-18/19/20/21 — AMC renewal ladder (30/15/7 days) + lapsed. Blocked on AMC
-- renewal alerts + lapse handling (not built — AmcContract.renewalStatus
-- never transitions past its default Active).
INSERT INTO "NotificationTemplate" ("id", "triggerCode", "triggerName", "channel", "subject", "body", "updatedAt") VALUES
(gen_random_uuid(), 'N-18', 'AMC renewal — 30 days', 'EMAIL', 'AMC Renewal Due in 30 Days — {{contract_ref}}', 'AMC RENEWAL DUE in 30 days: Customer {{customer_name}}, Contract {{contract_ref}}, Value INR {{contract_value}}, Expiry {{end_date}}. Please initiate renewal conversation.', now()),
(gen_random_uuid(), 'N-18', 'AMC renewal — 30 days', 'WHATSAPP', NULL, 'AMC RENEWAL DUE in 30 days: Customer {{customer_name}}, Contract {{contract_ref}}, Expiry {{end_date}}. Please initiate renewal conversation.', now()),

(gen_random_uuid(), 'N-19', 'AMC renewal — 15 days', 'EMAIL', 'AMC Renewal Final Notice (15 Days) — {{contract_ref}}', 'AMC RENEWAL FINAL NOTICE — 15 days: {{customer_name}} contract {{contract_ref}} expires {{end_date}}. Renewal proposal must be with customer now.', now()),
(gen_random_uuid(), 'N-19', 'AMC renewal — 15 days', 'WHATSAPP', NULL, 'AMC RENEWAL FINAL NOTICE — 15 days: {{customer_name}} contract {{contract_ref}} expires {{end_date}}. Renewal proposal must be with customer now.', now()),

(gen_random_uuid(), 'N-20', 'AMC renewal — 7 days', 'EMAIL', 'URGENT — AMC Expires in 7 Days — {{contract_ref}}', 'URGENT: AMC {{contract_ref}} for {{customer_name}} expires in 7 days. Not yet renewed. Escalate immediately.', now()),
(gen_random_uuid(), 'N-20', 'AMC renewal — 7 days', 'WHATSAPP', NULL, 'URGENT: AMC {{contract_ref}} for {{customer_name}} expires in 7 days. Not yet renewed. Escalate immediately.', now()),
(gen_random_uuid(), 'N-20', 'AMC renewal — 7 days', 'PUSH', 'URGENT — AMC expires in 7 days', 'AMC {{contract_ref}} for {{customer_name}} expires in 7 days. Not yet renewed. Escalate immediately.', now()),

(gen_random_uuid(), 'N-21', 'AMC contract lapsed', 'EMAIL', 'AMC Lapsed — {{contract_ref}}', 'AMC LAPSED: {{contract_ref}} for {{customer_name}} has expired without renewal. Contract is now inactive.', now())
ON CONFLICT ("triggerCode", "channel") DO NOTHING;

-- N-22 — Predictive trigger fired (ticket auto-created). Blocked on the
-- Predictive Maintenance engine (3 rule triggers — not built).
INSERT INTO "NotificationTemplate" ("id", "triggerCode", "triggerName", "channel", "subject", "body", "updatedAt") VALUES
(gen_random_uuid(), 'N-22', 'Predictive trigger fired', 'EMAIL', 'Predictive Alert — {{ticket_no}}', 'Predictive alert: {{rule_name}} triggered for {{equipment_serial}} ({{equipment_model}}) at {{customer_name}}. Ticket {{ticket_no}} auto-created.', now()),
(gen_random_uuid(), 'N-22', 'Predictive trigger fired', 'PUSH', 'Predictive alert — {{ticket_no}}', 'Predictive alert: {{rule_name}} triggered for {{equipment_serial}} at {{customer_name}}. Ticket {{ticket_no}} auto-created.', now())
ON CONFLICT ("triggerCode", "channel") DO NOTHING;

-- N-23 — Warranty expiry, 45-day outreach ticket created. Blocked on
-- Warranty's 45-day outreach job (not built).
INSERT INTO "NotificationTemplate" ("id", "triggerCode", "triggerName", "channel", "subject", "body", "updatedAt") VALUES
(gen_random_uuid(), 'N-23', 'Warranty expiry outreach', 'EMAIL', 'Warranty Expiry Outreach — {{ticket_no}}', 'Warranty expiry outreach: {{equipment_serial}} warranty expires {{warranty_end_date}}. No AMC in place. Outreach ticket {{ticket_no}} created — please contact customer for AMC proposal.', now()),
(gen_random_uuid(), 'N-23', 'Warranty expiry outreach', 'PUSH', 'Warranty expiry outreach — {{ticket_no}}', 'Warranty expiry outreach: {{equipment_serial}} expires {{warranty_end_date}}. No AMC in place. Outreach ticket {{ticket_no}} created.', now())
ON CONFLICT ("triggerCode", "channel") DO NOTHING;
