-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "triggerCode" TEXT NOT NULL,
    "triggerName" TEXT NOT NULL,
    "channel" "NotifChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_triggerCode_channel_key" ON "NotificationTemplate"("triggerCode", "channel");

-- Seed the 13 currently-wireable FSD §9 triggers (2026-07-30). Content
-- matches the FSD's own wording, merge fields standardized to {{field}}
-- syntax per §5.2. SMS triggers substituted with WhatsApp/Email per client
-- decision (no SMS sender built). Admin edits these via the Notification
-- Templates admin screen — this is just the starting seed.
INSERT INTO "NotificationTemplate" ("id", "triggerCode", "triggerName", "channel", "subject", "body", "updatedAt") VALUES
(gen_random_uuid(), 'N-01', 'Ticket created', 'EMAIL', 'Service Request {{ticket_no}} Registered', 'Your service request {{ticket_no}} has been registered for {{equipment_model}} at {{site_name}}. Our team will contact you shortly.', now()),
(gen_random_uuid(), 'N-01', 'Ticket created', 'WHATSAPP', NULL, 'Your service request {{ticket_no}} has been registered for {{equipment_model}} at {{site_name}}. Our team will contact you shortly.', now()),

(gen_random_uuid(), 'N-02', 'Ticket assigned to ASM', 'EMAIL', 'New Ticket Assigned — {{ticket_no}}', 'New ticket {{ticket_no}} assigned to your territory. Service type: {{service_type}}. Priority: {{priority}}. Equipment: {{equipment_model}}, {{customer_name}}.', now()),
(gen_random_uuid(), 'N-02', 'Ticket assigned to ASM', 'PUSH', 'New ticket {{ticket_no}}', 'New ticket {{ticket_no}} assigned to your territory. Service type: {{service_type}}. Priority: {{priority}}.', now()),

(gen_random_uuid(), 'N-03', 'Engineer assigned (by ASM)', 'PUSH', 'New job: {{ticket_no}}', 'New job assigned: {{ticket_no}}. Customer: {{customer_name}}. Site: {{site_name}}. Equipment: {{equipment_model}}. Priority: {{priority}}. Please Accept or Reject in the app.', now()),
(gen_random_uuid(), 'N-03', 'Engineer assigned (by ASM)', 'WHATSAPP', NULL, 'New job assigned: {{ticket_no}}. Customer: {{customer_name}}. Site: {{site_name}}. Please Accept or Reject in the app.', now()),

(gen_random_uuid(), 'N-04', 'Engineer accepts ticket', 'EMAIL', 'Engineer Confirmed — {{ticket_no}}', 'Your service engineer {{engineer_name}} has been confirmed and will visit {{site_name}} on {{visit_date}}.', now()),
(gen_random_uuid(), 'N-04', 'Engineer accepts ticket', 'WHATSAPP', NULL, 'Your service engineer {{engineer_name}} has been confirmed and will visit {{site_name}} on {{visit_date}}.', now()),
(gen_random_uuid(), 'N-04', 'Engineer accepts ticket', 'PUSH', '{{ticket_no}} accepted', '{{engineer_name}} accepted {{ticket_no}}.', now()),

(gen_random_uuid(), 'N-05', 'Engineer rejects ticket (1st)', 'PUSH', '{{ticket_no}} declined', '{{engineer_name}} has declined {{ticket_no}}. Reason: {{rejection_reason}}. Please reassign.', now()),
(gen_random_uuid(), 'N-05', 'Engineer rejects ticket (1st)', 'EMAIL', '{{ticket_no}} Declined by Engineer', '{{engineer_name}} has declined {{ticket_no}}. Reason: {{rejection_reason}}. Please reassign.', now()),

(gen_random_uuid(), 'N-06', 'Engineer rejects ticket (2nd)', 'PUSH', '{{ticket_no}} rejected (2nd)', '{{ticket_no}} rejected for 2nd time. Reason: {{rejection_reason}}. Manager has been notified. Please reassign urgently.', now()),
(gen_random_uuid(), 'N-06', 'Engineer rejects ticket (2nd)', 'EMAIL', '{{ticket_no}} — 2nd Rejection, Manager Notified', '{{ticket_no}} rejected for 2nd time. Reason: {{rejection_reason}}. Manager has been notified. Please reassign urgently.', now()),

(gen_random_uuid(), 'N-07', 'Engineer rejects ticket (3rd)', 'PUSH', 'ESCALATION: {{ticket_no}}', 'ESCALATION: {{ticket_no}} rejected 3 times. Manager acknowledgement required before reassignment.', now()),
(gen_random_uuid(), 'N-07', 'Engineer rejects ticket (3rd)', 'EMAIL', 'ESCALATION: {{ticket_no}} Rejected 3 Times', 'ESCALATION: {{ticket_no}} rejected 3 times. Manager acknowledgement required before reassignment.', now()),

