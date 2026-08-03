"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  EquipmentSyncSkipped,
  getEquipmentSkipped,
  getNeedsReview,
  getSyncEmployees,
  getSyncFailureDetail,
  getSyncFailures,
  getSyncRuns,
  getSyncSkipped,
  NeedsReviewCustomer,
  retrySyncFailure,
  SyncedEmployee,
  SyncEntity,
  SyncFailure,
  SyncFailureDetail,
  SyncRun,
  SyncSkipped,
  triggerNightlySync,
} from "@/lib/ticketing/sync-admin";

type Tab = "runs" | "failures" | "skipped" | "needsReview" | "employees" | "equipmentSkipped";

const STATUS_STYLE: Record<SyncRun["status"], string> = {
  SUCCESS: "bg-brand-green-bg text-brand-green",
  PARTIAL: "bg-brand-amber-bg text-brand-amber",
  FAILED: "bg-brand-red-bg text-brand-red",
};

// Per-entity sync target (2026-08-04) — client asked to run just one sync
// instead of always all 4. Originally 6 separate buttons in a row; client
// flagged that as cluttered, so this is a single dropdown + one Run button
// instead — same capability, one control instead of six.
const ENTITY_OPTIONS: { value: "" | SyncEntity; label: string }[] = [
  { value: "", label: "All entities" },
  { value: "customer", label: "Customer" },
  { value: "item", label: "Item" },
  { value: "employee", label: "Employee" },
  { value: "equipmentTracking", label: "Equipment Tracking" },
];
const ENTITY_LABEL: Record<string, string> = Object.fromEntries(ENTITY_OPTIONS.map((o) => [o.value, o.label]));

