"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { acceptTicket, rejectTicket } from "@/lib/ticketing/actions";
import { PRIORITY_STYLE, STATUS_LABEL, STATUS_STYLE, Ticket } from "@/lib/ticketing/types";

// Engineer's ticket inbox — not one of §6.1's 5 KPI dashboards (Engineer
// isn't a dashboard role in the FSD), this is the §10.2/Q15 engineer web flow
// entry point: a simple assigned-tickets list, single-column, mobile-first.
// Matches the golden-path briefing's "My tickets" phone UI, just as a full
// web page instead of a phone mockup.
export default function MyTicketsPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  function load() {
    setLoading(true);
    apiFetch<Ticket[]>("/tickets")
      .then(setTickets)
      .catch(() => setError("Could not load your tickets."))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function onAccept(id: string) {
    setBusyId(id);
    try {
      await acceptTicket(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? "Could not accept — please refresh." : "Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(id: string) {
    setBusyId(id);
    try {
      const res = await rejectTicket(id, rejectReason);
      setRejectingId(null);
      setRejectReason("");
      load();
      if (res.escalationTier === "ESCALATED_TO_MANAGER") {
        setError("3rd rejection — escalated to Manager.");
      }
    } catch (err) {
      setError(err instanceof ApiError ? "Could not reject." : "Could not reach the server.");
    } finally {
      setBusyId(null);
    }
  }

  // Once ENGINEER_RESOLVED, the ball is with ASM/Call Center — nothing left
  // for the engineer to do, so it doesn't belong in the "needs your action"
  // list. Kept visible in a secondary section instead of hidden entirely, so
  // recent work is still easy to find/reference.
  const needsAction = tickets.filter((t) => !["CLOSED", "ENGINEER_RESOLVED", "ASM_RESOLVED"].includes(t.status));
  const recentlyResolved = tickets.filter((t) => ["ENGINEER_RESOLVED", "ASM_RESOLVED"].includes(t.status));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h2 className="text-xl font-black text-navy">My Tickets</h2>
        <p className="text-sm text-muted">Assigned to you, waiting on your action</p>
      </div>

      {error && <p className="rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {loading && <p className="text-sm text-muted">Loading…</p>}
      {!loading && needsAction.length === 0 && (
        <p className="rounded-lg border border-line bg-white p-6 text-center text-sm text-muted">
          No new assignments. Waiting for dispatch…
        </p>
      )}

      <div className="divide-y divide-line rounded-lg border border-line bg-white">
        {needsAction.map((t) => (
          <div key={t.id} className="p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${PRIORITY_STYLE[t.priority]}`}>
                    {t.priority}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[t.status]}`}>
                    {STATUS_LABEL[t.status]}
                  </span>
                  <span className="font-mono text-[11px] text-muted">{t.ticketNo}</span>
                </div>
                <p
                  className="cursor-pointer break-words text-sm font-bold text-navy hover:underline"
                  onClick={() => router.push(`/dashboard/tickets/${t.id}`)}
                >
                  {t.subject}
                </p>
                <p className="text-xs text-muted">
                  {t.customer.customerName} {t.site?.siteName ? `· ${t.site.siteName}` : ""}
                </p>
              </div>

              {t.status === "ENGINEER_ASSIGNED" && rejectingId !== t.id && (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => onAccept(t.id)}
                    disabled={busyId === t.id}
                    className="rounded-md bg-brand-green-bg px-4 py-2 text-xs font-bold text-brand-green disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => setRejectingId(t.id)}
                    disabled={busyId === t.id}
                    className="rounded-md bg-brand-red-bg px-4 py-2 text-xs font-bold text-brand-red disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}

              {t.status !== "ENGINEER_ASSIGNED" && rejectingId !== t.id && (
                <button
                  onClick={() => router.push(`/dashboard/tickets/${t.id}`)}
                  className="shrink-0 rounded-md bg-navy px-4 py-2 text-xs font-bold text-white"
                >
                  Open Ticket
                </button>
              )}
            </div>

            {rejectingId === t.id && (
              <div className="mt-3">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection (required)"
                  className="mb-2 h-16 w-full rounded-md border border-line p-2 text-xs"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => onReject(t.id)}
                    disabled={busyId === t.id || !rejectReason}
                    className="rounded-md bg-brand-red-bg px-4 py-2 text-xs font-bold text-brand-red disabled:opacity-50"
                  >
                    Submit
                  </button>
                  <button
                    onClick={() => setRejectingId(null)}
                    className="rounded-md bg-navy-tint px-4 py-2 text-xs font-bold text-navy"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {recentlyResolved.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-navy">Recently resolved</h3>
          <div className="divide-y divide-line rounded-lg border border-line bg-white">
            {recentlyResolved.map((t) => (
              <div
                key={t.id}
                onClick={() => router.push(`/dashboard/tickets/${t.id}`)}
                className="flex cursor-pointer flex-col gap-1 p-3 hover:bg-navy-tint sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <span className="mr-2 font-mono text-[11px] text-muted">{t.ticketNo}</span>
                  <span className="truncate text-xs font-medium text-navy">{t.subject}</span>
                </div>
                <span className={`shrink-0 self-start rounded-full px-2.5 py-0.5 text-[10px] font-bold sm:self-auto ${STATUS_STYLE[t.status]}`}>
                  {STATUS_LABEL[t.status]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
