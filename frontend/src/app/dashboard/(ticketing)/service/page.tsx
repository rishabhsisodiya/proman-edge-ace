"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { AuthUser, getCurrentUser } from "@/lib/auth";
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
  Region,
  ServiceType,
} from "@/lib/ticketing/types";
import { Pagination } from "@/components/Pagination";
import { SortableTh } from "@/components/SortableTh";

const REGIONS: Region[] = ["NORTH", "SOUTH", "EAST", "WEST", "CENTRAL", "BANGLADESH"];
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

export default function TicketsListPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  const [region, setRegion] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [assigned, setAssigned] = useState("");
  const [slaBreached, setSlaBreached] = useState(false);
  const [tags, setTags] = useState("");
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

  // Stat tiles must reflect the whole board regardless of active filters —
  // sourced from a separate unfiltered fetch, same pattern as the ASM page.
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  useEffect(() => {
    apiFetch<Paginated<Ticket>>("/tickets?pageSize=5000")
      .then((res) => setAllTickets(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setPage(1);
  }, [region, priority, status, serviceType, assigned, slaBreached, tags]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (region) params.set("region", region);
    if (priority) params.set("priority", priority);
    if (status) params.set("status", status);
    if (serviceType) params.set("serviceType", serviceType);
    if (assigned) params.set("assigned", assigned);
    if (slaBreached) params.set("slaBreached", "true");
    if (tags.trim()) params.set("tags", tags.trim());
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
  }, [region, priority, status, serviceType, assigned, slaBreached, tags, page, sortBy, sortDir]);

  const stats = useMemo(() => {
    const open = allTickets.filter((t) => t.status !== "CLOSED").length;
    const unassigned = allTickets.filter((t) => !t.assignedEngineer && t.status !== "CLOSED").length;
    const slaAtRisk = allTickets.filter((t) => worstSlaStatus(t) === "WARNING_90").length;
    const breached = allTickets.filter((t) => worstSlaStatus(t) === "BREACHED").length;
    return { open, unassigned, slaAtRisk, breached };
  }, [allTickets]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-black text-navy">Tickets</h2>
          <p className="text-sm text-muted">Filterable ticket list</p>
        </div>
        {user && ["CALL_CENTER", "ASM", "MANAGER", "ADMIN"].includes(user.role) && (
          <button
            onClick={() => router.push("/dashboard/tickets/new")}
            className="h-10 rounded-md bg-orange px-4 text-sm font-bold text-navy"
          >
            + New Ticket
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Tile label="Open tickets" value={stats.open} />
        <Tile label="Unassigned" value={stats.unassigned} accent={stats.unassigned > 0 ? "text-brand-amber" : undefined} />
        <Tile label="SLA at risk" value={stats.slaAtRisk} accent={stats.slaAtRisk > 0 ? "text-brand-amber" : undefined} />
        <Tile label="SLA breached" value={stats.breached} accent={stats.breached > 0 ? "text-brand-red" : undefined} />
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg border border-line bg-white p-3 shadow-[0_1px_4px_rgba(42,47,105,.06)]">
        {/* ASM/Manager are always region-scoped server-side to their own
            assigned region(s) — showing "All regions" here implied a
            visibility they don't have (2026-08-04 fix, alongside the
            backend bug where picking a different region actually leaked
            that region's tickets). Only Call Center/Admin (org-wide) get this filter. */}
        {user && (user.role === "CALL_CENTER" || user.role === "ADMIN") && (
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="rounded-lg border border-line px-3 py-1.5 text-sm"
          >
            <option value="">All regions</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="rounded-lg border border-line px-3 py-1.5 text-sm"
        >
          <option value="">All priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-line px-3 py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
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
        <select
          value={assigned}
          onChange={(e) => setAssigned(e.target.value)}
          className="rounded-lg border border-line px-3 py-1.5 text-sm"
        >
          <option value="">Assigned + Unassigned</option>
          <option value="true">Assigned</option>
          <option value="false">Unassigned</option>
        </select>
        <button
          onClick={() => setSlaBreached((v) => !v)}
          className={`rounded-lg px-3 py-1.5 text-sm font-bold ${slaBreached ? "bg-brand-red text-white" : "border border-line bg-white text-navy hover:bg-navy-tint"}`}
        >
          SLA Breached
        </button>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Search tags (comma-separated)"
          className="rounded-lg border border-line px-3 py-1.5 text-sm"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-white shadow-[0_1px_4px_rgba(42,47,105,.06)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="h-10 bg-navy text-left text-[10px] uppercase tracking-wider text-white">
              <SortableTh label="Ticket" sortKey="ticketNo" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
              <SortableTh label="Customer / Site" sortKey="customerName" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
              <th className="px-4 font-bold">Equipment / Issue</th>
              <SortableTh label="Priority" sortKey="priority" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
              <SortableTh label="Status" sortKey="status" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
              <SortableTh label="Warranty" sortKey="warrantyEligible" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
              <SortableTh label="Region" sortKey="region" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
              <SortableTh label="Engineer" sortKey="engineerName" currentSort={sortBy} currentDir={sortDir} onSort={onSort} />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr className="h-11">
                <td colSpan={8} className="px-4 text-center text-muted">
                  Loading tickets…
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr className="h-11">
                <td colSpan={8} className="px-4 text-center text-brand-red">
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && tickets.length === 0 && (
              <tr className="h-11">
                <td colSpan={8} className="px-4 text-center text-muted">
                  No tickets match these filters.
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              tickets.map((t, i) => (
                <tr
                  key={t.id}
                  onClick={() => router.push(`/dashboard/tickets/${t.id}`)}
                  className={`h-11 cursor-pointer border-b border-line last:border-0 hover:bg-navy-tint ${i % 2 === 1 ? "bg-navy-soft" : "bg-white"}`}
                >
                  <td className="px-4 font-mono text-xs text-muted">{t.ticketNo}</td>
                  <td className="px-4">{t.customer.customerName}</td>
                  <td className="px-4">{t.equipment?.itemName ?? "—"}</td>
                  <td className="px-4">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${PRIORITY_STYLE[t.priority]}`}>
                      {PRIORITY_LABEL[t.priority]}
                    </span>
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
                  <td className="px-4">{t.customer.region}</td>
                  <td className="px-4">{t.assignedEngineer?.fullName ?? "Unassigned"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
    </div>
  );
}
