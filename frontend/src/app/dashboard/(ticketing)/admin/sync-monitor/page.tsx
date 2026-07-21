"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  getNeedsReview,
  getSyncFailures,
  getSyncRuns,
  getSyncSkipped,
  NeedsReviewCustomer,
  retrySyncFailure,
  SyncFailure,
  SyncRun,
  SyncSkipped,
  triggerCustomerSync,
} from "@/lib/ticketing/sync-admin";

type Tab = "runs" | "failures" | "skipped" | "needsReview";

const STATUS_STYLE: Record<SyncRun["status"], string> = {
  SUCCESS: "bg-brand-green-bg text-brand-green",
  PARTIAL: "bg-brand-amber-bg text-brand-amber",
  FAILED: "bg-brand-red-bg text-brand-red",
};

// W-26 Sync Monitor (§10.1/§12.5) — "ERPNext sync log: last run time,
// success/failure count, failed records, manual retry."
export default function SyncMonitorPage() {
  const [tab, setTab] = useState<Tab>("runs");
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [failures, setFailures] = useState<SyncFailure[]>([]);
  const [skipped, setSkipped] = useState<SyncSkipped[]>([]);
  const [needsReview, setNeedsReview] = useState<NeedsReviewCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([getSyncRuns("Customer"), getSyncFailures(), getSyncSkipped(), getNeedsReview()])
      .then(([r, f, s, n]) => {
        setRuns(r);
        setFailures(f);
        setSkipped(s);
        setNeedsReview(n);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setError("Admin access required.");
        } else {
          setError("Could not load sync data.");
        }
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function onRetry(id: string) {
    setBusyId(id);
    try {
      await retrySyncFailure(id);
      load();
    } catch {
      setError("Retry failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function onTriggerRun() {
    setTriggering(true);
    setNotice(null);
    try {
      await triggerCustomerSync();
      setNotice("Sync run triggered and completed.");
      load();
    } catch {
      setError("Could not trigger sync run.");
    } finally {
      setTriggering(false);
    }
  }

  const lastRun = runs[0];

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-xl font-bold text-navy">Sync Monitor</h1>
        <button
          onClick={onTriggerRun}
          disabled={triggering}
          className="rounded-md bg-orange px-3 py-1.5 text-xs font-bold text-navy transition disabled:opacity-50"
        >
          {triggering ? "Running…" : "Run Customer Sync Now"}
        </button>
      </div>
      <p className="mb-4 text-sm text-muted">
        ERPNext Customer sync history, failed records, skipped records, and customers flagged for review.
      </p>

      {lastRun && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-4 text-sm">
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[lastRun.status]}`}>
            {lastRun.status}
          </span>
          <span className="text-navy">Last run: {new Date(lastRun.startedAt).toLocaleString()}</span>
          <span className="text-muted">
            {lastRun.payload?.recordsOk ?? 0} synced ok, {lastRun.payload?.recordsFailed ?? 0} failed this run ·{" "}
            {failures.length} failure{failures.length === 1 ? "" : "s"} · {skipped.length} skipped ·{" "}
            {needsReview.length} needs review
          </span>
        </div>
      )}

      {notice && <p className="mb-4 rounded-md bg-brand-green-bg px-3 py-2 text-xs text-brand-green">{notice}</p>}
      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      <div className="mb-4 flex gap-1 border-b border-line text-sm font-bold">
        {(
          [
            ["runs", `Run History (${runs.length})`],
            ["failures", `Failures (${failures.length})`],
            ["skipped", `Skipped (${skipped.length})`],
            ["needsReview", `Needs Review (${needsReview.length})`],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 ${tab === key ? "border-b-2 border-orange text-navy" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : tab === "runs" ? (
        <RunsTable runs={runs} />
      ) : tab === "failures" ? (
        <FailuresTable failures={failures} busyId={busyId} onRetry={onRetry} />
      ) : tab === "skipped" ? (
        <SkippedTable skipped={skipped} />
      ) : (
        <NeedsReviewTable rows={needsReview} />
      )}
    </div>
  );
}

function RunsTable({ runs }: { runs: SyncRun[] }) {
  if (runs.length === 0) return <p className="text-sm text-muted">No sync runs recorded yet.</p>;
  return (
    <table className="w-full rounded-lg border border-line bg-white text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
          <th className="px-4 py-3">Started</th>
          <th className="px-4 py-3">Completed</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3">Records</th>
          <th className="px-4 py-3">Error</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.id} className="border-b border-line last:border-0">
            <td className="px-4 py-3 text-navy">{new Date(r.startedAt).toLocaleString()}</td>
            <td className="px-4 py-3 text-muted">{r.completedAt ? new Date(r.completedAt).toLocaleString() : "—"}</td>
            <td className="px-4 py-3">
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[r.status]}`}>
                {r.status}
              </span>
            </td>
            <td className="px-4 py-3 text-muted">
              {r.payload ? `${r.payload.recordsOk ?? 0} ok, ${r.payload.recordsFailed ?? 0} failed` : "—"}
            </td>
            <td className="px-4 py-3 text-muted">{r.errorMessage ?? "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FailuresTable({
  failures,
  busyId,
  onRetry,
}: {
  failures: SyncFailure[];
  busyId: string | null;
  onRetry: (id: string) => void;
}) {
  if (failures.length === 0) return <p className="text-sm text-muted">No sync failures — nothing needs a retry.</p>;
  return (
    <table className="w-full rounded-lg border border-line bg-white text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
          <th className="px-4 py-3">ERPNext Customer</th>
          <th className="px-4 py-3">Attempts</th>
          <th className="px-4 py-3">Last Error</th>
          <th className="px-4 py-3">Last Attempt</th>
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody>
        {failures.map((f) => (
          <tr key={f.id} className="border-b border-line last:border-0">
            <td className="px-4 py-3 text-navy">{f.erpnextCustomerId}</td>
            <td className="px-4 py-3 text-muted">{f.attemptCount} / 5</td>
            <td className="px-4 py-3 text-muted">{f.lastError}</td>
            <td className="px-4 py-3 text-muted">{new Date(f.lastAttemptAt).toLocaleString()}</td>
            <td className="px-4 py-3 text-right">
              <button
                onClick={() => onRetry(f.id)}
                disabled={busyId === f.id}
                className="rounded-md bg-orange px-3 py-1.5 text-xs font-bold text-navy transition disabled:opacity-50"
              >
                {busyId === f.id ? "Retrying…" : "Retry"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SkippedTable({ skipped }: { skipped: SyncSkipped[] }) {
  if (skipped.length === 0) return <p className="text-sm text-muted">No skipped records.</p>;
  return (
    <table className="w-full rounded-lg border border-line bg-white text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
          <th className="px-4 py-3">Customer</th>
          <th className="px-4 py-3">ERPNext ID</th>
          <th className="px-4 py-3">Reason</th>
          <th className="px-4 py-3">First Seen</th>
        </tr>
      </thead>
      <tbody>
        {skipped.map((s) => (
          <tr key={s.id} className="border-b border-line last:border-0">
            <td className="px-4 py-3 text-navy">{s.customerName}</td>
            <td className="px-4 py-3 text-muted">{s.erpnextCustomerId}</td>
            <td className="px-4 py-3 text-muted">{s.reason}</td>
            <td className="px-4 py-3 text-muted">{new Date(s.firstSeenAt).toLocaleDateString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function NeedsReviewTable({ rows }: { rows: NeedsReviewCustomer[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">No customers currently flagged for review.</p>;
  return (
    <table className="w-full rounded-lg border border-line bg-white text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
          <th className="px-4 py-3">Customer</th>
          <th className="px-4 py-3">Region</th>
          <th className="px-4 py-3">Reason</th>
          <th className="px-4 py-3">Last Synced</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-line last:border-0">
            <td className="px-4 py-3 text-navy">{r.customerName}</td>
            <td className="px-4 py-3 text-muted">{r.region ?? "—"}</td>
            <td className="px-4 py-3 text-muted">{r.reviewReason ?? "—"}</td>
            <td className="px-4 py-3 text-muted">
              {r.lastSyncedAt ? new Date(r.lastSyncedAt).toLocaleString() : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
