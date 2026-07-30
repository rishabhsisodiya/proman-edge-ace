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
import { Priority, ServiceType, SERVICE_TYPE_LABEL } from "@/lib/ticketing/types";

const SERVICE_TYPES: ServiceType[] = Object.keys(SERVICE_TYPE_LABEL) as ServiceType[];
const PRIORITIES: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

// Admin-configurable SLA target per FSD §14.3 — response/resolution hours per
// (serviceType, priority). Read live by TicketsService at creation and on
// service-type change (business-hours clock, §14.3).
// Grouped-by-service-type accordion (2026-07-30 redesign, same pattern as
// Notification Templates — one service type open at a time) — the flat
// 28-row table was hard to scan; grouping keeps each service type's 4
// priorities together and collapsed by default.
export default function SlaPoliciesPage() {
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

  // Summary shown on each collapsed row: how many of the 4 priorities have a
  // value set, so Admin can spot incomplete service types without opening each one.
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
    <div className="mx-auto max-w-3xl px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">SLA Policies</h1>
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
