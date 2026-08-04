"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { ExecutiveSummary, getExecutiveSummary } from "@/lib/ticketing/dashboards-ace";

function Tile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-[0_1px_4px_rgba(42,47,105,.06)]">
      <p className="text-xs font-bold uppercase tracking-wider text-navy">{label}</p>
      <p className={`mt-1 text-[28px] font-black leading-none ${accent ?? "text-navy"}`}>{value}</p>
    </div>
  );
}

// Executive / MD Dashboard (FSD §6.1) — was a placeholder in the Dashboards
// hub until 2026-08-01. Read-only summary tiles only, per the FSD's own
// framing — no filters, no export, no drill-down. Reuses ReportsService's
// own report methods on the backend rather than re-deriving these numbers,
// so this can never drift from what the actual Reports page shows.
export default function ExecutiveDashboardPage() {
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getExecutiveSummary()
      .then(setSummary)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("MD or Admin access required.");
        else setError("Could not load the Executive dashboard.");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="p-8 text-sm text-muted">Loading…</p>;
  if (error) return <p className="p-8 text-sm text-brand-red">{error}</p>;
  if (!summary) return null;

  return (
    <div className="w-full px-6 py-10">
      <h1 className="mb-1 text-xl font-bold text-navy">Executive Dashboard</h1>
      <p className="mb-6 text-sm text-muted">Summary KPI tiles — read-only.</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <Tile label="Open Tickets" value={String(summary.openTicketsCount)} />
        <Tile
          label="SLA Compliance"
          value={summary.slaCompliancePct != null ? `${summary.slaCompliancePct}%` : "—"}
          accent={summary.slaCompliancePct != null && summary.slaCompliancePct < 90 ? "text-brand-red" : undefined}
        />
        <Tile label="Avg MTTR" value={summary.avgMttrHours != null ? `${summary.avgMttrHours}h` : "—"} />
        <Tile label="Revenue (MTD)" value={`₹${summary.revenueMtd.toLocaleString()}`} />
        <Tile
          label="CSAT Avg"
          value={summary.csatAvg != null ? `${summary.csatAvg}/5` : "—"}
          accent={summary.csatAvg != null && summary.csatAvg < 3.5 ? "text-brand-red" : undefined}
        />
        <Tile label="AMC Renewals Due" value={String(summary.amcRenewalsDue)} />
      </div>

      {summary.revenueMtdPendingDrafts > 0 && (
        <p className="mt-3 text-xs text-muted">
          Revenue (MTD) counts Submitted ERPNext invoices only — an additional ₹
          {summary.revenueMtdPendingDrafts.toLocaleString()} is sitting in draft invoices this month, pending
          Finance submission.
        </p>
      )}
    </div>
  );
}
