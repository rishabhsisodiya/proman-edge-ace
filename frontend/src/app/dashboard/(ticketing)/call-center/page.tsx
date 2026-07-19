"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { PRIORITY_STYLE, SOURCE_LABEL, STATUS_LABEL, STATUS_STYLE, Source, Ticket } from "@/lib/ticketing/types";

function Tile({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-[0_1px_4px_rgba(42,47,105,.06)]">
      <p className="text-xs font-bold uppercase tracking-wider text-navy">{label}</p>
      <p className={`mt-1 text-[28px] font-black leading-none ${accent ?? "text-navy"}`}>{value}</p>
    </div>
  );
}

function isToday(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

// Call Center dashboard: open/unassigned counts, today's intake by source,
// SLA-at-risk list, plus a recent-tickets table (so Call Center can actually
// find and open what they just created, not just what's at SLA risk).
// Derived client-side from the same /tickets list endpoint (unscoped for
// Call Center) — no separate aggregate API exists yet.
export default function CallCenterDashboardPage() {
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

  const now = Date.now();
  const stats = useMemo(() => {
    const open = tickets.filter((t) => t.status !== "CLOSED").length;
    const unassigned = tickets.filter((t) => !t.assignedEngineer && t.status !== "CLOSED").length;
    const todayIntake = tickets.filter((t) => isToday(t.createdAt)).length;
    const slaAtRisk = tickets.filter(
      (t) => t.slaResolutionDue && t.status !== "CLOSED" && new Date(t.slaResolutionDue).getTime() - now < 2 * 60 * 60 * 1000,
    );

    const bySource: Partial<Record<Source, number>> = {};
    for (const t of tickets) {
      if (!isToday(t.createdAt)) continue;
      bySource[t.source as Source] = (bySource[t.source as Source] ?? 0) + 1;
    }

    return { open, unassigned, todayIntake, slaAtRisk, bySource };
  }, [tickets, now]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[22px] font-black text-navy">Call Center Dashboard</h2>
          <p className="text-sm text-muted">Intake overview and SLA-at-risk tickets</p>
        </div>
        <button
          onClick={() => router.push("/dashboard/tickets/new")}
          className="h-10 rounded-md bg-orange px-4 text-sm font-bold text-navy"
        >
          + New Ticket
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Tile label="Open tickets" value={stats.open} />
        <Tile label="Unassigned" value={stats.unassigned} accent={stats.unassigned > 0 ? "text-brand-amber" : undefined} />
        <Tile label="Today's intake" value={stats.todayIntake} />
        <Tile label="SLA at risk" value={stats.slaAtRisk.length} accent={stats.slaAtRisk.length > 0 ? "text-brand-amber" : undefined} />
      </div>

      <div className="rounded-lg border border-line bg-white p-4">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-navy">Today's intake by source</h3>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : Object.keys(stats.bySource).length === 0 ? (
          <p className="text-sm text-muted">No tickets created today.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {Object.entries(stats.bySource).map(([source, count]) => (
              <span key={source} className="rounded-full bg-navy-tint px-3 py-1.5 text-xs font-bold text-navy">
                {SOURCE_LABEL[source as Source] ?? source}: {count}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-navy">SLA at risk (next 2 hours)</h3>
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="h-10 bg-navy text-left text-[10px] font-bold uppercase tracking-wider text-white">
                <th className="px-4">Ticket</th>
                <th className="px-4">Customer</th>
                <th className="px-4">Priority</th>
                <th className="px-4">Status</th>
                <th className="px-4">Resolution due</th>
              </tr>
            </thead>
            <tbody>
              {error && (
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-center text-brand-red">
                    {error}
                  </td>
                </tr>
              )}
              {!error && stats.slaAtRisk.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-center text-muted">
                    Nothing at risk right now.
                  </td>
                </tr>
              )}
              {stats.slaAtRisk.map((t, i) => (
                <tr
                  key={t.id}
                  onClick={() => router.push(`/dashboard/tickets/${t.id}`)}
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
                  <td className="px-4 text-brand-amber">{t.slaResolutionDue ? new Date(t.slaResolutionDue).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-navy">Recent tickets</h3>
        <div className="overflow-x-auto rounded-lg border border-line bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="h-10 bg-navy text-left text-[10px] font-bold uppercase tracking-wider text-white">
                <th className="px-4">Ticket</th>
                <th className="px-4">Customer</th>
                <th className="px-4">Source</th>
                <th className="px-4">Priority</th>
                <th className="px-4">Status</th>
                <th className="px-4">Engineer</th>
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
              {!loading && !error && tickets.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-center text-muted">
                    No tickets yet.
                  </td>
                </tr>
              )}
              {tickets.slice(0, 20).map((t, i) => (
                <tr
                  key={t.id}
                  onClick={() => router.push(`/dashboard/tickets/${t.id}`)}
                  className={`h-11 cursor-pointer border-b border-line last:border-0 hover:bg-navy-tint ${i % 2 === 1 ? "bg-navy-soft" : "bg-white"}`}
                >
                  <td className="px-4 font-mono text-xs text-muted">{t.ticketNo}</td>
                  <td className="px-4">{t.customer.customerName}</td>
                  <td className="px-4 text-muted">{SOURCE_LABEL[t.source] ?? t.source}</td>
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
      </div>
    </div>
  );
}
