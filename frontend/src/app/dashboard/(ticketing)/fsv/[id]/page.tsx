"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import SignaturePad from "@/components/fsv/SignaturePad";
import {
  addFsvPart,
  FieldServiceVisit,
  getFsv,
  removeFsvPart,
  submitFsv,
  updateFsv,
  uploadFsvPhoto,
  uploadFsvSignature,
} from "@/lib/ticketing/fsv";
import { ItemListItem, listItems } from "@/lib/ticketing/masters";
import { apiFetch } from "@/lib/api";

interface ItemWarehouseStock {
  warehouse: string;
  actualQty: number;
}
interface ItemDetail extends ItemListItem {
  warehouseStock: ItemWarehouseStock[];
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

  function load() {
    getFsv(id)
      .then(setFsv)
      .catch(() => setError("Could not load this Field Service Visit."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function saveField(patch: Record<string, unknown>) {
    if (!fsv || fsv.status === "SUBMITTED") return;
    setSaving(true);
    try {
      const updated = await updateFsv(fsv.id, patch);
      setFsv(updated);
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
      const updated = await uploadFsvSignature(fsv.id, blob);
      setFsv(updated);
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
      <div>
        <p className="font-mono text-xs text-muted">{fsv.visitNo}</p>
        <h1 className="text-xl font-bold text-navy">Field Service Visit #{fsv.visitNumber}</h1>
        <span
          className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
            readOnly ? "bg-brand-green-bg text-brand-green" : "bg-navy-tint text-navy"
          }`}
        >
          {fsv.status}
        </span>
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

      <PartsSection fsv={fsv} readOnly={readOnly} onSave={saveField} reload={load} />

      <PhotosSection fsv={fsv} readOnly={readOnly} reload={load} onError={setError} />

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
              await submitFsv(fsv.id);
              setNotice("Field Service Visit submitted — ticket marked Engineer Resolved.");
              router.push(`/dashboard/tickets/${fsv.ticketId}`);
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
  return (
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
  );
}

function PartsSection({
  fsv,
  readOnly,
  onSave,
  reload,
}: {
  fsv: FieldServiceVisit;
  readOnly: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  reload: () => void;
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

  useEffect(() => {
    if (itemQuery.trim().length < 2) {
      setItemResults([]);
      return;
    }
    const handle = setTimeout(() => {
      listItems(itemQuery.trim()).then(setItemResults).catch(() => setItemResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [itemQuery]);

  async function pickItem(it: ItemListItem) {
    const detail = await apiFetch<ItemDetail>(`/items/${encodeURIComponent(it.itemCode)}`);
    setSelectedItem(detail);
    setWarehouse(detail.warehouseStock[0]?.warehouse ?? "");
  }

  async function onAddPart() {
    if (!selectedItem) return;
    setBusy(true);
    try {
      await addFsvPart(fsv.id, {
        itemCode: selectedItem.itemCode,
        itemName: selectedItem.itemName,
        qty: Number(qty),
        uom: selectedItem.uom,
        warehouse,
        rate: Number(rate),
        sellingRate: Number(sellingRate),
      });
      reload();
      setShowAdd(false);
      setSelectedItem(null);
      setItemQuery("");
      setQty("1");
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
        <label className="mb-2 flex items-center gap-2 text-xs text-navy">
          <input
            type="checkbox"
            checked={fsv.noPartsUsed}
            onChange={(e) => onSave({ noPartsUsed: e.target.checked })}
          />
          No parts were used on this visit
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
              <th className="px-2 py-1.5">Amount</th>
              {!readOnly && <th className="px-2 py-1.5" />}
            </tr>
          </thead>
          <tbody>
            {fsv.parts.map((p) => (
              <tr key={p.id} className="border-b border-line last:border-0">
                <td className="px-2 py-1.5 text-navy">{p.itemName}</td>
                <td className="px-2 py-1.5 text-muted">
                  {p.qty} {p.uom}
                </td>
                <td className="px-2 py-1.5 text-muted">{p.warehouse}</td>
                <td className="px-2 py-1.5 text-muted">₹{p.amount}</td>
                {!readOnly && (
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={() => removeFsvPart(fsv.id, p.id).then(reload)}
                      className="font-bold text-brand-red"
                    >
                      Remove
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAdd && (
        <div className="mt-2 space-y-2 rounded-md border border-line bg-navy-soft p-3">
          {!selectedItem ? (
            <div className="relative">
              <input
                type="text"
                value={itemQuery}
                onChange={(e) => setItemQuery(e.target.value)}
                placeholder="Search item…"
                className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy"
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
                <button onClick={() => setSelectedItem(null)} className="text-xs font-bold text-muted">
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
}: {
  fsv: FieldServiceVisit;
  readOnly: boolean;
  reload: () => void;
  onError: (message: string | null) => void;
}) {
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file back-to-back
    if (!file) return;
    setUploading(true);
    onError(null);
    try {
      await uploadFsvPhoto(fsv.id, file, caption.trim() || undefined);
      setCaption("");
      reload();
    } catch (err) {
      onError(err instanceof ApiError ? (err.body as { message?: string })?.message ?? "Upload failed" : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold text-navy">
        Photos <span className="font-normal text-muted">(≥1 required for Breakdown tickets)</span>
      </label>
      <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {fsv.photos.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={p.id} src={p.url} alt={p.caption ?? "Visit photo"} className="h-20 w-full rounded-md border border-line object-cover" />
        ))}
      </div>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption (optional)"
            className="h-9 w-40 rounded-md border border-line px-2 text-sm text-navy"
          />
          <label className="flex h-9 cursor-pointer items-center rounded-md bg-navy-tint px-3 text-xs font-bold text-navy">
            {uploading ? "Uploading…" : "Upload Photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
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
