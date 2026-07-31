"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { getCurrentUser, logout } from "@/lib/auth";
import {
  downloadReportExport,
  downloadTicketStatusTimeline,
  listReports,
  REPORT_FILTER_FIELDS,
  ReportFilters,
  ReportKey,
  ReportListItem,
  ReportResult,
  runReport,
  ticketStatusTimeline,
} from "@/lib/ticketing/reports";
import { listUsers } from "@/lib/ticketing/users";
import { listCustomers } from "@/lib/ticketing/masters";
import { SearchOption } from "@/components/SearchMultiSelect";
import ReportFilterInput from "@/components/ReportFilterInput";
import ReportResultTable from "@/components/ReportResultTable";

// FSD §6.3 — 11 of 12 reports built (Warranty Cost Tracker still blocked,
// see ACE-Ticket-Engine-Build-Plan.md T5). View + on-demand Excel/PDF export,
// plus Scheduled Reports (auto-email — see /dashboard/reports/schedules).
//
// Deliberately full-bleed (2026-07-31, client request) — lives as a sibling
// of the Business Dashboards (dashboard/manufacturing, dashboard/sales, ...)
// outside the (ticketing) route group, so it does NOT inherit the shared
// Sidebar/TopBar shell, same pattern those ERP dashboard pages already use.
// Own minimal header below replaces that shell's Back-nav + Logout.
export default function ReportsPage() {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [selected, setSelected] = useState<ReportKey | null>(null);
  const [filters, setFilters] = useState<ReportFilters>({});
  const [result, setResult] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [ticketId, setTicketId] = useState("");
  const [timeline, setTimeline] = useState<ReportResult | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  // ASM/Engineer lists are small enough to fetch once and filter client-side
  // in the search box; Customer uses server-side search instead (see
  // fetchCustomerOptions below) since that list can be much larger.
  const [asmOptions, setAsmOptions] = useState<SearchOption[]>([]);
  const [engineerOptions, setEngineerOptions] = useState<SearchOption[]>([]);

  const [backHref, setBackHref] = useState("/dashboard/service");

  useEffect(() => {
    const user = getCurrentUser();
    if (user?.role === "ADMIN") setBackHref("/dashboard/admin");

    listReports()
      .then(setReports)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Manager or Admin access required.");
        else setError("Could not load the report list.");
      });
    listUsers({ role: "ASM" })
      .then((users) => setAsmOptions(users.map((u) => ({ id: u.id, label: u.fullName }))))
      .catch(() => {});
    listUsers({ role: "ENGINEER" })
      .then((users) => setEngineerOptions(users.map((u) => ({ id: u.id, label: u.fullName }))))
      .catch(() => {});
  }, []);

  async function fetchCustomerOptions(query: string): Promise<SearchOption[]> {
    const customers = await listCustomers(query);
    return customers.map((c) => ({ id: c.id, label: c.customerName }));
  }

  const activeReport = useMemo(() => reports.find((r) => r.key === selected) ?? null, [reports, selected]);
  const fields = selected ? REPORT_FILTER_FIELDS[selected] : [];

  function selectReport(key: ReportKey) {
    setSelected(key);
    setFilters({});
    setResult(null);
    setError(null);
  }

  async function onRun() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const data = await runReport(selected, filters);
      setResult(data);
    } catch {
      setError("Could not generate this report.");
    } finally {
      setLoading(false);
    }
  }

  async function onExport(format: "excel" | "pdf") {
    if (!selected) return;
    setExporting(format);
    setError(null);
    try {
      await downloadReportExport(selected, filters, format);
    } catch {
      setError(`Could not export as ${format === "excel" ? "Excel" : "PDF"}.`);
    } finally {
      setExporting(null);
    }
  }

  async function onLoadTimeline() {
    if (!ticketId.trim()) return;
    setTimelineLoading(true);
    setTimelineError(null);
    setTimeline(null);
    try {
      const data = await ticketStatusTimeline(ticketId.trim());
      setTimeline(data);
    } catch {
      setTimelineError("Ticket not found, or you don't have access.");
    } finally {
      setTimelineLoading(false);
    }
  }

  async function onDownloadTimeline() {
    if (!ticketId.trim()) return;
    try {
      await downloadTicketStatusTimeline(ticketId.trim());
    } catch {
      setTimelineError("Could not export the timeline PDF.");
    }
  }

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="flex items-center justify-between border-b border-line bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href={backHref} className="text-xs font-medium text-muted hover:text-navy">
            ← Back to Dashboard
          </Link>
          <h1 className="text-lg font-bold text-navy">Reports</h1>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard/reports/schedules" className="text-xs font-medium text-muted hover:text-navy">
            Scheduled Reports
          </Link>
          <button onClick={logout} className="text-xs font-medium text-muted hover:text-navy">
            Logout
          </button>
        </div>
      </div>

      <div className="w-full px-6 py-8">
        {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
          {/* Report picker */}
          <div className="rounded-lg border border-line bg-white p-2">
            {reports.map((r) => (
              <button
                key={r.key}
                onClick={() => selectReport(r.key)}
                className={`mb-0.5 block w-full rounded-md px-3 py-2 text-left text-[13px] transition ${
                  selected === r.key ? "bg-navy-tint font-medium text-navy" : "text-navy hover:bg-navy-soft"
                }`}
              >
                {r.title}
              </button>
            ))}

            <div className="mt-2 border-t border-line pt-2">
              <button
                onClick={() => selectReport("__timeline__" as ReportKey)}
                className={`block w-full rounded-md px-3 py-2 text-left text-[13px] transition ${
                  selected === ("__timeline__" as ReportKey) ? "bg-navy-tint font-medium text-navy" : "text-muted hover:bg-navy-soft hover:text-navy"
                }`}
              >
                Ticket Status Timeline
              </button>
            </div>
          </div>

          {/* Filters + results */}
          <div>
            {!selected && <p className="text-sm text-muted">Pick a report from the list.</p>}

            {selected === ("__timeline__" as ReportKey) && (
              <div className="rounded-lg border border-line bg-white p-4">
                <p className="mb-3 text-sm font-bold text-navy">Ticket Status Timeline</p>
                <div className="mb-4 flex items-end gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Ticket ID</label>
                    <input
                      value={ticketId}
                      onChange={(e) => setTicketId(e.target.value)}
                      placeholder="Ticket UUID"
                      className="h-9 w-64 rounded-md border border-line px-3 text-sm text-navy"
                    />
                  </div>
                  <button
                    onClick={onLoadTimeline}
                    disabled={timelineLoading || !ticketId.trim()}
                    className="h-9 rounded-md bg-navy px-4 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {timelineLoading ? "Loading…" : "View"}
                  </button>
                  {timeline && (
                    <button onClick={onDownloadTimeline} className="h-9 rounded-md border border-line px-4 text-xs font-bold text-navy">
                      Export PDF
                    </button>
                  )}
                </div>
                {timelineError && <p className="mb-3 text-xs text-brand-red">{timelineError}</p>}
                {timeline && <ReportResultTable result={timeline} />}
              </div>
            )}

            {selected && selected !== ("__timeline__" as ReportKey) && (
              <div className="rounded-lg border border-line bg-white p-4">
                <p className="text-sm font-bold text-navy">{activeReport?.title}</p>
                {activeReport?.description && <p className="mb-3 mt-0.5 text-xs text-muted">{activeReport.description}</p>}

                {fields.length > 0 && (
                  <div className="mb-4 flex flex-wrap items-end gap-3">
                    {fields.map((f) => (
                      <ReportFilterInput
                        key={f}
                        field={f}
                        value={filters[f] ?? ""}
                        onChange={(v) => setFilters((old) => ({ ...old, [f]: v }))}
                        asmOptions={asmOptions}
                        engineerOptions={engineerOptions}
                        fetchCustomerOptions={fetchCustomerOptions}
                      />
                    ))}
                  </div>
                )}

                <div className="mb-4 flex gap-2">
                  <button onClick={onRun} disabled={loading} className="h-9 rounded-md bg-navy px-4 text-xs font-bold text-white disabled:opacity-50">
                    {loading ? "Running…" : "Run Report"}
                  </button>
                  <button
                    onClick={() => onExport("excel")}
                    disabled={!!exporting}
                    className="h-9 rounded-md border border-line px-4 text-xs font-bold text-navy disabled:opacity-50"
                  >
                    {exporting === "excel" ? "Exporting…" : "Export Excel"}
                  </button>
                  {activeReport?.pdfSupported && (
                    <button
                      onClick={() => onExport("pdf")}
                      disabled={!!exporting}
                      className="h-9 rounded-md border border-line px-4 text-xs font-bold text-navy disabled:opacity-50"
                    >
                      {exporting === "pdf" ? "Exporting…" : "Export PDF"}
                    </button>
                  )}
                </div>

                {result && <ReportResultTable result={result} />}
                {result && result.rows.length === 0 && <p className="text-sm text-muted">No data matches these filters.</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
