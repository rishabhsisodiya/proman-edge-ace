import { apiFetch, apiFetchBlob } from "@/lib/api";

export type ReportKey =
  | "open-tickets-by-status"
  | "sla-compliance"
  | "mttr-report"
  | "service-revenue-report"
  | "equipment-breakdown-frequency"
  | "spares-demand-signal"
  | "amc-portfolio-report"
  | "predictive-maintenance-alerts-log"
  | "engineer-performance-report"
  | "amc-renewal-alert-summary"
  | "warranty-cost-tracker";

export interface ReportListItem {
  key: ReportKey;
  title: string;
  description: string;
  pdfSupported: boolean;
}

export interface ReportColumn {
  key: string;
  label: string;
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
}

export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  region?: string;
  serviceType?: string;
  priority?: string;
  asmId?: string;
  engineerId?: string;
  customerId?: string;
  equipmentCategory?: string;
  renewalStatus?: string;
  ruleType?: string;
  month?: string;
}

// FSD §6.3 — which of the generic ReportFilters fields each report actually
// reads (reports.service.ts). Drives which filter inputs the page shows —
// showing all 12 filters on every report would be confusing since most
// reports only honor 2-4 of them.
export const REPORT_FILTER_FIELDS: Record<ReportKey, (keyof ReportFilters)[]> = {
  "open-tickets-by-status": ["dateFrom", "dateTo", "region", "serviceType", "priority", "asmId"],
  "sla-compliance": ["dateFrom", "dateTo", "region", "serviceType", "engineerId"],
  "mttr-report": ["dateFrom", "dateTo", "region", "serviceType"],
  "service-revenue-report": ["dateFrom", "dateTo", "customerId", "serviceType"],
  "equipment-breakdown-frequency": ["equipmentCategory", "customerId"],
  "spares-demand-signal": [],
  "amc-portfolio-report": ["customerId", "region", "renewalStatus"],
  "predictive-maintenance-alerts-log": ["dateFrom", "dateTo", "equipmentCategory", "ruleType"],
  "engineer-performance-report": ["dateFrom", "dateTo", "region", "engineerId"],
  "amc-renewal-alert-summary": ["region", "month"],
  "warranty-cost-tracker": ["dateFrom", "dateTo", "region"],
};

function qs(filters: ReportFilters): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export const listReports = () => apiFetch<ReportListItem[]>(`/reports`);

export const runReport = (key: ReportKey, filters: ReportFilters) => apiFetch<ReportResult>(`/reports/${key}${qs(filters)}`);

export const ticketStatusTimeline = (ticketId: string) => apiFetch<ReportResult>(`/reports/ticket-status-timeline/${ticketId}`);

export async function downloadReportExport(key: ReportKey, filters: ReportFilters, format: "excel" | "pdf") {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) params.set(k, v);
  params.set("format", format);
  const blob = await apiFetchBlob(`/reports/${key}/export?${params.toString()}`);
  triggerDownload(blob, `${key}.${format === "excel" ? "xlsx" : "pdf"}`);
}

export async function downloadTicketStatusTimeline(ticketId: string) {
  const blob = await apiFetchBlob(`/reports/ticket-status-timeline/${ticketId}/export`);
  triggerDownload(blob, `ticket-status-timeline.pdf`);
}

// Non-date filter fields per report — used by the Scheduled Reports form,
// which never freezes dateFrom/dateTo (see ScheduledReport, relativeWindowDays
// instead). Derived from REPORT_FILTER_FIELDS rather than duplicated by hand.
export const NON_DATE_FILTER_FIELDS: Record<ReportKey, (keyof ReportFilters)[]> = Object.fromEntries(
  Object.entries(REPORT_FILTER_FIELDS).map(([key, fields]) => [key, fields.filter((f) => f !== "dateFrom" && f !== "dateTo")]),
) as Record<ReportKey, (keyof ReportFilters)[]>;

export const REPORT_HAS_DATE_FILTER: Record<ReportKey, boolean> = Object.fromEntries(
  Object.entries(REPORT_FILTER_FIELDS).map(([key, fields]) => [key, fields.includes("dateFrom")]),
) as Record<ReportKey, boolean>;

export type ScheduledReportFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

export interface ScheduledReport {
  id: string;
  reportKey: ReportKey;
  filters: Record<string, string>;
  relativeWindowDays: number | null;
  format: "excel" | "pdf";
  recipients: string[];
  frequency: ScheduledReportFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  sendHour: number;
  isActive: boolean;
  lastRunAt: string | null;
  lastRunStatus: string | null;
  createdAt: string;
}

export interface ScheduledReportInput {
  reportKey: ReportKey;
  filters: Record<string, string>;
  relativeWindowDays?: number;
  format: "excel" | "pdf";
  recipients: string[];
  frequency: ScheduledReportFrequency;
  dayOfWeek?: number;
  dayOfMonth?: number;
  sendHour: number;
}

export const listSchedules = () => apiFetch<ScheduledReport[]>(`/reports/schedules`);

export const createSchedule = (input: ScheduledReportInput) =>
  apiFetch<ScheduledReport>(`/reports/schedules`, { method: "POST", body: JSON.stringify(input) });

export const updateSchedule = (id: string, input: Partial<ScheduledReportInput> & { isActive?: boolean }) =>
  apiFetch<ScheduledReport>(`/reports/schedules/${id}`, { method: "PATCH", body: JSON.stringify(input) });

export const deleteSchedule = (id: string) => apiFetch<{ ok: boolean }>(`/reports/schedules/${id}`, { method: "DELETE" });

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
