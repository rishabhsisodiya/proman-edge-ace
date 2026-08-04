"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  Paginated,
  PRIORITY_LABEL,
  PRIORITY_STYLE,
  STATUS_LABEL,
  STATUS_STYLE,
  SERVICE_TYPE_LABEL,
  SLA_STATUS_LABEL,
  SLA_STATUS_STYLE,
  worstSlaStatus,
  Ticket,
  TicketStatus,
  Priority,
  ServiceType,
} from "@/lib/ticketing/types";
import { Pagination } from "@/components/Pagination";
import { SortableTh } from "@/components/SortableTh";
import { getTodayAmcVisits, TodayAmcVisit } from "@/lib/ticketing/amc";
import { useSessionState } from "@/lib/useSessionState";

// sessionStorage keys — filters survive a trip to the ticket detail page and
// back, cleared when the tab closes (client request, 2026-08-04).
const FK = {
  status: "asmDashboard:status",
  priority: "asmDashboard:priority",
  serviceType: "asmDashboard:serviceType",
  assigned: "asmDashboard:assigned",
  slaBreached: "asmDashboard:slaBreached",
  rejected: "asmDashboard:rejected",
  tags: "asmDashboard:tags",
  search: "asmDashboard:search",
  page: "asmDashboard:page",
  sortBy: "asmDashboard:sortBy",
  sortDir: "asmDashboard:sortDir",
};

const PRIORITIES: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const STATUSES: TicketStatus[] = Object.keys(STATUS_LABEL) as TicketStatus[];
const SERVICE_TYPES: ServiceType[] = Object.keys(SERVICE_TYPE_LABEL) as ServiceType[];

function Tile({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-[0_1px_4px_rgba(42,47,105,.06)]">
      <p className="text-xs font-bold uppercase tracking-wider text-navy">{label}</p>
      <p className={`mt-1 text-[28px] font-black leading-none ${accent ?? "text-navy"}`}>{value}</p>
    </div>
  );
}