// W-26 Sync Monitor (§10.1/§12.5) — "ERPNext sync log: last run time,
// success/failure count, failed records, manual retry."
export default function SyncMonitorPage() {
  const [tab, setTab] = useState<Tab>("runs");
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [failures, setFailures] = useState<SyncFailure[]>([]);
  const [skipped, setSkipped] = useState<SyncSkipped[]>([]);
  const [needsReview, setNeedsReview] = useState<NeedsReviewCustomer[]>([]);
  const [employees, setEmployees] = useState<SyncedEmployee[]>([]);
  const [equipmentSkipped, setEquipmentSkipped] = useState<EquipmentSyncSkipped[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<"" | SyncEntity>("");
  const [triggering, setTriggering] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [viewingFailureId, setViewingFailureId] = useState<string | null>(null);
  const [failureDetail, setFailureDetail] = useState<SyncFailureDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([getSyncRuns(), getSyncFailures(), getSyncSkipped(), getNeedsReview(), getSyncEmployees(), getEquipmentSkipped()])
      .then(([r, f, s, n, e, es]) => {
        setRuns(r);
        setFailures(f);
        setSkipped(s);
        setNeedsReview(n);
        setEmployees(e);
        setEquipmentSkipped(es);
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

  async function onTriggerRun(force: boolean) {
    setTriggering(true);
    setNotice(null);
    try {
      await triggerNightlySync(force, selectedEntity || undefined);
      const label = ENTITY_LABEL[selectedEntity] ?? "All entities";
      setNotice(force ? `Full resync triggered and completed (${label}).` : `Sync triggered and completed (${label}).`);
      load();
    } catch {
      setError("Could not trigger the sync.");
    } finally {
      setTriggering(false);
    }
  }

  async function onViewFailure(id: string) {
    setViewingFailureId(id);
    setDetailLoading(true);
    setFailureDetail(null);
    try {
      setFailureDetail(await getSyncFailureDetail(id));
    } catch {
      setError("Could not load failure details.");
      setViewingFailureId(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const lastRun = runs.find((r) => r.entity === "Customer");
  const lastItemRun = runs.find((r) => r.entity === "Item");
  const lastEmployeeRun = runs.find((r) => r.entity === "ErpEmployee");
  const lastEquipmentRun = runs.find((r) => r.entity === "EquipmentTracking");

  return (
    <div className="w-full px-6 py-10">
      <a href="/dashboard/admin" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Admin Console
      </a>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-navy">Sync Monitor</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value as "" | SyncEntity)}
            disabled={triggering}
            className="h-9 rounded-md border border-line px-2 text-xs font-bold text-navy disabled:opacity-50"
          >
            {ENTITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => onTriggerRun(false)}
            disabled={triggering}
            className="rounded-md bg-orange px-3 py-1.5 text-xs font-bold text-navy transition disabled:opacity-50"
          >
            {triggering ? "Running…" : "Run Now"}
          </button>
          <button
            onClick={() => {
              if (
                window.confirm(
                  `Force a full resync of ${ENTITY_LABEL[selectedEntity]}? This reprocesses every record from scratch, ignoring the incremental watermark. May take a while.`,
                )
              ) {
                onTriggerRun(true);
              }
            }}
            disabled={triggering}
            title="Reprocesses every record from scratch, ignoring the incremental watermark"
            className="rounded-md border border-line px-3 py-1.5 text-xs font-bold text-navy transition disabled:opacity-50"
          >
            {triggering ? "Running…" : "Force Full Resync"}
          </button>
        </div>
      </div>
      <p className="mb-4 text-sm text-muted">
        ERPNext Customer (+ site addresses), Item, Employee (service designations), and Equipment Tracking sync
        history, failed records, skipped records, and customers flagged for review. To create a User from a synced
        Employee, use{" "}
        <a href="/dashboard/admin/users" className="underline">
          User Management
        </a>
        &apos;s Create User form. Possible-duplicate Equipment records (flagged during Equipment Tracking sync) are
        resolved on the{" "}
        <a href="/dashboard/admin/equipment" className="underline">
          Equipment
        </a>{" "}
        admin screen, not here.
      </p>

      <div className="mb-6 space-y-2">
        {lastRun && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-4 text-sm">
            <span className="text-xs font-bold uppercase text-muted">Customer</span>
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
        {lastItemRun && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-4 text-sm">
            <span className="text-xs font-bold uppercase text-muted">Item</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[lastItemRun.status]}`}>
              {lastItemRun.status}
            </span>
            <span className="text-navy">Last run: {new Date(lastItemRun.startedAt).toLocaleString()}</span>
            <span className="text-muted">
              {lastItemRun.payload?.recordsOk ?? 0} synced ok, {lastItemRun.payload?.recordsFailed ?? 0} failed this
              run
            </span>
          </div>
        )}
        {lastEmployeeRun && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-4 text-sm">
            <span className="text-xs font-bold uppercase text-muted">Employee</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[lastEmployeeRun.status]}`}>
              {lastEmployeeRun.status}
            </span>
            <span className="text-navy">Last run: {new Date(lastEmployeeRun.startedAt).toLocaleString()}</span>
            <span className="text-muted">{employees.length} employees synced (service designations only)</span>
          </div>
        )}
        {lastEquipmentRun && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-4 text-sm">
            <span className="text-xs font-bold uppercase text-muted">Equipment Tracking</span>
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[lastEquipmentRun.status]}`}>
              {lastEquipmentRun.status}
            </span>
            <span className="text-navy">Last run: {new Date(lastEquipmentRun.startedAt).toLocaleString()}</span>
            <span className="text-muted">
              {lastEquipmentRun.payload?.recordsOk ?? 0} synced ok, {lastEquipmentRun.payload?.recordsFailed ?? 0}{" "}
              failed this run · {equipmentSkipped.length} skipped (unmatched customer)
            </span>
          </div>
        )}
      </div>

      {notice && <p className="mb-4 rounded-md bg-brand-green-bg px-3 py-2 text-xs text-brand-green">{notice}</p>}
      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      <div className="mb-4 flex gap-1 border-b border-line text-sm font-bold">
        {(
          [
            ["runs", `Run History (${runs.length})`],
            ["failures", `Failures (${failures.length})`],
            ["skipped", `Skipped (${skipped.length})`],
            ["needsReview", `Needs Review (${needsReview.length})`],
            ["employees", `Employees (${employees.length})`],
            ["equipmentSkipped", `Equipment Tracking Skipped (${equipmentSkipped.length})`],
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
        <FailuresTable failures={failures} busyId={busyId} onRetry={onRetry} onViewDetails={onViewFailure} />
      ) : tab === "skipped" ? (
        <SkippedTable skipped={skipped} />
      ) : tab === "needsReview" ? (
        <NeedsReviewTable rows={needsReview} />
      ) : tab === "employees" ? (
        <EmployeesTable employees={employees} />
      ) : (
        <EquipmentSkippedTable rows={equipmentSkipped} />
      )}

      {viewingFailureId && (
        <FailureDetailModal
          loading={detailLoading}
          detail={failureDetail}
          busy={busyId === viewingFailureId}
          onRetry={() => onRetry(viewingFailureId)}
          onClose={() => setViewingFailureId(null)}
        />
      )}
    </div>
  );
}

function FailureDetailModal({
  loading,
  detail,
  busy,
  onRetry,
  onClose,
}: {
  loading: boolean;
  detail: SyncFailureDetail | null;
  busy: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-navy">Sync Failure Details</h3>
          <button onClick={onClose} className="text-xs font-bold text-muted">
            Close
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : !detail ? (
          <p className="text-sm text-brand-red">Could not load details.</p>
        ) : (
          <>
            <div className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">
              <p className="font-bold">Last Error ({detail.failure.attemptCount} / 5 attempts)</p>
              <p className="mt-1">{detail.failure.lastError}</p>
              <p className="mt-1 text-[10px]">Last attempted: {new Date(detail.failure.lastAttemptAt).toLocaleString()}</p>
            </div>

            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-navy">
              Current ERPNext values (live — what needs fixing there)
            </p>
            {!detail.erpRow ? (
              <p className="rounded-md bg-brand-amber-bg px-3 py-2 text-xs text-brand-amber">
                This record no longer exists in ERPNext (renamed or deleted since the failure was recorded).
              </p>
            ) : (
              <table className="mb-4 w-full rounded-md border border-line text-xs">
                <tbody>
                  {Object.entries(detail.erpRow).map(([key, value]) => (
                    <tr key={key} className="border-b border-line last:border-0">
                      <td className="w-1/3 px-3 py-2 font-bold text-navy">{key}</td>
                      <td className="px-3 py-2 text-muted">
                        {value === null || value === undefined || value === "" ? "—" : String(value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <button
              onClick={onRetry}
              disabled={busy}
              className="rounded-md bg-orange px-3 py-1.5 text-xs font-bold text-navy transition disabled:opacity-50"
            >
              {busy ? "Retrying…" : "Retry Now"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function RunsTable({ runs }: { runs: SyncRun[] }) {
  if (runs.length === 0) return <p className="text-sm text-muted">No sync runs recorded yet.</p>;
  return (
    <table className="w-full rounded-lg border border-line bg-white text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
          <th className="px-4 py-3">Entity</th>
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
            <td className="px-4 py-3 text-navy">{r.entity}</td>
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
  onViewDetails,
}: {
  failures: SyncFailure[];
  busyId: string | null;
  onRetry: (id: string) => void;
  onViewDetails: (id: string) => void;
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
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => onViewDetails(f.id)}
                  className="rounded-md border border-line px-3 py-1.5 text-xs font-bold text-navy transition"
                >
                  View Details
                </button>
                <button
                  onClick={() => onRetry(f.id)}
                  disabled={busyId === f.id}
                  className="rounded-md bg-orange px-3 py-1.5 text-xs font-bold text-navy transition disabled:opacity-50"
                >
                  {busyId === f.id ? "Retrying…" : "Retry"}
                </button>
              </div>
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

function EmployeesTable({ employees }: { employees: SyncedEmployee[] }) {
  if (employees.length === 0) return <p className="text-sm text-muted">No employees synced yet.</p>;
  return (
    <table className="w-full rounded-lg border border-line bg-white text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
          <th className="px-4 py-3">Employee ID</th>
          <th className="px-4 py-3">Name</th>
          <th className="px-4 py-3">Designation</th>
          <th className="px-4 py-3">Department</th>
          <th className="px-4 py-3">ERP Login</th>
        </tr>
      </thead>
      <tbody>
        {employees.map((e) => (
          <tr key={e.id} className="border-b border-line last:border-0">
            <td className="px-4 py-3 font-mono text-xs text-muted">{e.employeeId}</td>
            <td className="px-4 py-3 text-navy">{e.employeeName}</td>
            <td className="px-4 py-3 text-muted">{e.designation}</td>
            <td className="px-4 py-3 text-muted">{e.department ?? "—"}</td>
            <td className="px-4 py-3 text-muted">{e.erpUserId || "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EquipmentSkippedTable({ rows }: { rows: EquipmentSyncSkipped[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">No skipped Equipment Tracking records.</p>;
  return (
    <table className="w-full rounded-lg border border-line bg-white text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
          <th className="px-4 py-3">ERP Serial ID</th>
          <th className="px-4 py-3">Customer Name</th>
          <th className="px-4 py-3">Reason</th>
          <th className="px-4 py-3">First Seen</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-line last:border-0">
            <td className="px-4 py-3 font-mono text-xs text-muted">{r.erpSerialId}</td>
            <td className="px-4 py-3 text-navy">{r.customerName}</td>
            <td className="px-4 py-3 text-muted">{r.reason}</td>
            <td className="px-4 py-3 text-muted">{new Date(r.firstSeenAt).toLocaleDateString()}</td>
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
