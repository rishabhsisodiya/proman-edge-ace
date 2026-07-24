import { PrismaService } from '../../prisma/prisma.service';

/**
 * ACE{FYFY}:NNNNN — fiscal-year based (Ashwath feedback, 20 Jul 2026):
 * "ACE2627:00001", resetting to a new series every 1 April. FY26-27 runs
 * 1 Apr 2026 - 31 Mar 2027, encoded as "2627"; the following year becomes
 * "2728" automatically since the prefix (and therefore the count query) changes
 * — no separate reset job needed, the numbering just starts back at 1 for
 * whatever's the first ticket under the new prefix.
 */
function fiscalYearCode(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed — April = 3
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}${String(endYear).slice(-2)}`;
}

export async function nextTicketNo(prisma: PrismaService): Promise<string> {
  const prefix = `ACE${fiscalYearCode(new Date())}:`;
  const count = await prisma.ticket.count({ where: { ticketNo: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(5, '0')}`;
}