(gen_random_uuid(), 'N-08', 'Engineer marks Reached Site', 'WHATSAPP', NULL, 'Your Proman engineer {{engineer_name}} has arrived at {{site_name}} for service request {{ticket_no}}.', now()),
(gen_random_uuid(), 'N-08', 'Engineer marks Reached Site', 'PUSH', 'Engineer arrived — {{ticket_no}}', '{{engineer_name}} has arrived at {{site_name}} for {{ticket_no}}.', now()),

(gen_random_uuid(), 'N-09', 'Ticket enters Pending', 'WHATSAPP', NULL, 'Your service request {{ticket_no}} is temporarily on hold: {{pending_reason}}. We will update you once resolved.', now()),
(gen_random_uuid(), 'N-09', 'Ticket enters Pending', 'PUSH', '{{ticket_no}} on hold', 'Ticket {{ticket_no}} blocked: {{pending_reason}}.', now()),

(gen_random_uuid(), 'N-10', 'Quotation sent to customer', 'EMAIL', 'Quotation {{quotation_no}} Ready — {{ticket_no}}', 'Your Proman service quotation {{quotation_no}} for {{ticket_no}} is ready. Value: INR {{grand_total}}. Valid until {{valid_until}}. Please review and confirm.', now()),
(gen_random_uuid(), 'N-10', 'Quotation sent to customer', 'WHATSAPP', NULL, 'Your Proman service quotation {{quotation_no}} for {{ticket_no}} is ready. Value: INR {{grand_total}}. Valid until {{valid_until}}.', now()),

(gen_random_uuid(), 'N-12', 'Delivery confirmed', 'PUSH', 'Parts delivered — {{ticket_no}}', 'Parts for ticket {{ticket_no}} have been delivered to {{site_name}}. You may resume the visit.', now()),
(gen_random_uuid(), 'N-12', 'Delivery confirmed', 'WHATSAPP', NULL, 'Parts for your request {{ticket_no}} have been delivered to your site.', now()),

(gen_random_uuid(), 'N-13', 'FSV submitted (work complete)', 'EMAIL', 'Service Complete — {{ticket_no}}', 'Work on your service request {{ticket_no}} has been completed by {{engineer_name}}. Service report attached.', now()),
(gen_random_uuid(), 'N-13', 'FSV submitted (work complete)', 'WHATSAPP', NULL, 'Work on your service request {{ticket_no}} has been completed by {{engineer_name}}.', now()),
(gen_random_uuid(), 'N-13', 'FSV submitted (work complete)', 'PUSH', 'FSV submitted — {{ticket_no}}', 'Field Service Visit submitted for {{ticket_no}} by {{engineer_name}}.', now()),

(gen_random_uuid(), 'N-15', 'SLA response breach', 'EMAIL', 'SLA BREACH — RESPONSE: {{ticket_no}}', 'SLA BREACH — RESPONSE: Ticket {{ticket_no}} ({{priority}}) has not been assigned. Response SLA was {{sla_response_due}}. Immediate action required.', now()),
(gen_random_uuid(), 'N-15', 'SLA response breach', 'PUSH', 'SLA BREACH: {{ticket_no}}', 'Ticket {{ticket_no}} ({{priority}}) has not been assigned. Response SLA was {{sla_response_due}}.', now()),

(gen_random_uuid(), 'N-16', 'SLA resolution 90% warning', 'PUSH', 'SLA WARNING: {{ticket_no}}', 'SLA WARNING: Ticket {{ticket_no}} must be resolved soon to meet SLA. Current status: {{status}}.', now()),
(gen_random_uuid(), 'N-16', 'SLA resolution 90% warning', 'EMAIL', 'SLA WARNING: {{ticket_no}}', 'SLA WARNING: Ticket {{ticket_no}} must be resolved soon to meet SLA. Current status: {{status}}.', now()),

(gen_random_uuid(), 'N-17', 'SLA resolution breach', 'EMAIL', 'SLA BREACH — RESOLUTION: {{ticket_no}}', 'SLA BREACH — RESOLUTION: Ticket {{ticket_no}} has breached its resolution SLA. Status: {{status}}. SLA was: {{sla_resolution_due}}.', now()),
(gen_random_uuid(), 'N-17', 'SLA resolution breach', 'WHATSAPP', NULL, 'SLA BREACH — RESOLUTION: Ticket {{ticket_no}} has breached its resolution SLA. Status: {{status}}.', now());

