"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { browseItems, ItemRecord } from "@/lib/ticketing/masters";

const PAGE_SIZE = 20;

function fmtRate(v: string | number | null | undefined) {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
}

// Item catalog List page (2026-08-04) — no dedicated master page existed
// before this; items only ever showed up inside FSV/Quotation item pickers.
// Same pattern as the Customers List page: shows every item alphabetically
// by default, paginated; search narrows the same result set.
export default function ItemsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<ItemRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const handle = setTimeout(() => {
      browseItems({ search: search.trim() || undefined, page, pageSize: PAGE_SIZE })
        .then((res) => {
          setItems(res.items);
          setTotal(res.total);
        })
        .catch((err) => {
          setError(err instanceof ApiError ? "Could not load items." : "Could not reach the server.");
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [search, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-1 text-xl font-bold text-navy">Items</h1>
      <p className="mb-6 text-sm text-muted">Search by item name or item code.</p>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by item name or code…"
          className="h-11 w-full max-w-sm rounded-md border border-line px-3 text-sm text-navy placeholder:text-text-disabled"
        />
      </div>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">No items match this search.</p>
      ) : (
        <>
          <table className="w-full rounded-lg border border-line bg-white text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
                <th className="px-4 py-3">Item Code</th>
                <th className="px-4 py-3">Item Name</th>
                <th className="px-4 py-3">Group</th>
                <th className="px-4 py-3">UOM</th>
                <th className="px-4 py-3">Standard Rate</th>
                <th className="px-4 py-3">Stock</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr
                  key={i.itemCode}
                  onClick={() => router.push(`/dashboard/items/${encodeURIComponent(i.itemCode)}`)}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-navy-tint"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/items/${encodeURIComponent(i.itemCode)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono text-xs font-medium text-navy hover:underline"
                    >
                      {i.itemCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-navy">{i.itemName}</td>
                  <td className="px-4 py-3 text-muted">{i.itemGroup}</td>
                  <td className="px-4 py-3 text-muted">{i.uom}</td>
                  <td className="px-4 py-3 text-muted">{fmtRate(i.standardRate)}</td>
                  <td className="px-4 py-3 text-muted">{i.currentStock ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex items-center justify-between text-xs text-muted">
            <span>
              {total} item{total === 1 ? "" : "s"} · page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-line px-3 py-1.5 font-bold text-navy disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-md border border-line px-3 py-1.5 font-bold text-navy disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
