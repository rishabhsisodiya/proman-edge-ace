"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getManagerSummary, ManagerSummary } from "@/lib/ticketing/dashboards-ace";
import { PieChart } from "@/components/PieChart";

const STATUS_STYLE: Record<string, string> = {
  OK: "bg-brand-green-bg text-brand-green",
  BELOW_TARGET: "bg-brand-amber-bg text-brand-amber",
  BREACHED: "bg-brand-red-bg text-brand-red",
  NO_DATA: "bg-navy-soft text-muted",
};

// §10.1 W-05 Manager Dashboard (2026-08-04) — "Full KPI suite, regional pie
// charts, AMC renewal pipeline, revenue, top at-risk accounts." Sits above
// the existing Ticket List on this same page — additive, not a replacement.
// Trimmed KPI cards link to the full KPI Matrix page for the rest; this
// section deliberately doesn't duplicate that page's detail (formulas,
// period selector) — see the design discussion this was built from.
export default function ManagerSummarySection() {
  const [summary, setSummary] = useState<ManagerSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getManagerSummary()
      .then(setSummary)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-muted">Loading dashboard…</p>;
  if (!summary) return null;

  return (
    <div className="space-y-6">
      {/* Trimmed KPI cards */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-navy">KPI Snapshot (This Month)</h3>
          <Link href="/dashboard/reports/kpi" className="text-xs font-medium text-muted hover:text-navy">
            View full KPI Matrix →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summary.kpiCards.map((k) => (
            <div key={k.kpi} className="rounded-lg border border-line bg-white p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{k.kpi}</p>
              <p className="mt-1 text-xl font-black text-navy">{k.current == null ? "—" : `${k.current}${k.unit}`}</p>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold ${STATUS_STYLE[k.status]}`}>
                {k.status === "OK" ? "On Target" : k.status === "BELOW_TARGET" ? "Below Target" : k.status === "BREACHED" ? "Breached" : "No Data"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue */}
      <div className="rounded-lg border border-line bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Revenue (MTD, Submitted Invoices)</p>
        <p className="mt-1 text-2xl font-black text-navy">₹{summary.revenueMtd.toLocaleString()}</p>
        {summary.revenueMtdPendingDrafts > 0 && (
          <p className="mt-1 text-xs text-muted">
            + ₹{summary.revenueMtdPendingDrafts.toLocaleString()} in draft invoices pending Finance submission
          </p>
        )}
      </div>

      {/* Regional pie charts */}
      <div>
        <h3 className="mb-2 text-sm font-bold text-navy">Ticket Status by Region</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summary.regionalBreakdown.map((r) => (
            <div key={r.region} className="rounded-lg border border-line bg-white p-4">
              <p className="mb-2 text-xs font-bold text-navy">
                {r.region} <span className="font-normal text-muted">({r.total} tickets)</span>
              </p>
              <PieChart slices={r.byStatus.map((s) => ({ label: s.status, value: s.count }))} size={90} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* AMC renewal pipeline */}
        <div>
          <h3 className="mb-2 text-sm font-bold text-navy">AMC Renewal Pipeline (next 30 days)</h3>
          {summary.amcRenewalPipeline.length === 0 ? (
            <p className="rounded-lg border border-line bg-white px-4 py-3 text-sm text-muted">
              No contracts expiring in the next 30 days.
            </p>
          ) : (
            <table className="w-full rounded-lg border border-line bg-white text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Contract</th>
                  <th className="px-3 py-2">Days Left</th>
                </tr>
              </thead>
              <tbody>
                {summary.amcRenewalPipeline.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-navy">{c.customerName}</td>
                    <td className="px-3 py-2 text-muted">{c.contractReferenceNo}</td>
                    <td className={`px-3 py-2 font-bold ${c.daysRemaining <= 7 ? "text-brand-red" : "text-brand-amber"}`}>
                      {c.daysRemaining}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Top at-risk accounts */}
        <div>
          <h3 className="mb-2 text-sm font-bold text-navy">Top At-Risk Accounts (2+ SLA breaches, trailing 30 days)</h3>
          {summary.topAtRiskAccounts.length === 0 ? (
            <p className="rounded-lg border border-line bg-white px-4 py-3 text-sm text-muted">
              No customers with repeat SLA breaches right now.
            </p>
          ) : (
            <table className="w-full rounded-lg border border-line bg-white text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Breached Tickets</th>
                </tr>
              </thead>
              <tbody>
                {summary.topAtRiskAccounts.map((a) => (
                  <tr key={a.customerId} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 text-navy">{a.customerName}</td>
                    <td className="px-3 py-2 font-bold text-brand-red">{a.breachedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
