import { PrismaService } from '../../prisma/prisma.service';

/** TCKT-YYYY-NNNNN, sequential per year (FSD §5.3). */
export async function nextTicketNo(prisma: PrismaService): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TCKT-${year}-`;
  const count = await prisma.ticket.count({ where: { ticketNo: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(6, '0')}`;
}
