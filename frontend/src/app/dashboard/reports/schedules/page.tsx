"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { logout } from "@/lib/auth";
import {
  createSchedule,
  deleteSchedule,
  listReports,
  listSchedules,
  NON_DATE_FILTER_FIELDS,
  REPORT_HAS_DATE_FILTER,
  ReportFilters,
  ReportKey,
  ReportListItem,
  ScheduledReport,
  ScheduledReportFrequency,
  ScheduledReportInput,
  updateSchedule,
} from "@/lib/ticketing/reports";
import { listUsers } from "@/lib/ticketing/users";
import { listCustomers } from "@/lib/ticketing/masters";
import { SearchOption } from "@/components/SearchMultiSelect";
import ReportFilterInput from "@/components/ReportFilterInput";

const WEEKDAY_LABEL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function describeFrequency(s: ScheduledReport): string {
  const time = `${String(s.sendHour).padStart(2, "0")}:00 IST`;
  if (s.frequency === "DAILY") return `Daily, ${time}`;
  if (s.frequency === "WEEKLY") return `Weekly on ${WEEKDAY_LABEL[s.dayOfWeek ?? 0]}, ${time}`;
  return `Monthly on day ${s.dayOfMonth}, ${time}`;
}

export default function ScheduledReportsPage() {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [schedules, setSchedules] = useState<ScheduledReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [asmOptions, setAsmOptions] = useState<SearchOption[]>([]);
  const [engineerOptions, setEngineerOptions] = useState<SearchOption[]>([]);

  function load() {
    setLoading(true);
    Promise.all([listReports(), listSchedules()])
      .then(([r, s]) => {
        setReports(r);
        setSchedules(s);
        setError(null);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Manager or Admin access required.");
        else setError("Could not load scheduled reports.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
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

  async function onToggleActive(schedule: ScheduledReport) {
    try {
      await updateSchedule(schedule.id, { isActive: !schedule.isActive });
      load();
    } catch {
      setError("Could not update this schedule.");
    }
  }

  async function onDelete(schedule: ScheduledReport) {
    try {
      await deleteSchedule(schedule.id);
      load();
    } catch {
      setError("Could not delete this schedule.");
    }
  }

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="flex items-center justify-between border-b border-line bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/reports" className="text-xs font-medium text-muted hover:text-navy">
            ← Back to Reports
          </Link>
          <h1 className="text-lg font-bold text-navy">Scheduled Reports</h1>
        </div>
        <button onClick={logout} className="text-xs font-medium text-muted hover:text-navy">
          Logout
        </button>
      </div>

      <div className="w-full px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-muted">Auto-email a report to recipients on a recurring basis.</p>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="h-9 rounded-md bg-navy px-4 text-xs font-bold text-white"
          >
            {showForm ? "Cancel" : "+ New Schedule"}
          </button>
        </div>

        {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

        {showForm && (
          <ScheduleForm
            reports={reports}
            asmOptions={asmOptions}
            engineerOptions={engineerOptions}
            fetchCustomerOptions={fetchCustomerOptions}
            onCreated={() => {
              setShowForm(false);
              load();
            }}
          />
        )}

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : schedules.length === 0 ? (
          <p className="text-sm text-muted">No scheduled reports yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line bg-navy-soft text-left font-bold uppercase tracking-wide text-navy">
                  <th className="px-3 py-2">Report</th>
                  <th className="px-3 py-2">Format</th>
                  <th className="px-3 py-2">Frequency</th>
                  <th className="px-3 py-2">Recipients</th>
                  <th className="px-3 py-2">Last Run</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-navy">{reports.find((r) => r.key === s.reportKey)?.title ?? s.reportKey}</td>
                    <td className="px-3 py-2 text-navy uppercase">{s.format}</td>
                    <td className="px-3 py-2 text-navy">{describeFrequency(s)}</td>
                    <td className="px-3 py-2 text-navy">{s.recipients.join(", ")}</td>
                    <td className="px-3 py-2 text-navy">
                      {s.lastRunAt ? `${new Date(s.lastRunAt).toLocaleString()} (${s.lastRunStatus})` : "Never"}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => onToggleActive(s)}
                        className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                          s.isActive ? "bg-brand-green-bg text-brand-green" : "bg-navy-soft text-muted"
                        }`}
                      >
                        {s.isActive ? "Active" : "Disabled"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => onDelete(s)} className="text-[11px] font-bold text-brand-red">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ScheduleForm({
  reports,
  asmOptions,
  engineerOptions,
  fetchCustomerOptions,
  onCreated,
}: {
  reports: ReportListItem[];
  asmOptions: SearchOption[];
  engineerOptions: SearchOption[];
  fetchCustomerOptions: (query: string) => Promise<SearchOption[]>;
  onCreated: () => void;
}) {
  const [reportKey, setReportKey] = useState<ReportKey | "">("");
  const [filters, setFilters] = useState<ReportFilters>({});
  const [relativeWindowDays, setRelativeWindowDays] = useState("7");
  const [format, setFormat] = useState<"excel" | "pdf">("excel");
  const [recipientsText, setRecipientsText] = useState("");
  const [frequency, setFrequency] = useState<ScheduledReportFrequency>("WEEKLY");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [sendHour, setSendHour] = useState("9");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeReport = reports.find((r) => r.key === reportKey);
  const nonDateFields = reportKey ? NON_DATE_FILTER_FIELDS[reportKey] : [];
  const hasDateFilter = reportKey ? REPORT_HAS_DATE_FILTER[reportKey] : false;

  async function onSubmit() {
    if (!reportKey) {
      setError("Pick a report.");
      return;
    }
    const recipients = recipientsText
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (recipients.length === 0) {
      setError("At least one recipient email is required.");
      return;
    }

    const input: ScheduledReportInput = {
      reportKey,
      filters: Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Record<string, string>,
      format,
      recipients,
      frequency,
      sendHour: Number(sendHour),
      ...(hasDateFilter ? { relativeWindowDays: Number(relativeWindowDays) } : {}),
      ...(frequency === "WEEKLY" ? { dayOfWeek: Number(dayOfWeek) } : {}),
      ...(frequency === "MONTHLY" ? { dayOfMonth: Number(dayOfMonth) } : {}),
    };

    setSaving(true);
    setError(null);
    try {
      await createSchedule(input);
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.body && typeof err.body === "object" && "message" in err.body) {
        const msg = (err.body as { message: string | string[] }).message;
        setError(Array.isArray(msg) ? msg.join("; ") : msg);
      } else {
        setError("Could not create this schedule.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6 rounded-lg border border-line bg-white p-4">
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Report</label>
          <select
            value={reportKey}
            onChange={(e) => {
              setReportKey(e.target.value as ReportKey);
              setFilters({});
              setFormat("excel");
            }}
            className="h-9 w-full rounded-md border border-line px-2 text-xs text-navy"
          >
            <option value="">Choose a report…</option>
            {reports.map((r) => (
              <option key={r.key} value={r.key}>
                {r.title}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Format</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as "excel" | "pdf")} className="h-9 w-full rounded-md border border-line px-2 text-xs text-navy">
            <option value="excel">Excel</option>
            {activeReport?.pdfSupported && <option value="pdf">PDF</option>}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Send Hour (IST)</label>
          <select value={sendHour} onChange={(e) => setSendHour(e.target.value)} className="h-9 w-full rounded-md border border-line px-2 text-xs text-navy">
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </div>
      </div>

      {reportKey && (
        <>
          {(nonDateFields.length > 0 || hasDateFilter) && (
            <div className="mb-4 flex flex-wrap items-end gap-3 border-t border-line pt-4">
              {hasDateFilter && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted">Relative Window (days)</label>
                  <input
                    type="number"
                    min={1}
                    value={relativeWindowDays}
                    onChange={(e) => setRelativeWindowDays(e.target.value)}
                    className="h-9 w-28 rounded-md border border-line px-3 text-xs text-navy"
                  />
                </div>
              )}
              {nonDateFields.map((f) => (
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

          <div className="mb-4 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as ScheduledReportFrequency)}
                className="h-9 w-full rounded-md border border-line px-2 text-xs text-navy"
              >
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>

            {frequency === "WEEKLY" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Day of Week</label>
                <select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)} className="h-9 w-full rounded-md border border-line px-2 text-xs text-navy">
                  {WEEKDAY_LABEL.map((label, i) => (
                    <option key={i} value={i}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {frequency === "MONTHLY" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Day of Month</label>
                <select value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} className="h-9 w-full rounded-md border border-line px-2 text-xs text-navy">
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="mb-4 border-t border-line pt-4">
            <label className="mb-1 block text-xs font-medium text-muted">Recipients (comma or newline separated)</label>
            <textarea
              value={recipientsText}
              onChange={(e) => setRecipientsText(e.target.value)}
              rows={2}
              placeholder="manager@company.com, admin@company.com"
              className="w-full rounded-md border border-line px-3 py-2 text-xs text-navy"
            />
          </div>
        </>
      )}

      {error && <p className="mb-3 text-xs text-brand-red">{error}</p>}

      <button
        onClick={onSubmit}
        disabled={saving || !reportKey}
        className="h-9 rounded-md bg-navy px-4 text-xs font-bold text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Create Schedule"}
      </button>
    </div>
  );
}

