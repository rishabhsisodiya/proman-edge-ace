"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { browseCustomers, CustomerListItem } from "@/lib/ticketing/masters";
import { Region } from "@/lib/ticketing/types";

const REGIONS: Region[] = ["NORTH", "SOUTH", "EAST", "WEST", "CENTRAL", "BANGLADESH"];
const ACCOUNT_STATUSES = ["ACTIVE", "INACTIVE", "BLACKLISTED"];
const PAGE_SIZE = 20;

const ACCOUNT_STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-brand-green-bg text-brand-green",
  INACTIVE: "bg-brand-amber-bg text-brand-amber",
  BLACKLISTED: "bg-brand-red-bg text-brand-red",
};

// §10.1 W-17 Customer List (Call Center/ASM/Manager) — "Search/filter
// customers. Link to Customer Detail." Shows every customer alphabetically,
// paginated, by default; search/region just narrow the same result set.
export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState<Region | "">("");
  const [accountStatus, setAccountStatus] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<CustomerListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [search, region, accountStatus]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const handle = setTimeout(() => {
      browseCustomers({
        search: search.trim() || undefined,
        region: region || undefined,
        accountStatus: accountStatus || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
        .then((res) => {
          setItems(res.items);
          setTotal(res.total);
        })
        .catch((err) => {
          setError(err instanceof ApiError ? "Could not load customers." : "Could not reach the server.");
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, region, accountStatus, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-1 text-xl font-bold text-navy">Customers</h1>
      <p className="mb-6 text-sm text-muted">Search or filter by region to find a customer.</p>

      <div className="mb-4 flex flex-wrap gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by customer name…"
          className="h-11 w-full max-w-sm rounded-md border border-line px-3 text-sm text-navy placeholder:text-text-disabled"
        />
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value as Region | "")}
          className="h-11 rounded-md border border-line px-3 text-sm text-navy"
        >
          <option value="">All regions</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={accountStatus}
          onChange={(e) => setAccountStatus(e.target.value)}
          className="h-11 rounded-md border border-line px-3 text-sm text-navy"
        >
          <option value="">All statuses</option>
          {ACCOUNT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">No customers match this search.</p>
      ) : (
        <>
          <table className="w-full rounded-lg border border-line bg-white text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Region</th>
                <th className="px-4 py-3">Account Status</th>
                <th className="px-4 py-3">Review</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/dashboard/customers/${c.id}`)}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-navy-tint"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/customers/${c.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-navy hover:underline"
                    >
                      {c.customerName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{c.region ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${ACCOUNT_STATUS_STYLE[c.accountStatus] ?? ""}`}
                    >
                      {c.accountStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.needsReview && (
                      <span className="rounded-full bg-brand-amber-bg px-2.5 py-0.5 text-[10px] font-bold text-brand-amber">
                        Needs Review
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex items-center justify-between text-xs text-muted">
            <span>
              {total} customer{total === 1 ? "" : "s"} · page {page} of {totalPages}
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
