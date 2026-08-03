export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type TicketStatus =
  | "OPEN"
  | "ASSIGNED"
  | "ENGINEER_ASSIGNED"
  | "ACCEPTED"
  | "REACHED_SITE"
  | "WORKING"
  | "PENDING"
  | "ENGINEER_RESOLVED"
  | "ASM_RESOLVED"
  | "CLOSED";

export type PendingReason = "AWAITING_PARTS" | "AWAITING_CUSTOMER" | "AWAITING_APPROVAL" | "OTHER";

export const PENDING_REASON_LABEL: Record<PendingReason, string> = {
  AWAITING_PARTS: "Awaiting Parts",
  AWAITING_CUSTOMER: "Awaiting Customer",
  AWAITING_APPROVAL: "Awaiting Approval",
  OTHER: "Other",
};

export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type Region = "NORTH" | "SOUTH" | "EAST" | "WEST" | "CENTRAL" | "BANGLADESH";

// §5.3 — 8 sources total; bulk_import/api_partner/amc_scheduled/warranty_triggered/
// predictive aren't reachable from the manual New Ticket form (auto-sources only).
export type Source =
  | "CUSTOMER_CALL"
  | "CUSTOMER_WHATSAPP"
  | "CUSTOMER_PORTAL"
  | "CUSTOMER_EMAIL"
  | "AMC_SCHEDULED"
  | "WARRANTY_TRIGGERED"
  | "PREDICTIVE"
  | "INTERNAL"
  | "BULK_IMPORT"
  | "API_PARTNER";
export const SOURCE_LABEL: Record<Source, string> = {
  CUSTOMER_CALL: "Customer Call",
  CUSTOMER_WHATSAPP: "Customer WhatsApp",
  CUSTOMER_PORTAL: "Customer Portal",
  CUSTOMER_EMAIL: "Customer Email",
  AMC_SCHEDULED: "AMC Scheduled",
  WARRANTY_TRIGGERED: "Warranty Triggered",
  PREDICTIVE: "Predictive",
  INTERNAL: "Internal",
  BULK_IMPORT: "Bulk Import",
  API_PARTNER: "Partner API",
};
// Manual-creation sources only (§7.1 — the rest are auto/system sources).
export const MANUAL_SOURCES: Source[] = ["CUSTOMER_CALL", "CUSTOMER_WHATSAPP", "CUSTOMER_PORTAL", "CUSTOMER_EMAIL", "INTERNAL"];

// Manual "Customer Category" dropdown (Ashwath feedback 2026-07-25) — a
// separate, manually-set field alongside the existing auto-calculated
// warranty/AMC chargeability check, not an override of it.
export type CustomerCategory = "WARRANTY" | "NON_WARRANTY" | "AMC";
export const CUSTOMER_CATEGORY_LABEL: Record<CustomerCategory, string> = {
  WARRANTY: "Warranty",
  NON_WARRANTY: "Non-Warranty",
  AMC: "AMC",
};

// Plain string (2026-08-02, Service Types Tier 1) — was a fixed literal
// union of the 8 original enum values. Admin can now add new service types
// at runtime (ServiceTypeConfig, backend), so this can no longer be a
// closed set known at compile time.
export type ServiceType = string;

// Compiled-in fallback (2026-08-02) — same in-place-mutation pattern as
// STATUS_LABEL/PRIORITY_LABEL: loadServiceTypeOverrides() (below) fetches
// the real list from ServiceTypeConfig and rewrites this object/array's
// contents in place once fetched, so every call site here keeps working
// unchanged. This hardcoded version is only what renders before that fetch
// resolves (or if it fails) — matches the original 8 seeded rows.
export const SERVICE_TYPE_LABEL: Record<string, string> = {
  WARRANTY_REPAIR: "Warranty Repair",
  // Client request: drop "(Chargeable)" from the display label — billing
  // behavior is unchanged, this is a display-only rename.
  BREAKDOWN_CHARGEABLE: "Breakdown",
  SCHEDULED_PM: "Scheduled PM",
  TECHNICAL_AUDIT: "Technical Audit",
  RETROFIT_UPGRADE: "Retrofit / Upgrade",
  AMC: "AMC",
  SPARES_SUPPLY_INSTALLATION: "Spares Supply (with installation)",
  // FSD §7.3 rule 15 — nightly warranty-engine outreach ticket, a sales lead
  // auto-created by the system, never manually selectable at creation.
  WARRANTY_RENEWAL_OUTREACH: "Warranty Renewal Outreach",
};

