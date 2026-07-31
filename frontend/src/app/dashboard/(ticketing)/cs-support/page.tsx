"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { CsSupportSummary, getCsSupportSummary } from "@/lib/ticketing/dashboards-ace";

// CS Support Dashboard (FSD §6.1) — was a placeholder in the Dashboards hub
// until 2026-08-01. Two work queues: quotations sent to the customer with
// no PO recorded yet (oldest first — the ones needing chasing most), and
// deliveries not yet completed. Read/act-elsewhere only — no actions live
// on this page itself, click through to the ticket/quotation instead.
export default function CsSupportDashboardPage() {
  const [summary, setSummary] = useState<CsSupportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCsSupportSummary()
      .then(setSummary)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("CS Support or Admin access required.");
        else setError("Could not load the CS Support dashboard.");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="p-8 text-sm text-muted">Loading…</p>;
  if (error) return <p className="p-8 text-sm text-brand-red">{error}</p>;
  if (!summary) return null;

  return (
    <div className="w-full px-6 py-10">
      <h1 className="mb-1 text-xl font-bold text-navy">CS Support Dashboard</h1>
      <p className="mb-6 text-sm text-muted">Quotations pending a customer PO, and deliveries not yet completed.</p>

      <div className="mb-8">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-navy">
          Quotations Pending PO <span className="font-normal normal-case text-muted">({summary.quotationsPendingPo.length})</span>
        </h2>
        {summary.quotationsPendingPo.length === 0 ? (
          <p className="text-sm text-muted">Nothing waiting on a customer PO.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
                  <th className="px-4 py-3">Quotation</th>
                  <th className="px-4 py-3">Ticket</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Sent</th>
                  <th className="px-4 py-3">Days Waiting</th>
                </tr>
              </thead>
              <tbody>
                {summary.quotationsPendingPo.map((q) => (
                  <tr key={q.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <a href={`/dashboard/quotations/${q.id}`} className="font-bold text-navy hover:underline">
                        {q.quotationNo}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-muted">{q.ticketNo}</td>
                    <td className="px-4 py-3 text-muted">{q.customer}</td>
                    <td className="px-4 py-3 text-muted">{q.sentAt ? new Date(q.sentAt).toLocaleDateString() : "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          (q.daysWaiting ?? 0) > 7 ? "bg-brand-red-bg text-brand-red" : "bg-navy-tint text-navy"
                        }`}
                      >
                        {q.daysWaiting ?? "—"} days
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-navy">
          Parts Pending Delivery <span className="font-normal normal-case text-muted">({summary.deliveriesPending.length})</span>
        </h2>
        {summary.deliveriesPending.length === 0 ? (
          <p className="text-sm text-muted">Nothing pending delivery.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
                  <th className="px-4 py-3">Ticket</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Quotation</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Delivery Date</th>
                </tr>
              </thead>
              <tbody>
                {summary.deliveriesPending.map((d) => (
                  <tr key={d.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-3 text-navy">
                      {d.ticketNo && d.ticketId ? (
                        <a href={`/dashboard/tickets/${d.ticketId}`} className="font-bold text-navy hover:underline">
                          {d.ticketNo}
                        </a>
                      ) : (
                        d.ticketNo ?? "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted">{d.customer ?? "—"}</td>
                    <td className="px-4 py-3 text-muted">{d.quotationNo ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-brand-amber-bg px-2.5 py-0.5 text-[10px] font-bold text-brand-amber">{d.status}</span>
                    </td>
                    <td className="px-4 py-3 text-muted">{d.deliveryDate ? new Date(d.deliveryDate).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