// §6.1 ASM dashboard: territory tickets, consolidated + filterable (Ashwath
// feedback, 25 Jul 2026). List itself is already territory-scoped
// server-side (TicketsService.list — ASM sees only their regions, §15.2), so
// no region filter here. Stat tiles are intentionally sourced from a
// separate unfiltered fetch — they must stay accurate regardless of the
// active filters, confirmed with the client.
export default function AsmDashboardPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [todayVisits, setTodayVisits] = useState<TodayAmcVisit[]>([]);

  const [status, setStatus] = useSessionState(FK.status, "");
  const [priority, setPriority] = useSessionState(FK.priority, "");
  const [serviceType, setServiceType] = useSessionState(FK.serviceType, "");
  const [assigned, setAssigned] = useSessionState(FK.assigned, "");
  const [slaBreached, setSlaBreached] = useSessionState(FK.slaBreached, false);
  const [rejected, setRejected] = useSessionState(FK.rejected, false);
  const [tags, setTags] = useSessionState(FK.tags, "");
  const [search, setSearch] = useSessionState(FK.search, "");
  const [page, setPage] = useSessionState(FK.page, 1);
  const [total, setTotal] = useState(0);
  const pageSize = 25;
  const [sortBy, setSortBy] = useSessionState(FK.sortBy, "createdAt");
  const [sortDir, setSortDir] = useSessionState<"asc" | "desc">(FK.sortDir, "desc");

  // Debounced separately from `search` itself so the persisted value updates
  // as the user types (survives an immediate nav-away) without firing a
  // request per keystroke.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  function onSort(key: string) {
    if (key === sortBy) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("asc");
    }
  }

  useEffect(() => {
    apiFetch<Paginated<Ticket>>("/tickets?pageSize=5000")
      .then((res) => setAllTickets(res.data))
      .catch(() => {});
    // §6.1 "Today's AMC visits" — was entirely missing (2026-08-04 fix).
    getTodayAmcVisits()
      .then(setTodayVisits)
      .catch(() => {});
  }, []);

  // Skip on mount — otherwise a restored page number gets clobbered back to 1
  // every time this page remounts (e.g. returning from a ticket's detail page).
  const filtersMounted = useRef(false);
  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return;
    }
    setPage(1);
  }, [status, priority, serviceType, assigned, slaBreached, rejected, tags, debouncedSearch]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    else params.set("excludeClosed", "true"); // default view excludes Closed unless explicitly chosen
    if (priority) params.set("priority", priority);
    if (serviceType) params.set("serviceType", serviceType);
    if (assigned) params.set("assigned", assigned);
    if (slaBreached) params.set("slaBreached", "true");
    if (rejected) params.set("rejected", "true");
    if (tags.trim()) params.set("tags", tags.trim());
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
    params.set("sortBy", sortBy);
    params.set("sortDir", sortDir);

    apiFetch<Paginated<Ticket>>(`/tickets?${params.toString()}`)
      .then((res) => {
        setTickets(res.data);
        setTotal(res.total);
      })
      .catch(() => setError("Could not load tickets. Is the backend running and seeded?"))
      .finally(() => setLoading(false));
  }, [status, priority, serviceType, assigned, slaBreached, rejected, tags, debouncedSearch, page, sortBy, sortDir]);

  const stats = useMemo(() => {
    const open = allTickets.filter((t) => t.status !== "CLOSED").length;
    const pendingAcceptance = allTickets.filter((t) => t.status === "ENGINEER_ASSIGNED").length;
    const unassigned = allTickets.filter((t) => !t.assignedEngineer && t.status !== "CLOSED").length;
    const slaBreachedCount = allTickets.filter((t) => worstSlaStatus(t) === "BREACHED").length;
    const rejectedCount = allTickets.filter((t) => (t.rejectionCount ?? 0) > 0 && t.status !== "CLOSED").length;
    return { open, pendingAcceptance, unassigned, slaBreachedCount, rejectedCount };
  }, [allTickets]);

  function quickFilter(preset: "unassigned" | "pending" | "rejected" | "all") {
    setStatus(preset === "pending" ? "ENGINEER_ASSIGNED" : "");
    setAssigned(preset === "unassigned" ? "false" : "");
    setRejected(preset === "rejected");
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-black text-navy">ASM Dashboard</h2>
          <p className="text-sm text-muted">Your territory's tickets</p>
        </div>
        <button
          onClick={() => router.push("/dashboard/tickets/new")}
          className="h-10 rounded-md bg-orange px-4 text-sm font-bold text-navy"
        >
          + New Ticket
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Tile label="Open tickets (territory)" value={stats.open} />
        <Tile label="Unassigned" value={stats.unassigned} accent={stats.unassigned > 0 ? "text-brand-amber" : undefined} />
        <Tile label="Pending engineer acceptance" value={stats.pendingAcceptance} />
        <Tile label="SLA breached" value={stats.slaBreachedCount} accent={stats.slaBreachedCount > 0 ? "text-brand-red" : undefined} />
        <Tile
          label="Rejected — needs reassignment"
          value={stats.rejectedCount}
          accent={stats.rejectedCount > 0 ? "text-brand-amber" : undefined}
        />
      </div>

      {todayVisits.length > 0 && (
        <div className="rounded-lg border border-line bg-white p-4 shadow-[0_1px_4px_rgba(42,47,105,.06)]">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-navy">Today&apos;s AMC Visits ({todayVisits.length})</p>
          <div className="flex flex-wrap gap-2">
            {todayVisits.map((v) => (
              <div key={v.id} className="rounded-md bg-navy-soft px-3 py-2 text-xs">
                <span className="font-bold text-navy">{v.contract.customer.customerName}</span>
                <span className="text-muted"> — {v.equipment?.itemName ?? "Equipment n/a"} ({v.contract.contractReferenceNo})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 overflow-x-auto rounded-lg border border-line bg-white p-3 shadow-[0_1px_4px_rgba(42,47,105,.06)]">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ticket no., subject, customer, equipment serial no..."
          className="h-9 w-72 shrink-0 rounded-md border border-line px-3 text-xs"
        />
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => quickFilter("unassigned")}
            className="h-9 shrink-0 whitespace-nowrap rounded-md bg-navy-tint px-3 text-xs font-bold text-navy hover:bg-navy hover:text-white"
          >
            Unassigned
          </button>
          <button
            onClick={() => quickFilter("pending")}
            className="h-9 shrink-0 whitespace-nowrap rounded-md bg-navy-tint px-3 text-xs font-bold text-navy hover:bg-navy hover:text-white"
          >
            Pending Acceptance
          </button>
          <button
            onClick={() => setSlaBreached((v) => !v)}
            className={`h-9 shrink-0 whitespace-nowrap rounded-md px-3 text-xs font-bold ${slaBreached ? "bg-brand-red text-white" : "bg-navy-tint text-navy hover:bg-navy hover:text-white"}`}
          >
            SLA Breached
          </button>
          <button
            onClick={() => quickFilter(rejected ? "all" : "rejected")}
            className={`h-9 shrink-0 whitespace-nowrap rounded-md px-3 text-xs font-bold ${rejected ? "bg-brand-amber text-white" : "bg-navy-tint text-navy hover:bg-navy hover:text-white"}`}
          >
            Rejected
          </button>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Search tags (comma-separated)"
            className="h-9 shrink-0 rounded-md border border-line px-3 text-xs"
          />
          <button
            onClick={() => {
              quickFilter("all");
              setSlaBreached(false);
              setTags("");
              setSearch("");
              setPriority("");
              setServiceType("");
            }}
            className="h-9 shrink-0 whitespace-nowrap rounded-md bg-navy-tint px-3 text-xs font-bold text-navy hover:bg-navy hover:text-white"
          >
            Clear all
          </button>
        </div>

        <div className="ml-auto flex shrink-0 gap-3">
          <select
            value={assigned}
            onChange={(e) => setAssigned(e.target.value)}
            className="h-9 shrink-0 rounded-md border border-line px-3 text-xs text-navy"
          >
            <option value="">Assigned + Unassigned</option>
            <option value="true">Assigned</option>
            <option value="false">Unassigned</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 shrink-0 rounded-md border border-line px-3 text-xs text-navy"
          >
            <option value="">All statuses (excl. Closed)</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="h-9 shrink-0 rounded-md border border-line px-3 text-xs text-navy"
          >
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            className="h-9 shrink-0 rounded-md border border-line px-3 text-xs text-navy"
          >
            <option value="">All service types</option>
            {SERVICE_TYPES.map((s) => (
              <option key={s} value={s}>
                {SERVICE_TYPE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <TicketTable
        tickets={tickets}
        loading={loading}
        error={error}
        onRowClick={(id) => router.push(`/dashboard/tickets/${id}`)}
        emptyText="No tickets match these filters."
        sortBy={sortBy}
        sortDir={sortDir}
        onSort={onSort}
      />

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
    </div>
  );
}

function TicketTable({
  tickets,
  loading,
  error,
  onRowClick,
  emptyText,
  sortBy,
  sortDir,
  onSort,
}: {
  tickets: Ticket[];
  loading: boolean;
  error: string | null;
  onRowClick: (id: string) => void;
  emptyText: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="h-10 bg-navy text-left text-[10px] uppercase tracking-wider text-white">
            <SortableTh label="Ticket" sortKey="ticketNo" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
            <SortableTh label="Customer" sortKey="customerName" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
            <SortableTh label="Priority" sortKey="priority" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
            <SortableTh label="Status" sortKey="status" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
            <SortableTh label="Warranty" sortKey="warrantyEligible" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
            <SortableTh label="Engineer" sortKey="engineerName" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={6} className="px-4 py-3 text-center text-muted">
                Loading…
              </td>
            </tr>
          )}
          {!loading && error && (
            <tr>
              <td colSpan={6} className="px-4 py-3 text-center text-brand-red">
                {error}
              </td>
            </tr>
          )}
          {!loading && !error && tickets.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-3 text-center text-muted">
                {emptyText}
              </td>
            </tr>
          )}
          {tickets.map((t, i) => (
            <tr
              key={t.id}
              onClick={() => onRowClick(t.id)}
              className={`h-11 cursor-pointer border-b border-line last:border-0 hover:bg-navy-tint ${i % 2 === 1 ? "bg-navy-soft" : "bg-white"}`}
            >
              <td className="px-4 font-mono text-xs text-muted">{t.ticketNo}</td>
              <td className="px-4">{t.customer.customerName}</td>
              <td className="px-4">
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${PRIORITY_STYLE[t.priority]}`}>{PRIORITY_LABEL[t.priority]}</span>
              </td>
              <td className="px-4">
                <div className="flex flex-wrap gap-1">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[t.status]}`}>
                    {STATUS_LABEL[t.status]}
                  </span>
                  {worstSlaStatus(t) !== "ON_TRACK" && (
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${SLA_STATUS_STYLE[worstSlaStatus(t)]}`}>
                      {SLA_STATUS_LABEL[worstSlaStatus(t)]}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-4">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    t.warrantyEligible ? "bg-brand-green-bg text-brand-green" : "bg-navy-soft text-muted"
                  }`}
                >
                  {t.warrantyEligible ? "Under Warranty" : "Chargeable"}
                </span>
              </td>
              <td className="px-4">{t.assignedEngineer?.fullName ?? "Unassigned"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
