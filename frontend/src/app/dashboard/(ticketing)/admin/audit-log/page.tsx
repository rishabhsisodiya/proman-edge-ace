"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { AuditLogEntry, listAuditLog } from "@/lib/ticketing/audit-log";
import { Pagination } from "@/components/Pagination";

const ENTITY_TYPES = ["TICKET", "FSV", "AMC", "QUOTATION", "USER"] as const;

const ENTITY_LABEL: Record<string, string> = {
  TICKET: "Ticket",
  FSV: "Field Service Visit",
  AMC: "AMC Contract",
  QUOTATION: "Quotation",
  USER: "User",
};

const ENTITY_STYLE: Record<string, string> = {
  TICKET: "bg-navy-tint text-navy",
  FSV: "bg-brand-amber-bg text-brand-amber",
  AMC: "bg-brand-green-bg text-brand-green",
  QUOTATION: "bg-brand-red-bg text-brand-red",
  USER: "bg-navy-soft text-muted",
};

const SOURCE_LABEL: Record<string, string> = {
  WEB_UI: "Web",
  API: "API",
  SYSTEM_JOB: "System",
};

/** Links to the record's own detail page where one exists — User Management has no per-user route, so USER entries render without a link. */
function entityHref(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case "TICKET":
      return `/dashboard/tickets/${entityId}`;
    case "FSV":
      return `/dashboard/fsv/${entityId}`;
    case "QUOTATION":
      return `/dashboard/quotations/${entityId}`;
    case "AMC":
      return `/dashboard/admin/amc-contracts/${entityId}`;
    default:
      return null;
  }
}

// Admin "Audit Log" viewer (2026-08-03, client request) — cross-entity view
// over the same AuditLog table Ticket's own Timeline tab and the automatic
// FSV/AMC/Quotation/User diffing hook both write into. Admin-only, per the
// backend's own role gate — this is broad, sensitive visibility across
// every field change in the system.
export default function AuditLogPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [entityType, setEntityType] = useState("");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  useEffect(() => {
    setPage(1);
  }, [entityType, search, dateFrom, dateTo]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Debounced — search/date changes shouldn't fire a request per keystroke.
    const handle = setTimeout(() => {
      listAuditLog({ entityType: entityType || undefined, search: search.trim() || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, page, pageSize })
        .then((res) => {
          setEntries(res.data);
          setTotal(res.total);
        })
        .catch((err) => {
          if (err instanceof ApiError && err.status === 403) setError("Admin access required.");
          else setError("Could not load audit log.");
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [entityType, search, dateFrom, dateTo, page]);

  return (
    <div className="w-full px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <h1 className="mb-1 text-xl font-bold text-navy">Audit Log</h1>
      <p className="mb-6 text-sm text-muted">
        Every recorded field change across Tickets, Field Service Visits, AMC Contracts, Quotations, and Users.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-3">
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Entity Type</label>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="h-9 rounded-md border border-line px-3 text-sm text-navy"
          >
            <option value="">All types</option>
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENTITY_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Field name or value…"
            className="h-9 w-56 rounded-md border border-line px-3 text-sm text-navy"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-9 rounded-md border border-line px-3 text-sm text-navy"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold text-navy">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-9 rounded-md border border-line px-3 text-sm text-navy"
          />
        </div>
        {(entityType || search || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setEntityType("");
              setSearch("");
              setDateFrom("");
              setDateTo("");
            }}
            className="h-9 rounded-md bg-navy-tint px-3 text-xs font-bold text-navy hover:bg-navy hover:text-white"
          >
            Clear Filters
          </button>
        )}
      </div>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Field</th>
              <th className="px-4 py-3">Old Value</th>
              <th className="px-4 py-3">New Value</th>
              <th className="px-4 py-3">Changed By</th>
              <th className="px-4 py-3">Source</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && !error && entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted">
                  No audit entries match these filters.
                </td>
              </tr>
            )}
            {!loading &&
              entries.map((e) => {
                const href = entityHref(e.entityType, e.entityId);
                return (
                  <tr key={e.id} className="border-b border-line text-xs last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">{new Date(e.changedAt).toLocaleString()}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ENTITY_STYLE[e.entityType] ?? "bg-navy-soft text-muted"}`}>
                          {ENTITY_LABEL[e.entityType] ?? e.entityType}
                        </span>
                        {href ? (
                          <a href={href} className="font-bold text-navy underline">
                            {e.entityLabel}
                          </a>
                        ) : (
                          <span className="text-navy">{e.entityLabel}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-navy">{e.fieldName}</td>
                    <td className="max-w-[220px] truncate px-4 py-2.5 text-muted" title={e.oldValue ?? ""}>
                      {e.oldValue ?? "—"}
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-2.5 text-navy" title={e.newValue ?? ""}>
                      {e.newValue ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-navy">{e.changedByName}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-full bg-navy-soft px-2 py-0.5 text-[10px] font-bold text-muted">
                        {SOURCE_LABEL[e.changeSource] ?? e.changeSource}
                      </span>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} itemLabel="entry" />
    </div>
  );
}
