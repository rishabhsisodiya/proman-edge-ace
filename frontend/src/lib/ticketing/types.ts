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

// §2.2 — 5 of 7 FSD service types exist in the schema today (AMC and Spares
// Supply are enum-only, not yet exercised by ticket creation validation).
export type ServiceType =
  | "WARRANTY_REPAIR"
  | "BREAKDOWN_CHARGEABLE"
  | "SCHEDULED_PM"
  | "TECHNICAL_AUDIT"
  | "RETROFIT_UPGRADE"
  | "AMC"
  | "SPARES_SUPPLY_INSTALLATION";
export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  WARRANTY_REPAIR: "Warranty Repair",
  // Client request: drop "(Chargeable)" from the display label — billing
  // behavior is unchanged, this is a display-only rename.
  BREAKDOWN_CHARGEABLE: "Breakdown",
  SCHEDULED_PM: "Scheduled PM",
  TECHNICAL_AUDIT: "Technical Audit",
  RETROFIT_UPGRADE: "Retrofit / Upgrade",
  AMC: "AMC",
  SPARES_SUPPLY_INSTALLATION: "Spares Supply (with installation)",
};

// Client request (Ashwath feedback, 20 Jul 2026): remove AMC from the Service
// Type list. AMC stays in the ServiceType enum/SERVICE_TYPE_LABEL above so an
// existing AMC-tagged ticket (TCKT-2026-000001) still displays correctly —
// this list only controls what's *selectable* going forward.
export const SELECTABLE_SERVICE_TYPES = (Object.keys(SERVICE_TYPE_LABEL) as ServiceType[]).filter(
  (t) => t !== "AMC",
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
  rejectionCount?: number;
  reOpenCount?: number;
  reachedSiteGpsLat?: number | null;
  reachedSiteGpsLong?: number | null;
  createdAt: string;
  customer: Customer;
  site?: CustomerSite | null;
  equipment: Equipment | null;
  assignedEngineer: EngineerRef | null;
  assignedAsm: EngineerRef | null;
  possibleDuplicateOf?: { id: string; ticketNo: string; status: TicketStatus } | null;
  duplicateFlagResolved?: boolean;
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
