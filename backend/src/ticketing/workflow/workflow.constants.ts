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
  // ENGINEER_RESOLVED reached via TicketsService.engineerResolve() (2026-08-01)
  // — a separate action from FSV submission, gated on at least one SUBMITTED
  // FSV existing for the ticket first (FSV itself stays mandatory).
  WORKING: { next: ['PENDING', 'ENGINEER_RESOLVED'], allowedRoles: ['ENGINEER'] },
  PENDING: { next: ['WORKING'], allowedRoles: ['ENGINEER'] }, // resume once awaited item clears; SLA clock keeps running (§14.1 rule 21)
  // ENGINEER_ASSIGNED = ASM reject-after-resolved path (2026-07-27) — same
  // or a different engineer re-does the work, must Accept again either way.
  ENGINEER_RESOLVED: { next: ['ASM_RESOLVED', 'ENGINEER_ASSIGNED'], allowedRoles: ['ASM', 'MANAGER'] },
  ASM_RESOLVED: { next: ['CLOSED'], allowedRoles: ['CALL_CENTER', 'MANAGER'] },
  // FSD §14.1 rule 20: "a Closed/Feedback ticket can be re-opened to Open
  // state by Admin only." Was previously ASM_RESOLVED (a TCB default that
  // deviated from spec) — fixed 2026-07-28, see TicketsService.reopen().
  CLOSED: { next: ['OPEN'], allowedRoles: ['ADMIN'] },
};

export const REJECTION_ESCALATION = {
  FIRST: 'REASSIGN_TO_ASM',
  SECOND: 'NOTIFY_MANAGER',
  THIRD: 'REQUIRE_MANAGER_ACK',
} as const;
