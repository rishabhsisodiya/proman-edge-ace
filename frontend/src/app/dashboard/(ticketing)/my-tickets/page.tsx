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
    <div className="mx-auto max-w-md space-y-6 p-6">
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

      <div className="space-y-3">
        {needsAction.map((t) => (
          <div key={t.id} className="rounded-lg border border-line bg-white p-4 shadow-[0_1px_4px_rgba(42,47,105,.06)]">
            <div className="mb-1 flex items-center justify-between">
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${PRIORITY_STYLE[t.priority]}`}>{t.priority}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[t.status]}`}>
                {STATUS_LABEL[t.status]}
              </span>
            </div>
            <p
              className="cursor-pointer text-sm font-bold text-navy"
              onClick={() => router.push(`/dashboard/tickets/${t.id}`)}
            >
              {t.subject}
            </p>
            <p className="mb-3 text-xs text-muted">
              {t.customer.customerName} {t.site?.siteName ? `· ${t.site.siteName}` : ""}
            </p>

            {t.status === "ENGINEER_ASSIGNED" && rejectingId !== t.id && (
              <div className="flex gap-2">
                <button
                  onClick={() => onAccept(t.id)}
                  disabled={busyId === t.id}
                  className="flex-1 rounded-md bg-brand-green-bg py-2 text-xs font-bold text-brand-green disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  onClick={() => setRejectingId(t.id)}
                  disabled={busyId === t.id}
                  className="flex-1 rounded-md bg-brand-red-bg py-2 text-xs font-bold text-brand-red disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            )}

            {rejectingId === t.id && (
              <div>
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
                    className="flex-1 rounded-md bg-brand-red-bg py-2 text-xs font-bold text-brand-red disabled:opacity-50"
                  >
                    Submit
                  </button>
                  <button
                    onClick={() => setRejectingId(null)}
                    className="flex-1 rounded-md bg-navy-tint py-2 text-xs font-bold text-navy"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {t.status !== "ENGINEER_ASSIGNED" && rejectingId !== t.id && (
              <button
                onClick={() => router.push(`/dashboard/tickets/${t.id}`)}
                className="w-full rounded-md bg-navy py-2 text-xs font-bold text-white"
              >
                Open Ticket
              </button>
            )}
          </div>
        ))}
      </div>

      {recentlyResolved.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-navy">Recently resolved</h3>
          <div className="space-y-2">
            {recentlyResolved.map((t) => (
              <div
                key={t.id}
                onClick={() => router.push(`/dashboard/tickets/${t.id}`)}
                className="cursor-pointer rounded-lg border border-line bg-white p-3 hover:bg-navy-tint"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-muted">{t.ticketNo}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[t.status]}`}>
                    {STATUS_LABEL[t.status]}
                  </span>
                </div>
                <p className="truncate text-xs font-medium text-navy">{t.subject}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
