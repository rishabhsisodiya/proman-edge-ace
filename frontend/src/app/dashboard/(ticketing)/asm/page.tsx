"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import {
  Paginated,
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

  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [assigned, setAssigned] = useState("");
  const [slaBreached, setSlaBreached] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 25;
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function onSort(key: string) {
    if (key === sortBy) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("asc");
    }
  }

  useEffect(() => {
    apiFetch<Paginated<Ticket>>("/tickets?pageSize=500")
      .then((res) => setAllTickets(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [status, priority, serviceType, assigned, slaBreached]);

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
  }, [status, priority, serviceType, assigned, slaBreached, page, sortBy, sortDir]);

  const stats = useMemo(() => {
    const open = allTickets.filter((t) => t.status !== "CLOSED").length;
    const pendingAcceptance = allTickets.filter((t) => t.status === "ENGINEER_ASSIGNED").length;
    const unassigned = allTickets.filter((t) => !t.assignedEngineer && t.status !== "CLOSED").length;
    const slaBreachedCount = allTickets.filter((t) => worstSlaStatus(t) === "BREACHED").length;
    return { open, pendingAcceptance, unassigned, slaBreachedCount };
  }, [allTickets]);

  function quickFilter(preset: "unassigned" | "pending" | "all") {
    setStatus(preset === "pending" ? "ENGINEER_ASSIGNED" : "");
    setAssigned(preset === "unassigned" ? "false" : "");
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

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Tile label="Open tickets (territory)" value={stats.open} />
        <Tile label="Unassigned" value={stats.unassigned} accent={stats.unassigned > 0 ? "text-brand-amber" : undefined} />
        <Tile label="Pending engineer acceptance" value={stats.pendingAcceptance} />
        <Tile label="SLA breached" value={stats.slaBreachedCount} accent={stats.slaBreachedCount > 0 ? "text-brand-red" : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-3 shadow-[0_1px_4px_rgba(42,47,105,.06)]">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => quickFilter("unassigned")}
            className="rounded-md bg-navy-tint px-3 py-1.5 text-xs font-bold text-navy hover:bg-navy hover:text-white"
          >
            Unassigned
          </button>
          <button
            onClick={() => quickFilter("pending")}
            className="rounded-md bg-navy-tint px-3 py-1.5 text-xs font-bold text-navy hover:bg-navy hover:text-white"
          >
            Pending Acceptance
          </button>
          <button
            onClick={() => setSlaBreached((v) => !v)}
            className={`rounded-md px-3 py-1.5 text-xs font-bold ${slaBreached ? "bg-brand-red text-white" : "bg-navy-tint text-navy hover:bg-navy hover:text-white"}`}
          >
            SLA Breached
          </button>
          <button
            onClick={() => {
              quickFilter("all");
              setSlaBreached(false);
            }}
            className="rounded-md bg-navy-tint px-3 py-1.5 text-xs font-bold text-navy hover:bg-navy hover:text-white"
          >
            Clear
          </button>
        </div>

        <div className="ml-auto flex flex-wrap gap-3">
          <select
            value={assigned}
            onChange={(e) => setAssigned(e.target.value)}
            className="rounded-lg border border-line px-3 py-1.5 text-sm"
          >
            <option value="">Assigned + Unassigned</option>
            <option value="true">Assigned</option>
            <option value="false">Unassigned</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-line px-3 py-1.5 text-sm"
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
            className="rounded-lg border border-line px-3 py-1.5 text-sm"
          >
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            className="rounded-lg border border-line px-3 py-1.5 text-sm"
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
            <SortableTh label="Engineer" sortKey="engineerName" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={5} className="px-4 py-3 text-center text-muted">
                Loading…
              </td>
            </tr>
          )}
          {!loading && error && (
            <tr>
              <td colSpan={5} className="px-4 py-3 text-center text-brand-red">
                {error}
              </td>
            </tr>
          )}
          {!loading && !error && tickets.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-3 text-center text-muted">
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
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${PRIORITY_STYLE[t.priority]}`}>{t.priority}</span>
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
              <td className="px-4">{t.assignedEngineer?.fullName ?? "Unassigned"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
