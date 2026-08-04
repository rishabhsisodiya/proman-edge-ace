-- KPI-BREACH (2026-08-04) — not one of the FSD's original 23 numbered §9
-- triggers. FSD §6.2 names 4 specific breach-alert thresholds ("< 85% —
-- alert to Ashwath", "< 3.5 — alert to Ashwath", "< 70% — alert to Ashwath",
-- rolling 7-day MTTR > 60h) but never actually specifies a trigger/template
-- for them — this fills that gap. Per the same client decision already
-- applied to CUST-BLOCKED and the AMC renewal ladder, "Ashwath" means every
-- active Manager (+ Admin), not a literal named recipient.
INSERT INTO "NotificationTemplate" ("id", "triggerCode", "triggerName", "channel", "subject", "body", "updatedAt") VALUES
(gen_random_uuid(), 'KPI-BREACH', 'KPI breached its alert threshold', 'EMAIL', 'KPI Alert — {{kpi_name}} breached', '{{kpi_name}} is currently {{current_value}} against a target of {{target}} — this crosses the breach alert threshold ({{breach_alert}}). Period: {{period_label}}.', now()),
(gen_random_uuid(), 'KPI-BREACH', 'KPI breached its alert threshold', 'PUSH', 'KPI Alert — {{kpi_name}}', '{{kpi_name}} is {{current_value}} (target {{target}}) — breach threshold crossed for {{period_label}}.', now())
ON CONFLICT ("triggerCode", "channel") DO NOTHING;
