"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { PRIORITY_STYLE, STATUS_LABEL, STATUS_STYLE, Ticket } from "@/lib/ticketing/types";

function Tile({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-[0_1px_4px_rgba(42,47,105,.06)]">
      <p className="text-xs font-bold uppercase tracking-wider text-navy">{label}</p>
      <p className={`mt-1 text-[28px] font-black leading-none ${accent ?? "text-navy"}`}>{value}</p>
    </div>
  );
}

// §6.1 ASM dashboard: territory open tickets, pending acceptance. Engineer
// availability map and today's AMC visits are skipped — no location data is
// populated yet (§8.6/User.currentGpsLat) and no AMC engine exists yet
// (Days 4-10, T2). List itself is already territory-scoped server-side
// (TicketsService.list — ASM sees only their regions, §15.2).
export default function AsmDashboardPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Ticket[]>("/tickets")
      .then(setTickets)
      .catch(() => setError("Could not load tickets. Is the backend running and seeded?"))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const open = tickets.filter((t) => t.status !== "CLOSED").length;
    const pendingAcceptance = tickets.filter((t) => t.status === "ENGINEER_ASSIGNED");
    const unassigned = tickets.filter((t) => !t.assignedEngineer && t.status !== "CLOSED");
    return { open, pendingAcceptance, unassigned };
  }, [tickets]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-black text-navy">ASM Dashboard</h2>
          <p className="text-sm text-muted">Your territory's open tickets and pending acceptances</p>
        </div>
        <button
          onClick={() => router.push("/dashboard/tickets/new")}
          className="h-10 rounded-md bg-orange px-4 text-sm font-bold text-navy"
        >
          + New Ticket
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Tile label="Open tickets (territory)" value={stats.open} />
        <Tile label="Unassigned" value={stats.unassigned.length} accent={stats.unassigned.length > 0 ? "text-brand-amber" : undefined} />
        <Tile label="Pending engineer acceptance" value={stats.pendingAcceptance.length} />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-navy">Unassigned — needs an engineer</h3>
        <TicketTable tickets={stats.unassigned} loading={loading} error={error} onRowClick={(id) => router.push(`/dashboard/tickets/${id}`)} emptyText="Nothing unassigned right now." />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-navy">Pending engineer acceptance</h3>
        <TicketTable
          tickets={stats.pendingAcceptance}
          loading={loading}
          error={null}
          onRowClick={(id) => router.push(`/dashboard/tickets/${id}`)}
          emptyText="No tickets awaiting acceptance."
        />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-navy">
          All open tickets in your territory
        </h3>
        <TicketTable
          tickets={tickets.filter((t) => t.status !== "CLOSED")}
          loading={loading}
          error={error}
          onRowClick={(id) => router.push(`/dashboard/tickets/${id}`)}
          emptyText="Nothing open in your territory."
        />
      </div>
    </div>
  );
}

function TicketTable({
  tickets,
  loading,
  error,
  onRowClick,
  emptyText,
}: {
  tickets: Ticket[];
  loading: boolean;
  error: string | null;
  onRowClick: (id: string) => void;
  emptyText: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="h-10 bg-navy text-left text-[10px] font-bold uppercase tracking-wider text-white">
            <th className="px-4">Ticket</th>
            <th className="px-4">Customer</th>
            <th className="px-4">Priority</th>
            <th className="px-4">Status</th>
            <th className="px-4">Engineer</th>
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
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[t.status]}`}>
                  {STATUS_LABEL[t.status]}
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
