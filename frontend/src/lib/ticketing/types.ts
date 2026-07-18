export type TicketStatus =
  | "OPEN"
  | "ASSIGNED"
  | "ENGINEER_ASSIGNED"
  | "ACCEPTED"
  | "REACHED_SITE"
  | "WORKING"
  | "ENGINEER_RESOLVED"
  | "ASM_RESOLVED"
  | "CLOSED";

export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type Region = "NORTH" | "SOUTH" | "EAST" | "WEST" | "CENTRAL" | "BANGLADESH";

export interface Customer {
  id: string;
  customerName: string;
  region: Region;
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
  serviceType: string;
  warrantyEligible: boolean;
  slaResolutionDue: string | null;
  slaResolutionMet: boolean;
  createdAt: string;
  customer: Customer;
  site?: CustomerSite | null;
  equipment: Equipment | null;
  assignedEngineer: EngineerRef | null;
  assignedAsm: EngineerRef | null;
}

export const STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Open",
  ASSIGNED: "Assigned",
  ENGINEER_ASSIGNED: "Engineer Assigned",
  ACCEPTED: "Accepted",
  REACHED_SITE: "Reached Site",
  WORKING: "Working",
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
  ENGINEER_RESOLVED: "bg-navy-tint text-navy",
  ASM_RESOLVED: "bg-navy-tint text-navy",
  CLOSED: "bg-brand-green-bg text-brand-green",
};
