"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  ErpPriceListOption,
  PriceList,
  createPriceList,
  deletePriceList,
  fetchErpPriceListOptions,
  listPriceLists,
  updatePriceList,
} from "@/lib/ticketing/price-lists";

// Admin-managed list of ERPNext Selling Price List names quotations can be
// created against (client has multiple; engineer/CS picks one per
// quotation instead of one hardcoded env default, see 2026-07-25 feedback).
// Only names are stored here — ERPNext stays the source of truth for the
// actual rates/rows behind each name.
export default function PriceListsPage() {
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);

  // Live ERP fetch (client request, 2026-08-05) — Admin picks from the real
  // ERPNext selling price lists instead of typing the exact name. Fetched
  // fresh each time this page loads, not synced/cached locally.
  const [erpOptions, setErpOptions] = useState<ErpPriceListOption[]>([]);
  const [erpLoading, setErpLoading] = useState(true);
  const [erpError, setErpError] = useState<string | null>(null);

  function loadErpOptions() {
    setErpLoading(true);
    setErpError(null);
    fetchErpPriceListOptions()
      .then(setErpOptions)
      .catch(() => setErpError("Could not fetch price lists from ERPNext."))
      .finally(() => setErpLoading(false));
  }

  useEffect(loadErpOptions, []);

  function load() {
    setLoading(true);
    setError(null);
    listPriceLists()
      .then(setPriceLists)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Admin access required.");
        else setError("Could not load price lists.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await createPriceList(newName.trim());
      setNewName("");
      load();
    } catch (err) {
      const body = err instanceof ApiError ? (err.body as { message?: string }) : null;
      setError(body?.message ?? "Could not add price list — that name may already exist.");
    } finally {
      setAdding(false);
    }
  }

  async function onMakeDefault(id: string) {
    setBusyId(id);
    try {
      await updatePriceList(id, { isDefault: true });
      load();
    } catch {
      setError("Could not set default.");
    } finally {
      setBusyId(null);
    }
  }

  async function onToggleActive(id: string, isActive: boolean) {
    setBusyId(id);
    try {
      await updatePriceList(id, { isActive: !isActive });
      load();
    } catch {
      setError("Could not update.");
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(id: string) {
    setBusyId(id);
    try {
      await deletePriceList(id);
      load();
    } catch {
      setError("Could not delete — it may already be used on a quotation.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="w-full px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">Selling Price Lists</h1>
      <p className="mb-6 text-sm text-muted">
        Price list names selectable when creating a Quotation. Only the name is stored here — ERPNext stays the
        source of truth for the actual item rates behind each list. The default is pre-selected on the Create
        Quotation form; inactive lists are hidden there but existing quotations keep whatever they were created
        with.
      </p>

      <form onSubmit={onAdd} className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Price List Name</label>
          {erpLoading ? (
            <p className="h-9 w-64 text-xs text-muted">Fetching from ERPNext…</p>
          ) : erpOptions.length === 0 ? (
            <p className="h-9 w-64 text-xs text-brand-red">
              {erpError ?? "No selling price lists found in ERPNext."}
            </p>
          ) : (
            <select
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-9 w-64 rounded-md border border-line px-2 text-sm text-navy"
            >
              <option value="">Select a price list…</option>
              {erpOptions
                .filter((o) => !priceLists.some((p) => p.name === o.name))
                .map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.name} ({o.currency})
                  </option>
                ))}
            </select>
          )}
        </div>
        <button
          type="submit"
          disabled={adding || !newName.trim()}
          className="h-9 rounded-md bg-orange px-4 text-sm font-bold text-navy transition disabled:opacity-50"
        >
          {adding ? "Adding…" : "Add Price List"}
        </button>
      </form>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : priceLists.length === 0 ? (
        <p className="text-sm text-muted">No price lists configured yet — add one above.</p>
      ) : (
        <table className="w-full rounded-lg border border-line bg-white text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Default</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {priceLists.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-navy">{p.name}</td>
                <td className="px-4 py-3">
                  {p.isDefault ? (
                    <span className="rounded-full bg-navy-tint px-2.5 py-0.5 text-[10px] font-bold text-navy">Default</span>
                  ) : (
                    <button
                      onClick={() => onMakeDefault(p.id)}
                      disabled={busyId === p.id || !p.isActive}
                      className="text-xs font-bold text-navy hover:underline disabled:opacity-50"
                    >
                      Make default
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onToggleActive(p.id, p.isActive)}
                    disabled={busyId === p.id || p.isDefault}
                    title={p.isDefault ? "Default list can't be deactivated" : undefined}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold disabled:opacity-50 ${
                      p.isActive ? "bg-brand-green-bg text-brand-green" : "bg-zinc-100 text-muted"
                    }`}
                  >
                    {p.isActive ? "Active" : "Inactive"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => onDelete(p.id)}
                    disabled={busyId === p.id || p.isDefault}
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