// Client request (Ashwath feedback, 20 Jul 2026): remove AMC from the Service
// Type list. **Reversed 2026-08-01, per Aditi**: AMC is back in the manual
// dropdown — Call Center/ASM/Manager can once again hand-pick "AMC" as a
// service type at ticket creation, same as any other type. No backend
// change needed for this reversal — the original removal (Ashwath,
// 2026-07-20) was always frontend-only, the backend never rejected AMC at
// creation either way.
// WARRANTY_RENEWAL_OUTREACH (2026-07-31) still excluded — auto-created
// only, never a manual choice; that decision is unrelated and unchanged.
// Mutable-contents array (2026-08-02) — same in-place-mutation pattern as
// SERVICE_TYPE_LABEL above, just for an array instead of an object:
// loadServiceTypeOverrides() replaces this array's *contents*
// (`.length = 0; .push(...)`) rather than reassigning the binding — an
// ESM named export's binding can only be reassigned by the module that
// declared it, so this stays `const` and every existing
// `import { SELECTABLE_SERVICE_TYPES }` call site keeps reading the same
// object reference, seeing the mutated contents automatically.
export const SELECTABLE_SERVICE_TYPES: string[] = Object.keys(SERVICE_TYPE_LABEL).filter(
  (t) => t !== "WARRANTY_RENEWAL_OUTREACH",
);

// SLA Target Date (2026-07-30, FSD §14.3 client clarification) — required at
// creation for these 3 service types (always manually created, no auto/cron
// path); one underlying field, per-service-type label only.
export const SLA_TARGET_DATE_LABEL: Partial<Record<ServiceType, string>> = {
  SCHEDULED_PM: "Planned Date",
  TECHNICAL_AUDIT: "Agreed Date",
  RETROFIT_UPGRADE: "Quotation Schedule Date",
};

export interface Customer {
  id: string;
  customerName: string;
  // Nullable: the nightly Customer Sync job flags customers whose ERPNext
  // territory isn't in RegionMapping yet as needsReview, region stays null
  // until an Admin adds the mapping.
  region: Region | null;
}

export interface Equipment {
  id: string;
  serialNo: string;
  itemName: string;
}

export interface EngineerRef {
  id: string;
  fullName: string;
}

export interface CustomerSite {
  id: string;
  siteName: string;
}

export interface Ticket {
  id: string;
  ticketNo: string;
  subject: string;
  status: TicketStatus;
  priority: Priority;
  source: Source;
  serviceType: string;
  customerCategory?: CustomerCategory | null;
  warrantyEligible: boolean;
  slaTargetDate: string | null;
  slaResponseDue: string | null;
  slaResponseMet: boolean;
  slaResolutionDue: string | null;
  slaResolutionMet: boolean;
  slaResponseStatus?: "ON_TRACK" | "WARNING_90" | "BREACHED";
  slaResolutionStatus?: "ON_TRACK" | "WARNING_90" | "BREACHED";
  slaPolicy?: { responseHours: number | null; resolutionHours: number | null } | null;
  pendingReason?: PendingReason | null;
  pendingNotes?: string | null;
  resolutionSummary?: string | null;
  csatSurveySent?: boolean;
  csatScore?: number | null;
  csatResponseText?: string | null;
  rejectionCount?: number;
  rejectionReasons?: { engineerId: string; reason: string; timestamp: string }[];
  reOpenCount?: number;
  reachedSiteGpsLat?: number | null;
  reachedSiteGpsLong?: number | null;
  createdAt: string;
  updatedAt?: string;
  closedAt?: string | null;
  erpnextInvoiceId?: string | null;
  customer: Customer;
  site?: CustomerSite | null;
  equipment: Equipment | null;
  assignedEngineer: EngineerRef | null;
  assignedAsm: EngineerRef | null;
  possibleDuplicateOf?: { id: string; ticketNo: string; status: TicketStatus } | null;
  duplicateFlagResolved?: boolean;
  tags?: string[];
}

