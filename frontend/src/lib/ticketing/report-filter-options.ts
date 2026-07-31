import { ReportFilters } from "./reports";

export const REGIONS = ["NORTH", "SOUTH", "EAST", "WEST", "CENTRAL", "BANGLADESH"];
export const PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
export const RENEWAL_STATUSES = ["ACTIVE", "RENEWAL_DUE", "FINAL_NOTICE", "LAPSED", "RENEWED"];
export const RULE_TYPES = ["Time Since Last Service", "Operating Hours Interval", "Breakdown Frequency"];

export const FIELD_LABEL: Record<keyof ReportFilters, string> = {
  dateFrom: "From Date",
  dateTo: "To Date",
  region: "Region",
  serviceType: "Service Type",
  priority: "Priority",
  asmId: "ASM (User ID)",
  engineerId: "Engineer (User ID)",
  customerId: "Customer (ID)",
  equipmentCategory: "Equipment Category",
  renewalStatus: "Renewal Status",
  ruleType: "Rule Type",
  month: "Month",
};
