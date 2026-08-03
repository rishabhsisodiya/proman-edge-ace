"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  createServiceType,
  listServiceTypes,
  ServiceTypeConfigRow,
  updateServiceTypeConfig,
} from "@/lib/ticketing/service-types";

// Service Types Tier 1 (2026-08-02, client-agreed minimal scope) — Admin can
// add a new service type and toggle existing ones active/inactive. No hard
// delete: a row already referenced by real tickets (or system-managed, like
// AMC/Warranty Renewal Outreach) must stay addressable — "remove" always
// means isActive: false, which just hides it from the ticket-creation
// dropdown going forward.
export default function ServiceTypesPage() {
  const [rows, setRows] = useState<ServiceTypeConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [savingCode, setSavingCode] = useState<string | null>(null);

  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [creating, setCreating] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    listServiceTypes()
      .then((data) => {
        setRows(data);
        setLabelDrafts(Object.fromEntries(data.map((r) => [r.code, r.label])));
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Admin access required.");
        else setError("Could not load service types.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function onSaveLabel(code: string) {
    const label = labelDrafts[code]?.trim();
    if (!label) {
      setError("Label cannot be blank.");
      return;
    }
    setSavingCode(code);
    setError(null);
    try {
      await updateServiceTypeConfig(code, { label });
      load();
    } catch {
      setError("Could not save this service type.");
    } finally {
      setSavingCode(null);
    }
  }

  async function onToggleActive(row: ServiceTypeConfigRow) {
    setSavingCode(row.code);
    setError(null);
    try {
      await updateServiceTypeConfig(row.code, { isActive: !row.isActive });
      load();
    } catch {
      setError("Could not update this service type.");
    } finally {
      setSavingCode(null);
    }
  }

  async function onCreate() {
    const code = newCode.trim().toUpperCase().replace(/\s+/g, "_");
    const label = newLabel.trim();
    if (!code || !label) {
      setError("Both code and label are required.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createServiceType(code, label);
      setNewCode("");
      setNewLabel("");
      load();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string | string[] } | null;
        setError(Array.isArray(body?.message) ? body!.message.join(", ") : body?.message ?? "Could not create service type.");
      } else {
        setError("Could not create service type.");
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="w-full px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">Service Types</h1>
      <p className="mb-6 text-sm text-muted">
        Add new service types and edit labels. Inactive types no longer appear on the ticket-creation dropdown, but existing
        tickets keep their value. System-managed types (AMC, Warranty Renewal Outreach) are auto-used by the AMC/warranty
        engines and can&apos;t be deactivated from here.
      </p>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      <div className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-white p-3">
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Code</label>
          <input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="e.g. ONSITE_TRAINING"
            disabled={creating}
            className="h-9 w-56 rounded-md border border-line px-3 text-sm text-navy disabled:opacity-50"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Label</label>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Onsite Training"
            disabled={creating}
            className="h-9 w-64 rounded-md border border-line px-3 text-sm text-navy disabled:opacity-50"
          />
        </div>
        <button
          onClick={onCreate}
          disabled={creating}
          className="h-9 rounded-md bg-orange px-4 text-sm font-bold text-navy disabled:opacity-50"
        >
          {creating ? "Adding…" : "+ Add Service Type"}
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const busy = savingCode === r.code;
                return (
                  <tr key={r.code} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-muted">
                      {r.code}
                      {r.isSystemManaged && <span className="ml-2 rounded-full bg-navy-tint px-2 py-0.5 text-[10px] font-bold text-navy">System</span>}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={labelDrafts[r.code] ?? ""}
                        disabled={busy}
                        onChange={(e) => setLabelDrafts((d) => ({ ...d, [r.code]: e.target.value }))}
                        className="h-9 w-full max-w-xs rounded-md border border-line px-3 text-sm text-navy disabled:opacity-50"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          r.isActive ? "bg-brand-green-bg text-brand-green" : "bg-navy-soft text-muted"
                        }`}
                      >
                        {r.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => onSaveLabel(r.code)} disabled={busy} className="mr-3 text-xs font-bold text-navy disabled:opacity-50">
                        {busy ? "Saving…" : "Save Label"}
                      </button>
                      <button
                        onClick={() => onToggleActive(r)}
                        disabled={busy}
                        className={`text-xs font-bold disabled:opacity-50 ${r.isActive ? "text-brand-red" : "text-brand-green"}`}
                      >
                        {r.isActive ? "Deactivate" : "Activate"}
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
