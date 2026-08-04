"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import SignaturePad from "@/components/fsv/SignaturePad";
import {
  addFsvPart,
  FieldServiceVisit,
  getFsv,
  listQueuedFsvActions,
  QueuedFsvAction,
  removeFsvPart,
  removeFsvPhoto,
  removeQueuedFsvAction,
  replayFsvQueue,
  submitFsv,
  updateFsv,
  updateFsvPart,
  uploadFsvPhoto,
  uploadFsvReport,
  uploadFsvSignature,
} from "@/lib/ticketing/fsv";
import { useOnlineStatus } from "@/lib/useOnlineStatus";
import { ItemListItem, listAllWarehouses, listItems } from "@/lib/ticketing/masters";
import { listPriceLists, PriceList } from "@/lib/ticketing/price-lists";
import { apiFetch } from "@/lib/api";

function isQueued(x: unknown): x is { queued: true } {
  return typeof x === "object" && x !== null && "queued" in x && (x as { queued: unknown }).queued === true;
}

// Client-reported bug (2026-08-04): items with no warehouse stock of their
// own left the Warehouse field blank/free-text with no default. Confirmed
// this exact warehouse exists in the synced ItemWarehouseStock data.
const DEFAULT_WAREHOUSE = "Bidadi Stores - PISPL";

interface ItemWarehouseStock {
  warehouse: string;
  actualQty: number;
}
interface ItemDetail extends ItemListItem {
  warehouseStock: ItemWarehouseStock[];
  standardRate: string | number | null;
  valuationRate: string | number | null;
  sellingRate: number | null;
}

