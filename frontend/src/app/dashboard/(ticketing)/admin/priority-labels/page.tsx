"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { listPriorityLabels, PriorityLabelRow, updatePriorityLabel } from "@/lib/ticketing/priority-labels";

// Ticket Priorities (2026-08-01, FSD §5.2) — the 4 priority values themselves
// stay fixed (Critical/High/Medium/Low); only the display label and
// definition text are Admin-editable, same scope decision and screen shape
// as Workflow States & Transitions.
export default function PriorityLabelsPage() {
  const [rows, setRows] = useState<PriorityLabelRow[]>([]);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [definitionDrafts, setDefinitionDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingPriority, setSavingPriority] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    listPriorityLabels()
      .then((data) => {
        setRows(data);
        setLabelDrafts(Object.fromEntries(data.map((r) => [r.priority, r.label])));
        setDefinitionDrafts(Object.fromEntries(data.map((r) => [r.priority, r.definition ?? ""])));
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Admin access required.");
        else setError("Could not load priority labels.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function onSave(priority: string) {
    const label = labelDrafts[priority]?.trim();
    if (!label) {
      setError("Label cannot be blank.");
      return;
    }
    setSavingPriority(priority);
    setError(null);
    try {
      await updatePriorityLabel(priority as PriorityLabelRow["priority"], label, definitionDrafts[priority]?.trim() || undefined);
      load();
    } catch {
      setError("Could not save this priority.");
    } finally {
      setSavingPriority(null);
    }
  }

  return (
    <div className="w-full px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">Ticket Priorities</h1>
      <p className="mb-6 text-sm text-muted">Edit the display label and definition for each priority level.</p>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
                <th className="px-4 py-3">Priority (internal value)</th>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Definition</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const busy = savingPriority === r.priority;
                return (
                  <tr key={r.priority} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-muted">{r.priority}</td>
                    <td className="px-4 py-3">
                      <input
                        value={labelDrafts[r.priority] ?? ""}
                        disabled={busy}
                        onChange={(e) => setLabelDrafts((d) => ({ ...d, [r.priority]: e.target.value }))}
                        className="h-9 w-full max-w-xs rounded-md border border-line px-3 text-sm text-navy disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={definitionDrafts[r.priority] ?? ""}
                        disabled={busy}
                        onChange={(e) => setDefinitionDrafts((d) => ({ ...d, [r.priority]: e.target.value }))}
                        className="h-9 w-full rounded-md border border-line px-3 text-sm text-navy disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => onSave(r.priority)} disabled={busy} className="text-xs font-bold text-navy disabled:opacity-50">
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
