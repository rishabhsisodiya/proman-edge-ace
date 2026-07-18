"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { PRIORITY_STYLE, STATUS_LABEL, STATUS_STYLE, Ticket, TicketStatus, Priority, Region } from "@/lib/ticketing/types";

const REGIONS: Region[] = ["NORTH", "SOUTH", "EAST", "WEST", "CENTRAL", "BANGLADESH"];
const PRIORITIES: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
const STATUSES: TicketStatus[] = Object.keys(STATUS_LABEL) as TicketStatus[];

function Tile({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-[0_1px_4px_rgba(42,47,105,.06)]">
      <p className="text-xs font-bold uppercase tracking-wider text-navy">{label}</p>
      <p className={`mt-1 text-[28px] font-black leading-none ${accent ?? "text-navy"}`}>{value}</p>
    </div>
  );
}

export default function ManagerDashboardPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [region, setRegion] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (region) params.set("region", region);
    if (priority) params.set("priority", priority);
    if (status) params.set("status", status);

    apiFetch<Ticket[]>(`/tickets?${params.toString()}`)
      .then(setTickets)
      .catch(() => setError("Could not load tickets. Is the backend running and seeded?"))
      .finally(() => setLoading(false));
  }, [region, priority, status]);

  const now = Date.now();
  const stats = useMemo(() => {
    const open = tickets.filter((t) => t.status !== "CLOSED").length;
    const unassigned = tickets.filter((t) => !t.assignedEngineer && t.status !== "CLOSED").length;
    const slaAtRisk = tickets.filter(
      (t) =>
        t.slaResolutionDue &&
        t.status !== "CLOSED" &&
        new Date(t.slaResolutionDue).getTime() - now < 2 * 60 * 60 * 1000,
    ).length;
    const breached = tickets.filter(
      (t) => t.slaResolutionDue && t.status !== "CLOSED" && new Date(t.slaResolutionDue).getTime() < now,
    ).length;
    return { open, unassigned, slaAtRisk, breached };
  }, [tickets, now]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-[22px] font-black text-navy">Manager Dashboard</h2>
        <p className="text-sm text-muted">Regional ticket overview and SLA status</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Tile label="Open tickets" value={stats.open} />
        <Tile label="Unassigned" value={stats.unassigned} accent={stats.unassigned > 0 ? "text-brand-amber" : undefined} />
        <Tile label="SLA at risk" value={stats.slaAtRisk} accent={stats.slaAtRisk > 0 ? "text-brand-amber" : undefined} />
        <Tile label="SLA breached" value={stats.breached} accent={stats.breached > 0 ? "text-brand-red" : undefined} />
      </div>

      <div className="flex flex-wrap gap-3 rounded-lg border border-line bg-white p-3 shadow-[0_1px_4px_rgba(42,47,105,.06)]">
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
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-white shadow-[0_1px_4px_rgba(42,47,105,.06)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="h-10 bg-navy text-left text-[10px] font-bold uppercase tracking-wider text-white">
              <th className="px-4">Ticket</th>
              <th className="px-4">Customer / Site</th>
              <th className="px-4">Equipment / Issue</th>
              <th className="px-4">Priority</th>
              <th className="px-4">Status</th>
              <th className="px-4">Region</th>
              <th className="px-4">Engineer</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr className="h-11">
                <td colSpan={7} className="px-4 text-center text-muted">
                  Loading tickets…
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr className="h-11">
                <td colSpan={7} className="px-4 text-center text-brand-red">
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && tickets.length === 0 && (
              <tr className="h-11">
                <td colSpan={7} className="px-4 text-center text-muted">
                  No tickets match these filters.
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              tickets.map((t, i) => (
                <tr
                  key={t.id}
                  className={`h-11 border-b border-line last:border-0 hover:bg-navy-tint ${i % 2 === 1 ? "bg-navy-soft" : "bg-white"}`}
                >
                  <td className="px-4 font-mono text-xs text-muted">{t.ticketNo}</td>
                  <td className="px-4">{t.customer.customerName}</td>
                  <td className="px-4">{t.equipment?.itemName ?? "—"}</td>
                  <td className="px-4">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${PRIORITY_STYLE[t.priority]}`}>
                      {t.priority}
                    </span>
                  </td>
                  <td className="px-4">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[t.status]}`}>
                      {STATUS_LABEL[t.status]}
                    </span>
                  </td>
                  <td className="px-4">{t.customer.region}</td>
                  <td className="px-4">{t.assignedEngineer?.fullName ?? "Unassigned"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
