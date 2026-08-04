"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { AuthUser, getCurrentUser } from "@/lib/auth";
import { getKpiMatrix, KpiMatrixRow } from "@/lib/ticketing/reports";

type Period = "month" | "quarter" | "year";

const REGIONS = ["NORTH", "SOUTH", "EAST", "WEST", "CENTRAL", "BANGLADESH"];

const PERIOD_LABEL: Record<Period, string> = {
  month: "This Month",
  quarter: "This Quarter",
  year: "This Year",
};

const STATUS_STYLE: Record<KpiMatrixRow["status"], string> = {
  OK: "bg-brand-green-bg text-brand-green",
  BELOW_TARGET: "bg-brand-amber-bg text-brand-amber",
  BREACHED: "bg-brand-red-bg text-brand-red",
  NO_DATA: "bg-navy-soft text-muted",
};

const STATUS_LABEL: Record<KpiMatrixRow["status"], string> = {
  OK: "On Target",
  BELOW_TARGET: "Below Target",
  BREACHED: "Breached",
  NO_DATA: "No Data",
};

// Left accent bar, one shade darker than the badge background — gives each
// card a quick-scan color without needing to read the badge text first.
const STATUS_ACCENT: Record<KpiMatrixRow["status"], string> = {
  OK: "border-l-brand-green",
  BELOW_TARGET: "border-l-brand-amber",
  BREACHED: "border-l-brand-red",
  NO_DATA: "border-l-line",
};

// §6.2 Core KPI matrix (2026-08-04) — the FSD's 7 core KPIs (SLA compliance,
// MTTR ×2, First response time ×2, CSAT, AMC renewal rate, Engineer
// utilization), each against its own stated target, computed fresh
// server-side. Deliberately excludes Revenue MTD — that's a §6.1 dashboard
// tile, not one of these 7, and tracked as its own separate item pending a
// decision on draft vs submitted ERPNext invoices.
export default function KpiMatrixPage() {
  const [period, setPeriod] = useState<Period>("month");
  const [region, setRegion] = useState("");
  const [rows, setRows] = useState<KpiMatrixRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backHref, setBackHref] = useState("/dashboard/reports");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const u = getCurrentUser();
    setUser(u);
    if (u?.role === "ADMIN") setBackHref("/dashboard/admin");
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getKpiMatrix(period, region || undefined)
      .then(setRows)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Manager/Admin access required.");
        else setError("Could not load the KPI matrix.");
      })
      .finally(() => setLoading(false));
  }, [period, region]);

  return (
    <div className="min-h-screen w-full bg-background">
      <div className="flex items-center justify-between border-b border-line bg-white px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/reports" className="text-xs font-medium text-muted hover:text-navy">
            ← Reports
          </Link>
          <h1 className="text-lg font-bold text-navy">KPI Matrix</h1>
        </div>
        <Link href={backHref} className="text-xs font-medium text-muted hover:text-navy">
          Dashboard
        </Link>
      </div>

      <div className="w-full px-6 py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">
            {user?.role === "MANAGER"
              ? "7 core KPIs for your region(s), each against its own target."
              : "7 core KPIs, org-wide, each against its own target."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {user?.role === "ADMIN" && (
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="h-9 rounded-md border border-line px-2 text-xs font-bold text-navy"
              >
                <option value="">All Regions</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
            <div className="flex gap-1 rounded-md border border-line bg-white p-1">
              {(["month", "quarter", "year"] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`rounded px-3 py-1.5 text-xs font-bold transition ${
                    period === p ? "bg-orange text-navy" : "text-muted hover:bg-navy-soft"
                  }`}
                >
                  {PERIOD_LABEL[p]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {rows.map((r) => (
              <KpiCard key={r.kpi} row={r} />
            ))}
          </div>
        )}

        <p className="mt-4 text-xs text-muted">
          A daily check notifies every Manager (region-scoped) and Admin by Email/Push whenever a KPI is "Breached."
        </p>
      </div>
    </div>
  );
}

function KpiCard({ row }: { row: KpiMatrixRow }) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className={`rounded-lg border border-l-4 border-line bg-white p-4 ${STATUS_ACCENT[row.status]}`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">{row.kpi}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[row.status]}`}>
          {STATUS_LABEL[row.status]}
        </span>
      </div>

      <p className="text-2xl font-bold text-navy">{row.current == null ? "—" : `${row.current}${row.unit}`}</p>
      <p className="mt-1 text-xs text-muted">Target: {row.target}</p>

      <button
        onClick={() => setShowDetails((v) => !v)}
        className="mt-3 text-[11px] font-bold text-navy underline decoration-dotted"
      >
        {showDetails ? "Hide details" : "Formula & alert threshold"}
      </button>

      {showDetails && (
        <div className="mt-2 space-y-1 border-t border-line pt-2 text-xs text-muted">
          <p>{row.formula}</p>
          <p>Breach alert: {row.breachAlert}</p>
        </div>
      )}
    </div>
  );
}
