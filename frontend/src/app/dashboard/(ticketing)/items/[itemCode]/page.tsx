"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { AuthUser, getCurrentUser } from "@/lib/auth";
import { getItem, ItemDetail, syncItemFromErp } from "@/lib/ticketing/masters";

function fmtRate(v: string | number | null | undefined) {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
}

// Item Detail page (2026-08-04) — item fields, per-warehouse stock
// breakdown, selling rate. Mirrors the Customer Detail page's structure.
export default function ItemDetailPage() {
  const params = useParams<{ itemCode: string }>();
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  useEffect(() => {
    getItem(decodeURIComponent(params.itemCode))
      .then(setItem)
      .catch((err) => setError(err instanceof ApiError ? "Item not found." : "Could not reach the server."))
      .finally(() => setLoading(false));
  }, [params.itemCode]);

  async function onSync() {
    if (!item) return;
    setSyncing(true);
    setSyncNotice(null);
    setSyncError(null);
    try {
      const updated = await syncItemFromErp(item.itemCode);
      setItem(updated);
      setSyncNotice("Synced from ERP — item, warehouse stock, and price-list rates refreshed.");
    } catch {
      setSyncError("Could not sync from ERP. Try again.");
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <div className="w-full px-6 py-8 text-sm text-muted">Loading…</div>;
  if (error || !item) return <div className="w-full px-6 py-8 text-sm text-brand-red">{error ?? "Not found."}</div>;

  return (
    <div className="w-full px-6 py-8">
      <Link href="/dashboard/items" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Items
      </Link>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-bold text-navy">{item.itemName}</h1>
          <span className="rounded-full bg-navy-tint px-2.5 py-0.5 text-[10px] font-bold text-navy">{item.itemGroup}</span>
          <span className="font-mono text-xs text-muted">{item.itemCode}</span>
        </div>
        {(user?.role === "MANAGER" || user?.role === "ADMIN") && (
          <button
            onClick={onSync}
            disabled={syncing}
            className="rounded-md bg-navy-tint px-3 py-1.5 text-xs font-bold text-navy transition disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync from ERP"}
          </button>
        )}
      </div>

      {syncNotice && <p className="mb-4 rounded-md bg-brand-green-bg px-3 py-2 text-xs text-brand-green">{syncNotice}</p>}
      {syncError && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{syncError}</p>}

      {/* Item fields */}
      <section className="mb-6 grid grid-cols-1 gap-4 rounded-lg border border-line bg-white p-5 sm:grid-cols-3">
        <Field label="UOM" value={item.uom} />
        <Field label="Standard Rate" value={fmtRate(item.standardRate)} />
        <Field label="Valuation Rate" value={fmtRate(item.valuationRate)} />
        <Field label="Selling Rate" value={item.sellingRate !== null ? fmtRate(item.sellingRate) : "No price list matched"} />
        <Field label="Current Stock (aggregate)" value={item.currentStock !== null ? String(item.currentStock) : "—"} />
        <Field label="Minimum Stock Level" value={item.minimumStockLevel !== null ? String(item.minimumStockLevel) : "—"} />
        <Field
          label="Compatible Equipment Categories"
          value={item.compatibleEquipmentCategories.length > 0 ? item.compatibleEquipmentCategories.join(", ") : "—"}
        />
        <Field label="Last Synced" value={item.lastSyncedAt ? new Date(item.lastSyncedAt).toLocaleString() : "—"} />
        <div className="sm:col-span-3">
          <Field label="Description" value={item.itemDescription ?? "—"} />
        </div>
      </section>

      {/* Per-warehouse stock */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-bold text-navy">Warehouse Stock ({item.warehouseStock.length})</h2>
        {item.warehouseStock.length === 0 ? (
          <p className="rounded-lg border border-line bg-white px-4 py-3 text-sm text-muted">No warehouse stock on record.</p>
        ) : (
          <table className="w-full rounded-lg border border-line bg-white text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
                <th className="px-4 py-3">Warehouse</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Valuation Rate</th>
              </tr>
            </thead>
            <tbody>
              {item.warehouseStock.map((w) => (
                <tr key={w.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-navy">{w.warehouse}</td>
                  <td className="px-4 py-3 text-muted">{w.actualQty}</td>
                  <td className="px-4 py-3 text-muted">{fmtRate(w.valuationRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-sm text-navy">{value}</p>
    </div>
  );
}