// FSV detail/edit screen — Draft is live-autosaved field-by-field (matches
// ACE_Ticket_Master_Flow.png's "work → FSV update (live)" dashed link), not
// one big form submitted once. Submitted visits render read-only.
export default function FsvDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [fsv, setFsv] = useState<FieldServiceVisit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const online = useOnlineStatus();
  const [queuedActions, setQueuedActions] = useState<QueuedFsvAction[]>([]);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  function load() {
    getFsv(id)
      .then(setFsv)
      .catch(() => setError("Could not load this Field Service Visit."))
      .finally(() => setLoading(false));
  }

  function refreshQueue() {
    listQueuedFsvActions(id).then(setQueuedActions);
  }

  useEffect(load, [id]);
  useEffect(refreshQueue, [id]);

  // Piece 3/4 — replay whatever's queued the moment connectivity returns
  // (and once on initial mount, in case the page loads back online after
  // being closed while offline). Refreshes both the FSV data and the queue
  // list afterward so the UI reflects whatever actually synced.
  useEffect(() => {
    if (!online) return;
    replayFsvQueue(id).then(({ replayed, error }) => {
      if (replayed > 0) {
        setNotice(`Synced ${replayed} queued item${replayed > 1 ? "s" : ""} from earlier.`);
        load();
      }
      setQueueError(error ?? null);
      refreshQueue();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, id]);

  function retryQueueNow() {
    setRetrying(true);
    replayFsvQueue(id)
      .then(({ replayed, error }) => {
        if (replayed > 0) {
          setNotice(`Synced ${replayed} queued item${replayed > 1 ? "s" : ""}.`);
          load();
        }
        setQueueError(error ?? null);
        refreshQueue();
      })
      .finally(() => setRetrying(false));
  }

  function clearQueuedAction(actionId: string) {
    removeQueuedFsvAction(actionId).then(() => {
      setQueueError(null);
      refreshQueue();
    });
  }

  async function saveField(patch: Record<string, unknown>) {
    if (!fsv || fsv.status === "SUBMITTED") return;
    setSaving(true);
    try {
      const result = await updateFsv(fsv.id, patch);
      if (isQueued(result)) {
        // Optimistic local merge (2026-08-02) — without this, a queued
        // checkbox change still visually reverts (it's controlled by fsv
        // state, which never updates), reproducing the exact "checkbox
        // won't stay checked offline" complaint even though the change IS
        // now correctly queued. Safe: patch is already the same shape as
        // what the server would echo back for these fields.
        setFsv((prev) => (prev ? ({ ...prev, ...patch } as FieldServiceVisit) : prev));
        setNotice("You're offline — change queued, will sync automatically once you're back online.");
        refreshQueue();
      } else {
        setFsv(result);
      }
    } catch {
      setError("Could not save.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSignature(blob: Blob | null) {
    if (!fsv || fsv.status === "SUBMITTED" || !blob) return;
    setSaving(true);
    try {
      const result = await uploadFsvSignature(fsv.id, blob);
      if (isQueued(result)) {
        setNotice("You're offline — signature queued, will sync automatically once you're back online.");
        refreshQueue();
      } else {
        setFsv(result);
      }
    } catch {
      setError("Could not save signature.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="p-8 text-sm text-muted">Loading…</p>;
  if (error && !fsv) return <p className="p-8 text-sm text-brand-red">{error}</p>;
  if (!fsv) return null;

  const readOnly = fsv.status === "SUBMITTED";

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      {!online && (
        <div className="rounded-md bg-brand-amber-bg px-3 py-2 text-xs font-bold text-brand-amber">
          You&apos;re offline — photos, signature, parts, and submit will be queued locally and synced automatically once you&apos;re back online.
        </div>
      )}

      {queuedActions.length > 0 && (
        <div className="rounded-md border border-brand-amber bg-brand-amber-bg px-3 py-2 text-xs text-navy">
          <p className="font-bold text-brand-amber">
            {queuedActions.length} item{queuedActions.length > 1 ? "s" : ""} queued, not yet synced:
          </p>
          <ul className="mt-1 space-y-1">
            {queuedActions.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span>
                  •{" "}
                  {a.kind === "photo" && `Photo${a.caption ? ` — ${a.caption}` : ""}`}
                  {a.kind === "signature" && "Signature"}
                  {a.kind === "part" && `Part — ${a.body.itemName}`}
                  {a.kind === "submit" && "Submit"}
                  {a.kind === "update" && `Field update — ${Object.keys(a.body).join(", ")}`}
                  {a.kind === "report" && "Service Report"}
                  {" "}
                  <span className="text-muted">({new Date(a.queuedAt).toLocaleTimeString()})</span>
                </span>
                <button
                  type="button"
                  onClick={() => clearQueuedAction(a.id)}
                  className="shrink-0 font-bold text-brand-red underline"
                  title="Discard this queued item — it will NOT be synced"
                >
                  Clear
                </button>
              </li>
            ))}
          </ul>
          {queueError && (
            <p className="mt-2 rounded bg-brand-red-bg px-2 py-1 text-brand-red">
              Last sync attempt failed: {queueError}
              {queuedActions.some((a) => a.kind === "submit") &&
                " If this is \"Log parts consumed...\", add a part or check \"No parts used\" below, then Clear the stuck Submit and try again."}
            </p>
          )}
          <button
            type="button"
            disabled={!online || retrying}
            onClick={retryQueueNow}
            className="mt-2 font-bold text-navy underline disabled:opacity-50"
          >
            {retrying ? "Retrying…" : "Retry now"}
          </button>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-bold text-navy">Field Service Visit #{fsv.visitNumber}</h1>
          <span className="font-mono text-sm font-bold text-navy">{fsv.visitNo}</span>
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
              readOnly ? "bg-brand-green-bg text-brand-green" : "bg-navy-tint text-navy"
            }`}
          >
            {fsv.status}
          </span>
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api/v1"}/fsv/${fsv.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-bold text-navy underline"
          >
            Download PDF
          </a>
        </div>
        <p className="mt-1 text-sm font-medium text-navy">{new Date(fsv.visitDate).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        {readOnly && (
          <p className="mt-1 text-xs text-muted">
            Submitted {fsv.submittedAt ? new Date(fsv.submittedAt).toLocaleString() : "—"} by {fsv.engineer?.fullName ?? "—"}
          </p>
        )}
        {(fsv.gpsLatAtCheckin != null || fsv.gpsLongAtCheckin != null) && (
          <p className="mt-1 text-xs text-muted">
            GPS at check-in:{" "}
            <a
              href={`https://www.google.com/maps?q=${fsv.gpsLatAtCheckin},${fsv.gpsLongAtCheckin}`}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-navy underline"
            >
              Open in Google Maps
            </a>
          </p>
        )}
      </div>

      <TimestampRow fsv={fsv} readOnly={readOnly} onSave={saveField} />

      <div>
        <label className="mb-1.5 block text-xs font-bold text-navy">Work Performed (min 20 characters)</label>
        <textarea
          defaultValue={fsv.workPerformed ?? ""}
          disabled={readOnly}
          onBlur={(e) => saveField({ workPerformed: e.target.value })}
          className="h-24 w-full rounded-md border border-line p-2 text-sm text-navy disabled:bg-navy-soft"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-bold text-navy">
          Findings / Root Cause <span className="font-normal text-muted">(required for Breakdown/Warranty)</span>
        </label>
        <textarea
          defaultValue={fsv.findingsRootCause ?? ""}
          disabled={readOnly}
          onBlur={(e) => saveField({ findingsRootCause: e.target.value })}
          className="h-20 w-full rounded-md border border-line p-2 text-sm text-navy disabled:bg-navy-soft"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-bold text-navy">Recommendations (optional)</label>
        <textarea
          defaultValue={fsv.recommendations ?? ""}
          disabled={readOnly}
          onBlur={(e) => saveField({ recommendations: e.target.value })}
          className="h-20 w-full rounded-md border border-line p-2 text-sm text-navy disabled:bg-navy-soft"
        />
      </div>

      <PartsSection fsv={fsv} readOnly={readOnly} onSave={saveField} reload={load} onError={setError} onQueued={refreshQueue} online={online} />

      <PhotosSection fsv={fsv} readOnly={readOnly} reload={load} onError={setError} onQueued={refreshQueue} />

      <ReportSection fsv={fsv} readOnly={readOnly} reload={load} onError={setError} onQueued={refreshQueue} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">Customer Representative Name</label>
          <input
            type="text"
            defaultValue={fsv.customerRepName ?? ""}
            disabled={readOnly}
            onBlur={(e) => saveField({ customerRepName: e.target.value })}
            className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy disabled:bg-navy-soft"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">Designation</label>
          <input
            type="text"
            defaultValue={fsv.customerRepDesignation ?? ""}
            disabled={readOnly}
            onBlur={(e) => saveField({ customerRepDesignation: e.target.value })}
            className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy disabled:bg-navy-soft"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-bold text-navy">Customer Signature</label>
        <SignaturePad
          disabled={readOnly}
          onCapture={saveSignature}
        />
        {fsv.customerSignatureUrl && readOnly && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fsv.customerSignatureUrl} alt="Customer signature" className="mt-2 h-24 border border-line" />
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-navy">
        <input
          type="checkbox"
          checked={fsv.customerSignOff}
          disabled={readOnly}
          onChange={(e) => saveField({ customerSignOff: e.target.checked })}
        />
        Customer confirms sign-off on work performed
      </label>

      {notice && <p className="rounded-md bg-brand-green-bg px-3 py-2 text-xs text-brand-green">{notice}</p>}
      {error && <p className="rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {!readOnly && (
        <button
          onClick={async () => {
            setSaving(true);
            setError(null);
            try {
              const result = await submitFsv(fsv.id);
              if (isQueued(result)) {
                setNotice("You're offline — submission queued, will sync automatically once you're back online.");
                refreshQueue();
              } else {
                setNotice("Field Service Visit submitted. Add a resolution summary on the ticket page to mark it Engineer Resolved.");
                router.push(`/dashboard/tickets/${fsv.ticketId}`);
              }
            } catch (err) {
              if (err instanceof ApiError) {
                const body = err.body as { message?: string | string[] } | null;
                const msg = Array.isArray(body?.message) ? body!.message.join(", ") : body?.message;
                setError(msg ?? "Could not submit.");
              } else {
                setError("Could not reach the server.");
              }
            } finally {
              setSaving(false);
            }
          }}
          disabled={saving}
          className="rounded-md bg-orange px-4 py-2 text-sm font-bold text-navy transition disabled:opacity-50"
        >
          {saving ? "Submitting…" : "Submit Field Service Visit"}
        </button>
      )}
    </div>
  );
}

function TimestampRow({
  fsv,
  readOnly,
  onSave,
}: {
  fsv: FieldServiceVisit;
  readOnly: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const fields: { key: keyof FieldServiceVisit; label: string }[] = [
    { key: "travelStartTime", label: "Travel Start" },
    { key: "siteArrivalTime", label: "Site Arrival" },
    { key: "workStartTime", label: "Work Start" },
    { key: "workEndTime", label: "Work End" },
  ];

  // Client feedback (2026-07-31): "Total Travel/Work Hours fields are
  // missing" — no such stored field exists, and shouldn't (it's fully
  // derivable from the 4 timestamps above); computed here for display only.
  function hoursBetween(a: string | null, b: string | null): string | null {
    if (!a || !b) return null;
    const hours = (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60);
    return hours >= 0 ? hours.toFixed(1) : null;
  }
  const totalTravelHours = hoursBetween(fsv.travelStartTime, fsv.siteArrivalTime);
  const totalWorkHours = hoursBetween(fsv.workStartTime, fsv.workEndTime);

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="mb-1.5 block text-xs font-bold text-navy">{f.label}</label>
            <input
              type="datetime-local"
              defaultValue={(fsv[f.key] as string | null)?.slice(0, 16) ?? ""}
              disabled={readOnly}
              onBlur={(e) => e.target.value && onSave({ [f.key]: new Date(e.target.value).toISOString() })}
              className="h-10 w-full rounded-md border border-line px-2 text-xs text-navy disabled:bg-navy-soft"
            />
          </div>
        ))}
      </div>
      {(totalTravelHours || totalWorkHours) && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {totalTravelHours && (
            <div className="rounded-lg border border-line bg-navy-soft px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Total Travel Hours</p>
              <p className="text-lg font-bold text-navy">{totalTravelHours}h</p>
            </div>
          )}
          {totalWorkHours && (
            <div className="rounded-lg border border-line bg-navy-soft px-3 py-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Total Work Hours</p>
              <p className="text-lg font-bold text-navy">{totalWorkHours}h</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PartsSection({
  fsv,
  readOnly,
  onSave,
  reload,
  onError,
  onQueued,
  online,
}: {
  fsv: FieldServiceVisit;
  readOnly: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  reload: () => void;
  onError: (message: string | null) => void;
  online: boolean;
  onQueued: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [itemQuery, setItemQuery] = useState("");
  const [itemResults, setItemResults] = useState<ItemListItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemDetail | null>(null);
  const [qty, setQty] = useState("1");
  const [warehouse, setWarehouse] = useState("");
  const [rate, setRate] = useState("0");
  const [sellingRate, setSellingRate] = useState("0");
  const [busy, setBusy] = useState(false);

  // Price List selection (client feedback 2026-07-31: "On Quotation it is
  // showing so why not here?") — same per-line selector as the Quotation's
  // Add Item flow, driving which rate the item search returns.
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [priceListName, setPriceListName] = useState("");
  useEffect(() => {
    listPriceLists()
      .then((all) => {
        const active = all.filter((p) => p.isActive);
        setPriceLists(active);
        setPriceListName(fsv.priceListName ?? active.find((p) => p.isDefault)?.name ?? active[0]?.name ?? "");
      })
      .catch(() => setPriceLists([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback warehouse list (client-reported bug, 2026-08-04) — used when
  // the selected item has no stock rows of its own, so the Warehouse field
  // always has real options instead of degrading to free text.
  const [allWarehouses, setAllWarehouses] = useState<string[]>([]);
  useEffect(() => {
    listAllWarehouses()
      .then(setAllWarehouses)
      .catch(() => setAllWarehouses([]));
  }, []);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editWarehouse, setEditWarehouse] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editSellingRate, setEditSellingRate] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  function startEdit(p: FieldServiceVisit["parts"][number]) {
    setEditingId(p.id);
    setEditQty(String(p.qty));
    setEditWarehouse(p.warehouse);
    setEditRate(String(p.rate));
    setEditSellingRate(String(p.sellingRate));
  }

  async function saveEdit(partId: string) {
    setEditBusy(true);
    onError(null);
    try {
      await updateFsvPart(fsv.id, partId, {
        qty: Number(editQty),
        warehouse: editWarehouse,
        rate: Number(editRate),
        sellingRate: Number(editSellingRate),
      });
      setEditingId(null);
      reload();
    } catch (err) {
      onError(
        err instanceof ApiError ? (err.body as { message?: string | string[] })?.message?.toString() ?? "Could not update part." : "Could not update part.",
      );
    } finally {
      setEditBusy(false);
    }
  }

  useEffect(() => {
    if (itemQuery.trim().length < 2) {
      setItemResults([]);
      return;
    }
    const handle = setTimeout(() => {
      listItems(itemQuery.trim(), priceListName || undefined).then(setItemResults).catch(() => setItemResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [itemQuery, priceListName]);

  // Client-reported bug (2026-08-04): changing the Price List after an item
  // is already selected left the Rate/Selling Rate stale — the dropdown
  // stayed editable but nothing re-fetched against the new list. Skipped on
  // mount (the price-list-loading effect above sets the initial value once
  // priceLists resolve, which isn't a user-driven change and shouldn't
  // trigger a refetch before any item is even selected).
  const priceListMounted = useRef(false);
  useEffect(() => {
    if (!priceListMounted.current) {
      priceListMounted.current = true;
      return;
    }
    if (!selectedItem) return;
    const qs = priceListName ? `?priceListName=${encodeURIComponent(priceListName)}` : "";
    apiFetch<ItemDetail>(`/items/${encodeURIComponent(selectedItem.itemCode)}${qs}`)
      .then((detail) => setSellingRate(detail.sellingRate != null ? String(detail.sellingRate) : "0"))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceListName]);

  async function pickItem(it: ItemListItem) {
    const qs = priceListName ? `?priceListName=${encodeURIComponent(priceListName)}` : "";
    const detail = await apiFetch<ItemDetail>(`/items/${encodeURIComponent(it.itemCode)}${qs}`);
    setSelectedItem(detail);
    setWarehouse(detail.warehouseStock[0]?.warehouse ?? DEFAULT_WAREHOUSE);
    const costRate = Number(detail.valuationRate ?? detail.standardRate ?? 0);
    setRate(costRate ? String(costRate) : "0");
    setSellingRate(detail.sellingRate != null ? String(detail.sellingRate) : "0");
  }

  async function onAddPart() {
    if (!selectedItem) return;
    setBusy(true);
    onError(null);
    try {
      const result = await addFsvPart(fsv.id, {
        itemCode: selectedItem.itemCode,
        itemName: selectedItem.itemName,
        qty: Number(qty),
        uom: selectedItem.uom,
        warehouse,
        rate: Number(rate),
        sellingRate: Number(sellingRate),
      });
      if (isQueued(result)) onQueued();
      reload();
      setShowAdd(false);
      setSelectedItem(null);
      setItemQuery("");
      setQty("1");
      setRate("0");
      setSellingRate("0");
    } catch (err) {
      onError(err instanceof ApiError ? (err.body as { message?: string | string[] })?.message?.toString() ?? "Could not add part." : "Could not add part.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-bold text-navy">Parts Consumed</label>
        {!readOnly && (
          <button type="button" onClick={() => setShowAdd(true)} className="text-xs font-bold text-navy hover:underline">
            + Add Part
          </button>
        )}
      </div>

      {!readOnly && (
        <label className={`mb-2 flex items-center gap-2 text-xs ${fsv.parts.length > 0 ? "text-muted" : "text-navy"}`}>
          <input
            type="checkbox"
            checked={fsv.noPartsUsed}
            disabled={fsv.parts.length > 0}
            onChange={(e) => onSave({ noPartsUsed: e.target.checked })}
          />
          No parts were used on this visit
          {fsv.parts.length > 0 && <span className="italic">(parts already logged)</span>}
        </label>
      )}

      {fsv.parts.length === 0 ? (
        <p className="text-xs text-muted">No parts logged.</p>
      ) : (
        <table className="w-full rounded-md border border-line bg-white text-xs">
          <thead>
            <tr className="border-b border-line text-left font-bold uppercase text-navy">
              <th className="px-2 py-1.5">Item</th>
              <th className="px-2 py-1.5">Qty</th>
              <th className="px-2 py-1.5">Warehouse</th>
              <th className="px-2 py-1.5">Rate</th>
              <th className="px-2 py-1.5">Amount</th>
              {!readOnly && <th className="px-2 py-1.5" />}
            </tr>
          </thead>
          <tbody>
            {fsv.parts.map((p) =>
              editingId === p.id ? (
                <tr key={p.id} className="border-b border-line bg-navy-soft last:border-0">
                  <td className="px-2 py-1.5 text-navy">{p.itemName}</td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={editQty}
                      onChange={(e) => setEditQty(e.target.value)}
                      className="h-7 w-16 rounded-md border border-line px-1 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={editWarehouse}
                      onChange={(e) => setEditWarehouse(e.target.value)}
                      className="h-7 w-24 rounded-md border border-line px-1 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={editSellingRate}
                      onChange={(e) => setEditSellingRate(e.target.value)}
                      className="h-7 w-20 rounded-md border border-line px-1 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-muted">
                    {/* Amount isn't directly editable — derived from Qty × Rate — so it's shown live here as a preview, not an input. */}
                    ₹{((Number(editQty) || 0) * (Number(editSellingRate) || 0)).toFixed(2)}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <button onClick={() => saveEdit(p.id)} disabled={editBusy} className="mr-2 font-bold text-brand-green disabled:opacity-50">
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="font-bold text-muted">
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-2 py-1.5 text-navy">{p.itemName}</td>
                  <td className="px-2 py-1.5 text-muted">
                    {p.qty} {p.uom}
                  </td>
                  <td className="px-2 py-1.5 text-muted">{p.warehouse}</td>
                  <td className="px-2 py-1.5 text-muted">₹{p.sellingRate}</td>
                  <td className="px-2 py-1.5 text-muted">₹{p.amount}</td>
                  {!readOnly && (
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(p)} className="mr-2 font-bold text-navy">
                        Edit
                      </button>
                      <button
                        onClick={() =>
                          removeFsvPart(fsv.id, p.id)
                            .then(reload)
                            .catch(() => onError("Could not remove part."))
                        }
                        className="font-bold text-brand-red"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}

      {showAdd && (
        <div className="mt-2 space-y-2 rounded-md border border-line bg-navy-soft p-3">
          {priceLists.length > 0 && (
            <div>
              <label className="text-xs text-muted">Price List</label>
              <select
                value={priceListName}
                onChange={(e) => setPriceListName(e.target.value)}
                className="h-9 w-full rounded-md border border-line px-2 text-sm"
              >
                {priceLists.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!online && (
            <p className="rounded-md bg-brand-amber-bg px-2 py-1.5 text-xs text-brand-amber">
              Item search needs a connection — the item catalog isn&apos;t stored on this device. Search once you&apos;re back online, or if you already know the part, add it as soon as you reconnect.
            </p>
          )}
          {!selectedItem ? (
            <div className="relative">
              <input
                type="text"
                value={itemQuery}
                onChange={(e) => setItemQuery(e.target.value)}
                placeholder="Search item…"
                disabled={!online}
                className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy disabled:bg-navy-soft disabled:text-muted"
              />
              {itemResults.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-line bg-white shadow-lg">
                  {itemResults.map((it) => (
                    <button
                      key={it.itemCode}
                      type="button"
                      onClick={() => pickItem(it)}
                      className="block w-full px-3 py-2 text-left text-sm text-navy hover:bg-navy-tint"
                    >
                      {it.itemCode} — {it.itemName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm font-bold text-navy">{selectedItem.itemName}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div>
                  <label className="text-xs text-muted">Qty</label>
                  <input
                    type="number"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="h-9 w-full rounded-md border border-line px-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted">Warehouse</label>
                  {selectedItem.warehouseStock.length > 0 ? (
                    <select
                      value={warehouse}
                      onChange={(e) => setWarehouse(e.target.value)}
                      className="h-9 w-full rounded-md border border-line px-2 text-sm"
                    >
                      {selectedItem.warehouseStock.map((w) => (
                        <option key={w.warehouse} value={w.warehouse}>
                          {w.warehouse} ({w.actualQty})
                        </option>
                      ))}
                    </select>
                  ) : (
                    // No warehouse stock on file for this item (e.g. not yet
                    // synced from ERPNext) — falls back to every warehouse
                    // synced across all items (client-reported bug,
                    // 2026-08-04), defaulted to DEFAULT_WAREHOUSE via
                    // pickItem(), rather than a free-text box with nothing
                    // to pick from.
                    <select
                      value={warehouse}
                      onChange={(e) => setWarehouse(e.target.value)}
                      className="h-9 w-full rounded-md border border-line px-2 text-sm"
                    >
                      {!allWarehouses.includes(warehouse) && warehouse && (
                        <option value={warehouse}>{warehouse}</option>
                      )}
                      {allWarehouses.map((w) => (
                        <option key={w} value={w}>
                          {w}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="text-xs text-muted">Rate</label>
                  <input
                    type="number"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="h-9 w-full rounded-md border border-line px-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted">Selling Rate</label>
                  <input
                    type="number"
                    value={sellingRate}
                    onChange={(e) => setSellingRate(e.target.value)}
                    className="h-9 w-full rounded-md border border-line px-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onAddPart}
                  disabled={busy || !warehouse}
                  className="rounded-md bg-orange px-3 py-1.5 text-xs font-bold text-navy disabled:opacity-50"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setSelectedItem(null);
                    setRate("0");
                    setSellingRate("0");
                  }}
                  className="text-xs font-bold text-muted"
                >
                  Change item
                </button>
              </div>
            </>
          )}
          <button onClick={() => setShowAdd(false)} className="text-xs font-bold text-muted">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function PhotosSection({
  fsv,
  readOnly,
  reload,
  onError,
  onQueued,
}: {
  fsv: FieldServiceVisit;
  readOnly: boolean;
  reload: () => void;
  onError: (message: string | null) => void;
  onQueued: () => void;
}) {
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Client request (2026-08-03) — remove a wrongly-uploaded photo before
  // submit. Online-only (not offline-queued), same as removeFsvPart — a
  // mistaken upload is best fixed live rather than queued for later.
  async function onRemove(photoId: string) {
    setRemovingId(photoId);
    onError(null);
    try {
      await removeFsvPhoto(fsv.id, photoId);
      reload();
    } catch {
      onError("Could not remove photo.");
    } finally {
      setRemovingId(null);
    }
  }

  // Client feedback (2026-07-31): "Multiple photos cannot be uploaded in a
  // single FSV" — the backend already allowed up to 5 total (one at a time,
  // repeated calls); the gap was the file picker only ever taking one file
  // per click. Now accepts a multi-select and uploads each sequentially
  // (not parallel — avoids exceeding MAX_PHOTOS mid-flight if the count is
  // right at the limit).
  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-selecting the same file(s) back-to-back
    if (files.length === 0) return;
    const remaining = 5 - fsv.photos.length;
    const toUpload = files.slice(0, remaining);
    setUploading(true);
    onError(null);
    try {
      let queuedCount = 0;
      for (const file of toUpload) {
        const result = await uploadFsvPhoto(fsv.id, file, caption.trim() || undefined);
        if (isQueued(result)) queuedCount++;
      }
      if (files.length > toUpload.length) {
        onError(`Only ${toUpload.length} of ${files.length} photos uploaded — maximum 5 photos per visit.`);
      }
      if (queuedCount > 0) {
        onError(null);
        onQueued();
      }
      setCaption("");
      reload();
    } catch (err) {
      onError(err instanceof ApiError ? (err.body as { message?: string })?.message ?? "Upload failed" : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const atMax = fsv.photos.length >= 5;

  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold text-navy">
        Photos <span className="font-normal text-muted">(1–5 required, max 2MB each)</span>
      </label>
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {fsv.photos.map((p) => (
          // Remove button always visible (not hover-gated) — engineers use
          // this mostly on mobile/tablet, where hover doesn't exist.
          <div key={p.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.caption ?? "Visit photo"} className="h-20 w-full rounded-md border border-line object-cover" />
            {!readOnly && (
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                disabled={removingId === p.id}
                title="Remove photo"
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-red text-xs font-bold text-white shadow disabled:opacity-50"
              >
                {removingId === p.id ? "…" : "×"}
              </button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && !atMax && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption (optional)"
            className="h-9 w-40 rounded-md border border-line px-2 text-sm text-navy"
          />
          <label className="flex h-9 cursor-pointer items-center rounded-md bg-navy-tint px-3 text-xs font-bold text-navy">
            {uploading ? "Uploading…" : "Upload Photo(s)"}
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
              onChange={onFileSelected}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
      )}
      {!readOnly && atMax && <p className="text-xs text-muted">Maximum 5 photos reached.</p>}
    </div>
  );
}

function ReportSection({
  fsv,
  readOnly,
  reload,
  onError,
  onQueued,
}: {
  fsv: FieldServiceVisit;
  readOnly: boolean;
  reload: () => void;
  onError: (message: string | null) => void;
  onQueued: () => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    onError(null);
    try {
      const result = await uploadFsvReport(fsv.id, file);
      if (isQueued(result)) {
        onQueued();
      } else {
        reload();
      }
    } catch (err) {
      onError(err instanceof ApiError ? (err.body as { message?: string })?.message ?? "Upload failed" : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold text-navy">
        Service Report <span className="font-normal text-muted">(required — scanned document, JPEG/PNG/PDF)</span>
      </label>
      {fsv.visitReportUrl ? (
        <a href={fsv.visitReportUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-navy underline">
          View uploaded Service Report
        </a>
      ) : (
        <p className="text-xs text-muted">No Service Report attached yet.</p>
      )}
      {!readOnly && (
        <div className="mt-2">
          <label className="flex h-9 w-fit cursor-pointer items-center rounded-md bg-navy-tint px-3 text-xs font-bold text-navy">
            {uploading ? "Uploading…" : fsv.visitReportUrl ? "Replace Service Report" : "Upload Service Report"}
            <input
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={onFileSelected}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>
      )}
    </div>
  );
}
