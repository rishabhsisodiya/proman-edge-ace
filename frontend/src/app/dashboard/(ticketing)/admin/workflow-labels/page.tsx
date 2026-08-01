"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { listWorkflowLabels, TicketStatusLabelRow, updateWorkflowLabel } from "@/lib/ticketing/workflow-labels";

// Workflow States & Transitions (2026-08-01, FSD §5.2) — scoped down to
// labels-only per client decision: this edits ONLY the display text shown
// for each of the 10 ticket statuses. The actual transitions (which status
// can move to which, and which roles are allowed to do it) stay completely
// hardcoded in the backend's workflow.constants.ts, untouched by this
// screen — a real workflow designer (add/remove states, edit transitions)
// was flagged as the highest-risk item in the whole build plan and
// deliberately not attempted.
export default function WorkflowLabelsPage() {
  const [rows, setRows] = useState<TicketStatusLabelRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    listWorkflowLabels()
      .then((data) => {
        setRows(data);
        setDrafts(Object.fromEntries(data.map((r) => [r.status, r.label])));
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Admin access required.");
        else setError("Could not load status labels.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function onSave(status: string) {
    const label = drafts[status]?.trim();
    if (!label) {
      setError("Label cannot be blank.");
      return;
    }
    setSavingStatus(status);
    setError(null);
    try {
      await updateWorkflowLabel(status as TicketStatusLabelRow["status"], label);
      load();
    } catch {
      setError("Could not save this label.");
    } finally {
      setSavingStatus(null);
    }
  }

  return (
    <div className="w-full px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">Workflow States & Transitions</h1>
      <p className="mb-6 text-sm text-muted">Edit what each ticket status is called across the app.</p>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
                <th className="px-4 py-3">Status (internal value)</th>
                <th className="px-4 py-3">Display Label</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const busy = savingStatus === r.status;
                return (
                  <tr key={r.status} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-muted">{r.status}</td>
                    <td className="px-4 py-3">
                      <input
                        value={drafts[r.status] ?? ""}
                        disabled={busy}
                        onChange={(e) => setDrafts((d) => ({ ...d, [r.status]: e.target.value }))}
                        className="h-9 w-full max-w-xs rounded-md border border-line px-3 text-sm text-navy disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => onSave(r.status)} disabled={busy} className="text-xs font-bold text-navy disabled:opacity-50">
                        {busy ? "Saving…" : "Save"}
                      </button>
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
}
