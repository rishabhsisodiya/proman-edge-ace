"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  createSlaPolicy,
  deleteSlaPolicy,
  listSlaPolicies,
  SlaPolicy,
  updateSlaPolicy,
} from "@/lib/ticketing/sla-policies";
import {
  createSlaPauseState,
  deleteSlaPauseState,
  listSlaPauseStates,
  SlaPauseState,
} from "@/lib/ticketing/sla-pause-states";
import {
  createHoliday,
  deleteHoliday,
  downloadHolidayTemplate,
  Holiday,
  HolidayUploadResult,
  listHolidays,
  uploadHolidays,
} from "@/lib/ticketing/holidays";
import { Priority, ServiceType, SERVICE_TYPE_LABEL, STATUS_LABEL, TicketStatus } from "@/lib/ticketing/types";
import {
  listSlaNotificationRules,
  setSlaNotificationRule,
  SlaBreachType,
  SlaNotificationRule,
} from "@/lib/ticketing/sla-notification-rules";
import { Role } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/ticketing/users";

const SERVICE_TYPES: ServiceType[] = Object.keys(SERVICE_TYPE_LABEL) as ServiceType[];
const PRIORITIES: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const STATUSES: TicketStatus[] = Object.keys(STATUS_LABEL) as TicketStatus[];

// Roles relevant to SLA breach notifications — excludes the Proman Edge
// dashboard-only roles (Sales Head, Manufacturing Head, etc.), which have
// nothing to do with ticket SLAs. Matches backend SlaNotificationRuleService.
const NOTIFICATION_ROLES: Role[] = ["CALL_CENTER", "ASM", "ENGINEER", "MANAGER", "ADMIN", "CS_SUPPORT", "MD"];
const BREACH_TYPES: SlaBreachType[] = ["RESPONSE", "RESOLUTION"];
const BREACH_TYPE_LABEL: Record<SlaBreachType, string> = { RESPONSE: "Response Breach", RESOLUTION: "Resolution Breach" };

// Merged (2026-07-30, client request — "all related to SLA only") — was 3
// separate Admin Console entries (SLA Policies, SLA Pause States, Holidays),
// now one page with tabs. Same components/logic as before, just no longer
// spread across 3 routes.
export default function SlaConfigPage() {
  const [tab, setTab] = useState<"policies" | "pause-states" | "holidays" | "notification-rules">("policies");

  return (
    <div className="w-full px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">SLA Configuration</h1>
      <p className="mb-6 text-sm text-muted">
        Response/resolution targets, clock-pausing statuses, and the business-hours holiday exclusion list —
        everything that determines a ticket's SLA due dates.
      </p>

      <div className="mb-6 flex gap-1 border-b border-line">
        <button
          type="button"
          onClick={() => setTab("policies")}
          className={`px-3 py-2 text-sm font-bold ${tab === "policies" ? "border-b-2 border-orange text-navy" : "text-muted"}`}
        >
          Policies
        </button>
        <button
          type="button"
          onClick={() => setTab("pause-states")}
          className={`px-3 py-2 text-sm font-bold ${tab === "pause-states" ? "border-b-2 border-orange text-navy" : "text-muted"}`}
        >
          Pause States
        </button>
        <button
          type="button"
          onClick={() => setTab("holidays")}
          className={`px-3 py-2 text-sm font-bold ${tab === "holidays" ? "border-b-2 border-orange text-navy" : "text-muted"}`}
        >
          Holidays
        </button>
        <button
          type="button"
          onClick={() => setTab("notification-rules")}
          className={`px-3 py-2 text-sm font-bold ${tab === "notification-rules" ? "border-b-2 border-orange text-navy" : "text-muted"}`}
        >
          Notification Rules
        </button>
      </div>

      {tab === "policies" && <PoliciesTab />}
      {tab === "pause-states" && <PauseStatesTab />}
      {tab === "holidays" && <HolidaysTab />}
      {tab === "notification-rules" && <NotificationRulesTab />}
    </div>
  );
}

// ------------------------------------------------------------------ Policies

