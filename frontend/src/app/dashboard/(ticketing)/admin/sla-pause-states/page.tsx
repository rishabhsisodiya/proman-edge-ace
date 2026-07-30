"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  createSlaPauseState,
  deleteSlaPauseState,
  listSlaPauseStates,
  SlaPauseState,
} from "@/lib/ticketing/sla-pause-states";
import { STATUS_LABEL, TicketStatus } from "@/lib/ticketing/types";

const STATUSES: TicketStatus[] = Object.keys(STATUS_LABEL) as TicketStatus[];

// FSD §14.1 rule 21 — "SLA clock pauses only for tickets that move to a
// configurable 'SLA pause' state list (admin-configurable; default: none —
// SLA does not pause in Pending (Reason) state). Admin can configure
// specific states to pause SLA if business decides Pending time should not
// count." Read live by WorkflowService on every ticket status transition.
export default function SlaPauseStatesPage() {
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
    <div className="w-full px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">SLA Pause States</h1>
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