// Client-requested display renames (internal enum values unchanged, so
// nothing in the workflow engine/backend needed to change — only the label):
// ASSIGNED -> "In Review", PENDING -> "On Hold".
export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "New",
  ASSIGNED: "In Review",
  ENGINEER_ASSIGNED: "Engineer Assigned",
  ACCEPTED: "Accepted",
  REACHED_SITE: "Reached Site",
  WORKING: "Working",
  PENDING: "Pending",
  ENGINEER_RESOLVED: "Engineer Resolved",
  ASM_RESOLVED: "ASM Resolved",
  CLOSED: "Closed",
};

/**
 * Colors mapped to the official Proman Group Brand Guidelines v1.3 semantic
 * palette (proman-docs/BRAND_GUIDELINES.md §2.3/§6.5) — never Orange (reserved
 * for CTAs/accents only, §6.5). Priority: Critical=Error, High=Warning,
 * Medium/Low=neutral Navy-tint. Status: in-progress stages are neutral,
 * Closed=Success (the only terminal-positive state).
 */
export type SlaClockStatus = "ON_TRACK" | "WARNING_90" | "BREACHED";

export const SLA_STATUS_LABEL: Record<SlaClockStatus, string> = {
  ON_TRACK: "On Track",
  WARNING_90: "SLA At Risk",
  BREACHED: "SLA Breached",
};

export const SLA_STATUS_STYLE: Record<SlaClockStatus, string> = {
  ON_TRACK: "bg-navy-soft text-muted",
  WARNING_90: "bg-brand-amber-bg text-brand-amber",
  BREACHED: "bg-brand-red-bg text-brand-red",
};

/** Worst of the two independent clocks (response/resolution) — for a single badge. */
export function worstSlaStatus(t: Pick<Ticket, "slaResponseStatus" | "slaResolutionStatus">): SlaClockStatus {
  const rank: Record<SlaClockStatus, number> = { ON_TRACK: 0, WARNING_90: 1, BREACHED: 2 };
  const a = t.slaResponseStatus ?? "ON_TRACK";
  const b = t.slaResolutionStatus ?? "ON_TRACK";
  return rank[a] >= rank[b] ? a : b;
}

// Admin-editable display label per priority (2026-08-01, FSD §5.2 "Ticket
// Priorities" — the 4 values themselves stay fixed, only this label is
// configurable, see admin/priority-labels). Mutated in place by
// loadPriorityLabelOverrides() the same way STATUS_LABEL is — every call
// site here reads this same object, no other file needs to change to pick
// up an Admin's edit.
export const PRIORITY_LABEL: Record<Priority, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const PRIORITY_STYLE: Record<Priority, string> = {
  CRITICAL: "bg-brand-red-bg text-brand-red",
  HIGH: "bg-brand-amber-bg text-brand-amber",
  MEDIUM: "bg-navy-tint text-navy",
  LOW: "bg-navy-soft text-muted",
};

export const STATUS_STYLE: Record<TicketStatus, string> = {
  OPEN: "bg-navy-soft text-muted",
  ASSIGNED: "bg-navy-tint text-navy",
  ENGINEER_ASSIGNED: "bg-navy-tint text-navy",
  ACCEPTED: "bg-navy-tint text-navy",
  REACHED_SITE: "bg-navy-tint text-navy",
  WORKING: "bg-brand-amber-bg text-brand-amber",
  PENDING: "bg-brand-amber-bg text-brand-amber",
  ENGINEER_RESOLVED: "bg-navy-tint text-navy",
  ASM_RESOLVED: "bg-navy-tint text-navy",
  CLOSED: "bg-brand-green-bg text-brand-green",
};
