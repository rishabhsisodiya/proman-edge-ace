import { ReportFilters, ReportResult, ReportsService } from './reports.service';

// FSD §6.3 — 11 of 12 reports (Warranty Cost Tracker still blocked). One
// report (Ticket Status Timeline) has its own route since it's keyed by
// ticket id, not the generic filter set. Shared by ReportsController (on-demand
// view/export) and ScheduledReportCron (auto-email) — single source of truth
// for report metadata + dispatch, so both call the exact same report logic.
export type ReportKey =
  | 'open-tickets-by-status'
  | 'sla-compliance'
  | 'mttr-report'
  | 'service-revenue-report'
  | 'equipment-breakdown-frequency'
  | 'spares-demand-signal'
  | 'amc-portfolio-report'
  | 'predictive-maintenance-alerts-log'
  | 'engineer-performance-report'
  | 'amc-renewal-alert-summary';

export const REPORT_TITLES: Record<ReportKey, string> = {
  'open-tickets-by-status': 'Open Tickets by Status',
  'sla-compliance': 'SLA Compliance',
  'mttr-report': 'MTTR Report',
  'service-revenue-report': 'Service Revenue Report',
  'equipment-breakdown-frequency': 'Equipment Breakdown Frequency',
  'spares-demand-signal': 'Spares Demand Signal',
  'amc-portfolio-report': 'AMC Portfolio Report',
  'predictive-maintenance-alerts-log': 'Predictive Maintenance Alerts Log',
  'engineer-performance-report': 'Engineer Performance Report',
  'amc-renewal-alert-summary': 'AMC Renewal Alert Summary',
};

// One-line explanation of what each report shows — surfaced under its name
// in the report picker so Manager/Admin don't have to guess from the title alone.
export const REPORT_DESCRIPTIONS: Record<ReportKey, string> = {
  'open-tickets-by-status': 'Every ticket that is not yet Closed, with its current status, SLA due date, and who it is assigned to.',
  'sla-compliance': 'Month-by-month SLA hit/breach rate for Closed tickets, split by service type, with average response and resolution time.',
  'mttr-report': 'Average, minimum, and maximum time-to-resolve for Closed tickets, grouped by month, service type, and region.',
  'service-revenue-report': 'Parts and labour value billed per quotation, with ERPNext invoice status, for chargeable service work.',
  'equipment-breakdown-frequency': 'Equipment ranked by number of breakdown tickets in the last 6 months, with average repair time — flags repeat-failure units.',
  'spares-demand-signal': 'Parts consumed on Field Service Visits in the last 3 months against current stock, flagging anything below its reorder level.',
  'amc-portfolio-report': 'Every AMC contract with coverage, value, visit completion, and renewal status.',
  'predictive-maintenance-alerts-log': 'Every ticket the system auto-created from a predictive rule (time-since-service, operating hours, or breakdown frequency), and which rule fired it.',
  'engineer-performance-report': 'Per-engineer ticket load, average resolution time, first-accept rate, average CSAT score, and utilization.',
  'amc-renewal-alert-summary': 'AMC contracts currently in Renewal Due or Final Notice, with days remaining and the owning ASM.',
};

// PDF export per the FSD's own per-report Export column — some reports are
// Excel-only, some support both.
export const PDF_SUPPORTED: Set<ReportKey> = new Set(['open-tickets-by-status', 'sla-compliance', 'amc-portfolio-report']);

export const REPORT_KEYS = Object.keys(REPORT_TITLES) as ReportKey[];

export function runReport(reports: ReportsService, key: ReportKey, filters: ReportFilters): Promise<ReportResult> {
  switch (key) {
    case 'open-tickets-by-status':
      return reports.openTicketsByStatus(filters);
    case 'sla-compliance':
      return reports.slaCompliance(filters);
    case 'mttr-report':
      return reports.mttrReport(filters);
    case 'service-revenue-report':
      return reports.serviceRevenueReport(filters);
    case 'equipment-breakdown-frequency':
      return reports.equipmentBreakdownFrequency(filters);
    case 'spares-demand-signal':
      return reports.sparesDemandSignal();
    case 'amc-portfolio-report':
      return reports.amcPortfolioReport(filters);
    case 'predictive-maintenance-alerts-log':
      return reports.predictiveMaintenanceAlertsLog(filters);
    case 'engineer-performance-report':
      return reports.engineerPerformanceReport(filters);
    case 'amc-renewal-alert-summary':
      return reports.amcRenewalAlertSummary(filters);
    default:
      throw new Error(`Unknown report key: ${key}`);
  }
}
