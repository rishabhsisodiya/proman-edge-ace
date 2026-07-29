"use client";

import { useEffect, useState } from "react";
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
// (serviceType, priority). Replaces what used to be a hardcoded TS constant
// nobody but a developer could see or change; read live by TicketsService at
// creation and on service-type change (business-hours clock, §14.3).
export default function SlaPoliciesPage() {
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { responseHours: string; resolutionHours: string }>>({});

  function load() {
    setLoading(true);
    setError(null);
    listSlaPolicies()
      .then((data) => {
        setPolicies(data);
        const d: Record<string, { responseHours: string; resolutionHours: string }> = {};
        for (const p of data) d[key(p.serviceType, p.priority)] = { responseHours: String(p.responseHours), resolutionHours: String(p.resolutionHours) };
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
    <div className="mx-auto max-w-5xl px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">SLA Policies</h1>
      <p className="mb-6 text-sm text-muted">
        Response/resolution target hours per service type × priority, business-hours clock (08:00–18:00,
        Mon–Sat). A blank row has no SLA policy set — those tickets get no due dates at all until one is added here.
        Read live by the ticket-creation flow and whenever a ticket&apos;s service type is set/changed.
      </p>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
                <th className="px-4 py-3">Service Type</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Response (hrs)</th>
                <th className="px-4 py-3">Resolution (hrs)</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {SERVICE_TYPES.map((st) =>
                PRIORITIES.map((p) => {
                  const k = key(st, p);
                  const found = existing(st, p);
                  const draft = drafts[k] ?? { responseHours: "", resolutionHours: "" };
                  const busy = busyKey === k;
                  return (
                    <tr key={k} className="border-b border-line last:border-0">
                      <td className="px-4 py-2 text-navy">{SERVICE_TYPE_LABEL[st]}</td>
                      <td className="px-4 py-2 text-navy">{p}</td>
                      <td className="px-4 py-2">
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
                          className="h-8 w-20 rounded-md border border-line px-2 text-xs text-navy disabled:opacity-50"
                          placeholder="—"
                        />
                      </td>
                      <td className="px-4 py-2">
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
                          className="h-8 w-20 rounded-md border border-line px-2 text-xs text-navy disabled:opacity-50"
                          placeholder="—"
                        />
                      </td>
                      <td className="px-4 py-2 text-right">
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
                }),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
