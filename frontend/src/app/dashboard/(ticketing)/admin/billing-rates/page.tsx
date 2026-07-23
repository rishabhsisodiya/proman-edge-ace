"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { BillingRate, createBillingRate, deleteBillingRate, listBillingRates, updateBillingRate } from "@/lib/ticketing/billing-rates";

// §5.2 Billing Rates — engineer_level -> hourly rate, used to bill labour on
// chargeable Breakdown tickets at close. Level is free text (matches
// User.engineerLevel) since actual levels aren't fixed yet.
export default function BillingRatesPage() {
  const [rates, setRates] = useState<BillingRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newLevel, setNewLevel] = useState("");
  const [newRate, setNewRate] = useState("");
  const [adding, setAdding] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    listBillingRates()
      .then(setRates)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Admin access required.");
        else setError("Could not load billing rates.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newLevel.trim() || !newRate) return;
    setAdding(true);
    setError(null);
    try {
      await createBillingRate(newLevel.trim(), Number(newRate));
      setNewLevel("");
      setNewRate("");
      load();
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { message?: string }) : null;
      setError(body?.message ?? "Could not add rate — that level may already exist.");
    } finally {
      setAdding(false);
    }
  }

  async function onUpdate(id: string, hourlyRate: number) {
    setBusyId(id);
    try {
      await updateBillingRate(id, hourlyRate);
      load();
    } catch {
      setError("Could not update rate.");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: string) {
    setBusyId(id);
    try {
      await deleteBillingRate(id);
      load();
    } catch {
      setError("Could not delete rate.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">Billing Rates</h1>
      <p className="mb-6 text-sm text-muted">
        Engineer level → hourly rate, used to bill labour on chargeable Breakdown tickets when they close. An
        engineer&apos;s level is set on their user record; a level with no rate configured here means labour is
        simply left off that ticket&apos;s invoice until one is added.
      </p>

      <form onSubmit={onAdd} className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Engineer Level</label>
          <input
            type="text"
            value={newLevel}
            onChange={(e) => setNewLevel(e.target.value)}
            placeholder="e.g. Senior"
            className="h-9 w-48 rounded-md border border-line px-2 text-sm text-navy placeholder:text-text-disabled"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Hourly Rate (₹)</label>
          <input
            type="number"
            min={0}
            value={newRate}
            onChange={(e) => setNewRate(e.target.value)}
            className="h-9 w-32 rounded-md border border-line px-2 text-sm text-navy"
          />
        </div>
        <button
          type="submit"
          disabled={adding || !newLevel.trim() || !newRate}
          className="h-9 rounded-md bg-orange px-4 text-sm font-bold text-navy transition disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add Rate"}
        </button>
      </form>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rates.length === 0 ? (
        <p className="text-sm text-muted">No rates configured yet — add one above.</p>
      ) : (
        <table className="w-full rounded-lg border border-line bg-white text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
              <th className="px-4 py-3">Level</th>
              <th className="px-4 py-3">Hourly Rate (₹)</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-navy">{r.level}</td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min={0}
                    defaultValue={Number(r.hourlyRate)}
                    disabled={busyId === r.id}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== Number(r.hourlyRate)) onUpdate(r.id, v);
                    }}
                    className="h-8 w-28 rounded-md border border-line px-2 text-xs text-navy disabled:opacity-50"
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onDelete(r.id)}
                    disabled={busyId === r.id}
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