function PoliciesTab() {
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { responseHours: string; resolutionHours: string }>>({});
  const [openServiceType, setOpenServiceType] = useState<ServiceType | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    listSlaPolicies()
      .then((data) => {
        setPolicies(data);
        const d: Record<string, { responseHours: string; resolutionHours: string }> = {};
        for (const p of data)
          d[key(p.serviceType, p.priority)] = {
            responseHours: p.responseHours != null ? String(p.responseHours) : "",
            resolutionHours: p.resolutionHours != null ? String(p.resolutionHours) : "",
          };
        setDrafts(d);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Admin access required.");
        else setError("Could not load SLA policies.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function key(serviceType: ServiceType, priority: Priority) {
    return `${serviceType}__${priority}`;
  }

  function existing(serviceType: ServiceType, priority: Priority) {
    return policies.find((p) => p.serviceType === serviceType && p.priority === priority);
  }

  const filledCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const st of SERVICE_TYPES) {
      counts[st] = PRIORITIES.filter((p) => {
        const found = existing(st, p);
        return found?.responseHours != null || found?.resolutionHours != null;
      }).length;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policies]);

  async function onSave(serviceType: ServiceType, priority: Priority) {
    const k = key(serviceType, priority);
    const draft = drafts[k];
    const responseHours = Number(draft?.responseHours);
    const resolutionHours = Number(draft?.resolutionHours);
    if (!responseHours || !resolutionHours || responseHours < 1 || resolutionHours < 1) {
      setError("Response/resolution hours must be positive numbers.");
      return;
    }
    setBusyKey(k);
    setError(null);
    try {
      const found = existing(serviceType, priority);
      if (found) await updateSlaPolicy(found.id, responseHours, resolutionHours);
      else await createSlaPolicy(serviceType, priority, responseHours, resolutionHours);
      load();
    } catch {
      setError("Could not save this SLA policy.");
    } finally {
      setBusyKey(null);
    }
  }

  async function onRemove(id: string, k: string) {
    setBusyKey(k);
    try {
      await deleteSlaPolicy(id);
      load();
    } catch {
      setError("Could not remove this SLA policy.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div>
      <p className="mb-6 text-sm text-muted">
        Response/resolution target hours per service type × priority, business-hours clock (08:00–18:00,
        Mon–Sat). Click a service type to edit its 4 priorities. A blank row has no SLA policy set — those
        tickets get no due dates at all until one is added here.
      </p>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="divide-y divide-line rounded-lg border border-line bg-white">
          {SERVICE_TYPES.map((st) => {
            const isOpen = openServiceType === st;
            const filled = filledCount[st] ?? 0;
            return (
              <div key={st}>
                <button
                  onClick={() => setOpenServiceType(isOpen ? null : st)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-navy-soft"
                >
                  <span className="text-sm font-bold text-navy">{SERVICE_TYPE_LABEL[st]}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        filled === 4 ? "bg-brand-green-bg text-brand-green" : filled === 0 ? "bg-navy-soft text-muted" : "bg-brand-amber-bg text-brand-amber"
                      }`}
                    >
                      {filled}/4 set
                    </span>
                    <span className="ml-1 text-muted">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-line bg-navy-soft/40 p-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
                          <th className="py-2">Priority</th>
                          <th className="py-2">Response (hrs)</th>
                          <th className="py-2">Resolution (hrs)</th>
                          <th className="py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {PRIORITIES.map((p) => {
                          const k = key(st, p);
                          const found = existing(st, p);
                          const draft = drafts[k] ?? { responseHours: "", resolutionHours: "" };
                          const busy = busyKey === k;
                          return (
                            <tr key={k} className="border-b border-line last:border-0">
                              <td className="py-2 text-navy">{p}</td>
                              <td className="py-2">
                                <input
                                  type="number"
                                  min={1}
                                  value={draft.responseHours}
                                  disabled={busy}
                                  onChange={(e) =>
                                    setDrafts((d) => ({
                                      ...d,
                                      [k]: { responseHours: e.target.value, resolutionHours: d[k]?.resolutionHours ?? "" },
                                    }))
                                  }
                                  className="h-8 w-20 rounded-md border border-line bg-white px-2 text-xs text-navy disabled:opacity-50"
                                  placeholder="—"
                                />
                              </td>
                              <td className="py-2">
                                <input
                                  type="number"
                                  min={1}
                                  value={draft.resolutionHours}
                                  disabled={busy}
                                  onChange={(e) =>
                                    setDrafts((d) => ({
                                      ...d,
                                      [k]: { responseHours: d[k]?.responseHours ?? "", resolutionHours: e.target.value },
                                    }))
                                  }
                                  className="h-8 w-20 rounded-md border border-line bg-white px-2 text-xs text-navy disabled:opacity-50"
                                  placeholder="—"
                                />
                              </td>
                              <td className="py-2 text-right">
                                <button
                                  onClick={() => onSave(st, p)}
                                  disabled={busy}
                                  className="mr-3 text-xs font-bold text-navy disabled:opacity-50"
                                >
                                  Save
                                </button>
                                {found && (
                                  <button onClick={() => onRemove(found.id, k)} disabled={busy} className="text-xs font-bold text-brand-red disabled:opacity-50">
                                    Remove
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Pause States

function PauseStatesTab() {
  const [states, setStates] = useState<SlaPauseState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<TicketStatus>("PENDING");
  const [adding, setAdding] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    listSlaPauseStates()
      .then(setStates)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Admin access required.");
        else setError("Could not load SLA pause states.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const availableStatuses = STATUSES.filter((s) => !states.some((st) => st.status === s));

  useEffect(() => {
    if (availableStatuses.length > 0 && !availableStatuses.includes(newStatus)) {
      setNewStatus(availableStatuses[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [states]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    setError(null);
    try {
      await createSlaPauseState(newStatus);
      load();
    } catch {
      setError("Could not add this status to the pause list.");
    } finally {
      setAdding(false);
    }
  }

  async function onRemove(id: string) {
    setBusyId(id);
    try {
      await deleteSlaPauseState(id);
      load();
    } catch {
      setError("Could not remove this status from the pause list.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <p className="mb-6 text-sm text-muted">
        Ticket statuses in this list pause the SLA clock — time spent there doesn&apos;t count against a ticket&apos;s
        response/resolution due dates. Default is empty: nothing pauses the clock except the two built-in rules
        (response stops at Assigned, resolution stops at Engineer Resolved) — notably, Pending does <b>not</b> pause
        by default. Add Pending here only if the business decides Pending time genuinely shouldn&apos;t count.
      </p>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      <form onSubmit={onAdd} className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Status</label>
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value as TicketStatus)}
            className="h-9 w-56 rounded-md border border-line px-2 text-sm text-navy"
          >
            {availableStatuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={adding || availableStatuses.length === 0}
          className="h-9 rounded-md bg-orange px-4 text-sm font-bold text-navy transition disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add to Pause List"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : states.length === 0 ? (
        <p className="text-sm text-muted">No statuses configured — the SLA clock never pauses (default).</p>
      ) : (
        <table className="w-full rounded-lg border border-line bg-white text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {states.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-navy">{STATUS_LABEL[s.status]}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onRemove(s.id)}
                    disabled={busyId === s.id}
                    className="text-xs font-bold text-brand-red disabled:opacity-50"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Holidays

function HolidaysTab() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [date, setDate] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<HolidayUploadResult | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    listHolidays()
      .then(setHolidays)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Admin access required.");
        else setError("Could not load holidays.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function onAdd() {
    if (!date || !label.trim()) {
      setError("Date and label are both required.");
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await createHoliday(date, label.trim());
      setDate("");
      setLabel("");
      load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError("A holiday is already set for this date.");
      else setError("Could not add this holiday.");
    } finally {
      setAdding(false);
    }
  }

  async function onRemove(id: string) {
    setBusyId(id);
    try {
      await deleteHoliday(id);
      load();
    } catch {
      setError("Could not remove this holiday.");
    } finally {
      setBusyId(null);
    }
  }

  async function onUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    setUploadResult(null);
    try {
      setUploadResult(await uploadHolidays(file));
      setFile(null);
      load();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string | string[] } | null;
        setError(Array.isArray(body?.message) ? body!.message.join(", ") : body?.message ?? "Upload failed.");
      } else {
        setError("Could not reach the server.");
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <p className="mb-6 text-sm text-muted">
        Dates excluded from the business-hours SLA clock (08:00–18:00, Mon–Sat), on top of the weekly
        off-day. Upload the full year's list at once, or add/remove individual dates as needed.
      </p>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      <div className="mb-6 rounded-lg border border-line bg-white p-4 text-sm">
        <p className="mb-2 font-bold text-navy">Bulk upload (once a year)</p>
        <p className="mb-3 text-muted">
          Download the template, fill it in (columns: <code className="text-xs">date</code>,{" "}
          <code className="text-xs">label</code>), and upload it back here. Dates already on the list are
          skipped and reported, not treated as an error.
        </p>
        <button type="button" onClick={downloadHolidayTemplate} className="mb-3 text-xs font-bold text-navy underline">
          Download CSV template
        </button>
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <button
            type="button"
            disabled={!file || uploading}
            onClick={onUpload}
            className="rounded-md bg-orange px-4 py-2 text-xs font-bold text-navy disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>

        {uploadResult && (
          <div className="mt-3">
            <p className="mb-2 text-xs font-bold text-navy">
              {uploadResult.succeeded} of {uploadResult.total} rows added · {uploadResult.failed} skipped
            </p>
            {uploadResult.failed > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-md border border-line">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-line">
                    {uploadResult.results
                      .filter((r) => r.error)
                      .map((r) => (
                        <tr key={r.row}>
                          <td className="px-2 py-1 text-muted">Row {r.row}</td>
                          <td className="px-2 py-1 text-brand-red">{r.error}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mb-6 rounded-lg border border-line bg-white p-4 text-sm">
        <p className="mb-2 font-bold text-navy">Add a single date</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-navy">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 rounded-md border border-line px-2 text-sm text-navy"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-bold text-navy">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Independence Day"
              className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy"
            />
          </div>
          <button
            type="button"
            disabled={adding}
            onClick={onAdd}
            className="h-9 rounded-md bg-orange px-4 text-xs font-bold text-navy disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-navy-tint text-left text-xs font-bold uppercase text-muted">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Label</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {holidays.map((h) => (
                <tr key={h.id}>
                  <td className="px-4 py-2 text-navy">{new Date(h.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="px-4 py-2 text-navy">{h.label}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => onRemove(h.id)}
                      disabled={busyId === h.id}
                      className="text-xs font-bold text-brand-red disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
              {holidays.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-muted">
                    No holidays configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ Notification Rules

// Admin-configurable SLA breach notification recipients (client request,
// 2026-08-04 — FSD: "automatic notification shall be sent to the Manager
// and the Managing Director (MD) ... Admin-level configuration option ...
// to set up and manage these SLA notification rules"). Manager stays
// region-scoped when checked (client confirmed: region Manager only, not
// every Manager org-wide) — that scoping happens server-side, this screen
// only controls which roles participate at all.
function NotificationRulesTab() {
  const [rules, setRules] = useState<SlaNotificationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    listSlaNotificationRules()
      .then(setRules)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Admin access required.");
        else setError("Could not load SLA notification rules.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function isEnabled(breachType: SlaBreachType, role: Role) {
    return rules.find((r) => r.breachType === breachType && r.role === role)?.enabled ?? false;
  }

  async function onToggle(breachType: SlaBreachType, role: Role) {
    const k = `${breachType}__${role}`;
    setBusyKey(k);
    setError(null);
    try {
      await setSlaNotificationRule(breachType, role, !isEnabled(breachType, role));
      load();
    } catch {
      setError("Could not update this notification rule.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div>
      <p className="mb-6 text-sm text-muted">
        Which roles get notified when a ticket&apos;s SLA is breached — response breach and resolution breach are
        configured separately. Checking <b>ASM</b> or <b>Engineer</b> notifies only whoever is assigned to that
        specific ticket, not every ASM/Engineer. Checking <b>Manager</b> notifies only the Manager(s) covering the
        ticket&apos;s own region, not every Manager. Every other role (Call Center, Admin, CS Support, MD) is
        notified organization-wide, regardless of the ticket.
      </p>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <table className="w-full rounded-lg border border-line bg-white text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
              <th className="px-4 py-3">Role</th>
              {BREACH_TYPES.map((bt) => (
                <th key={bt} className="px-4 py-3 text-center">
                  {BREACH_TYPE_LABEL[bt]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_ROLES.map((role) => (
              <tr key={role} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-navy">{ROLE_LABEL[role]}</td>
                {BREACH_TYPES.map((bt) => {
                  const k = `${bt}__${role}`;
                  return (
                    <td key={bt} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isEnabled(bt, role)}
                        disabled={busyKey === k}
                        onChange={() => onToggle(bt, role)}
                        className="h-4 w-4"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
