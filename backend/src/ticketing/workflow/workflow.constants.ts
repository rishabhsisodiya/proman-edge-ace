import { TicketStatus, Role } from '@prisma/client';

/**
 * The 10-state golden-path machine per FSD §5.4. Reconciled with Decision Q7:
 * this stays hardcoded for now (Workflow Designer is Phase 2, Build Plan) —
 * only the missing PENDING state and the CLOSED reopen transition were added
 * here to match the full FSD, not a configurable engine yet.
 */
export const TICKET_TRANSITIONS: Record<TicketStatus, { next: TicketStatus[]; allowedRoles: Role[] }> = {
  OPEN: { next: ['ASSIGNED'], allowedRoles: ['CALL_CENTER', 'ASM', 'MANAGER'] },
  ASSIGNED: { next: ['ENGINEER_ASSIGNED'], allowedRoles: ['ASM', 'MANAGER'] },
  ENGINEER_ASSIGNED: { next: ['ACCEPTED', 'ASSIGNED'], allowedRoles: ['ENGINEER'] }, // ASSIGNED = rejection path
  ACCEPTED: { next: ['REACHED_SITE'], allowedRoles: ['ENGINEER'] },
  REACHED_SITE: { next: ['WORKING'], allowedRoles: ['ENGINEER'] },
  WORKING: { next: ['PENDING', 'ENGINEER_RESOLVED'], allowedRoles: ['ENGINEER'] }, // ENGINEER_RESOLVED via FSV submit only
  PENDING: { next: ['WORKING'], allowedRoles: ['ENGINEER'] }, // resume once awaited item clears; SLA clock keeps running (§14.1 rule 21)
  ENGINEER_RESOLVED: { next: ['ASM_RESOLVED'], allowedRoles: ['ASM', 'MANAGER'] },
  ASM_RESOLVED: { next: ['CLOSED'], allowedRoles: ['CALL_CENTER', 'MANAGER'] },
  // Reopen target (ASM_RESOLVED) is a TCB default, not FSD-specified — the doc
  // only says "re-openable by Admin only," not which state it returns to.
  CLOSED: { next: ['ASM_RESOLVED'], allowedRoles: ['ADMIN'] },
};

export const REJECTION_ESCALATION = {
  FIRST: 'REASSIGN_TO_ASM',
  SECOND: 'NOTIFY_MANAGER',
  THIRD: 'REQUIRE_MANAGER_ACK',
} as const;
