import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Incremental notification-template seeds added after the initial 13-trigger
 * seed (see migration 20260730170000_add_notification_template). Kept as a
 * separate, re-runnable script rather than a new migration since this is
 * pure data, not a schema change — same reasoning as seed-sla-policies.ts.
 * upsert's update: {} never overwrites a row Admin has since edited via the
 * Notification Templates admin screen.
 */
const TEMPLATES: { triggerCode: string; triggerName: string; channel: 'EMAIL' | 'PUSH'; subject: string | null; body: string }[] = [
  // Not one of the FSD's original 23 numbered §9 triggers — added 2026-07-31
  // per FSD Customer entity spec ("Inactive/Blacklisted block new ticket
  // creation by default") + FSD-Analysis Q2's resolved override flow: Call
  // Center/ASM's blocked create attempt notifies every Manager, since Manager
  // already has unconditional create rights and can just create it directly.
  {
    triggerCode: 'CUST-BLOCKED',
    triggerName: 'Blocked ticket attempt — Inactive/Blacklisted customer',
    channel: 'EMAIL',
    subject: 'Ticket creation blocked — {{customer_name}} ({{account_status}})',
    body: '{{attempted_by}} attempted to create a ticket for {{customer_name}}, whose account is {{account_status}}. As a Manager, you can create this ticket directly if appropriate.',
  },
  {
    triggerCode: 'CUST-BLOCKED',
    triggerName: 'Blocked ticket attempt — Inactive/Blacklisted customer',
    channel: 'PUSH',
    subject: 'Ticket blocked — {{customer_name}}',
    body: '{{attempted_by}} attempted to create a ticket for {{customer_name}} ({{account_status}}). You can create it directly.',
  },
];

async function main() {
  for (const t of TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { triggerCode_channel: { triggerCode: t.triggerCode, channel: t.channel } },
      create: t,
      update: {},
    });
  }
  console.log(`Seeded ${TEMPLATES.length} notification template row(s) (existing rows left untouched).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
