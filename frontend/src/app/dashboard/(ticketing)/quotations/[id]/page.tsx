"use client";

import { use, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import {
  addQuotationItem,
  checkDeliveryNoteForQuotation,
  createInvoiceFromQuotation,
  createSalesOrderFromQuotation,
  getQuotation,
  pushQuotationToErpNext,
  Quotation,
  QuotationItem,
  removeQuotationItem,
  updateCustomerPo,
  updateQuotation,
  updateQuotationItem,
  uploadCustomerPoDocument,
} from "@/lib/ticketing/quotation";
import { ItemDetail, ItemListItem, listItems } from "@/lib/ticketing/masters";
import { listPriceLists, PriceList } from "@/lib/ticketing/price-lists";

const STATUS_LABEL: Record<Quotation["status"], string> = {
  DRAFT: "Draft (in ACE)",
  SENT: "In ERPNext — negotiation & submission pending",
  CUSTOMER_ACCEPTED: "Customer Accepted",
  PO_RECEIVED: "PO Received",
  CONVERTED_TO_SALES_ORDER: "Sales Order Created",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

// Quotation screen — per Shivam's 2026-07-23 revised pipeline: ACE only
// assembles the initial items and pushes a DRAFT Quotation to ERPNext.
// Negotiation, submission, the resulting Sales Order, the manual Delivery
// Note, and the eventual draft Sales Invoice all happen in/from ERPNext from
// that point on (webhook/poll-driven) — nothing left to click in ACE after
// the push, this screen just reflects status as it updates.
export default function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultModal, setResultModal] = useState<{ title: string; message: string; success: boolean } | null>(null);

  function extractErrorMessage(err: unknown): string {
    if (err instanceof ApiError) {
      const body = err.body as { message?: string | string[] } | null;
      return Array.isArray(body?.message) ? body!.message.join(", ") : body?.message ?? "Something went wrong.";
    }
    return "Could not reach the server.";
  }

  function load() {
    getQuotation(id)
      .then(setQuotation)
      .catch(() => setError("Could not load this quotation."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function run<T>(action: () => Promise<T>, successNote?: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (successNote) setNotice(successNote);
      load();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string | string[] } | null;
        const msg = Array.isArray(body?.message) ? body!.message.join(", ") : body?.message;
        setError(msg ?? "Action failed.");
      } else {
        setError("Could not reach the server.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="p-8 text-sm text-muted">Loading…</p>;
  if (error && !quotation) return <p className="p-8 text-sm text-brand-red">{error}</p>;
  if (!quotation) return null;

  const editable = !quotation.erpnextQuotationId;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-xs text-muted">{quotation.quotationNo}</p>
          <h1 className="text-xl font-bold text-navy">{quotation.customer?.customerName}</h1>
          <span className="mt-1 inline-block rounded-full bg-navy-tint px-2.5 py-0.5 text-[10px] font-bold text-navy">
            {STATUS_LABEL[quotation.status]}
          </span>
        </div>
        <a
          href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api/v1"}/quotations/${quotation.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="rounded-md bg-navy-tint px-3 py-1.5 text-xs font-bold text-navy hover:bg-navy hover:text-white"
        >
          Download PDF
        </a>
      </div>

      {notice && <p className="rounded-md bg-brand-green-bg px-3 py-2 text-xs text-brand-green">{notice}</p>}
      {error && <p className="rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {!editable && (
        <p className="rounded-md bg-navy-soft px-3 py-2 text-xs text-navy">
          This quotation is in ERPNext ({quotation.erpnextQuotationId}) — negotiation, quantity/price changes, and
          submission all happen there now, not in ACE. This page just reflects status as it updates.
        </p>
      )}

      <InfoBlock quotation={quotation} reload={load} />

      <HeaderFields quotation={quotation} editable={editable} onSave={(patch) => run(() => updateQuotation(quotation.id, patch))} />

      <ItemsSection quotation={quotation} editable={editable} run={run} />

      <div className="rounded-lg border border-line bg-white p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">Subtotal</span>
          <span className="text-navy">₹{quotation.subtotal ?? 0}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Labour</span>
          <span className="text-navy">₹{quotation.labourCharges ?? 0}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Tax</span>
          <span className="text-navy">₹{quotation.taxAmount ?? 0}</span>
        </div>
        <div className="flex justify-between border-t border-line pt-1 font-bold">
          <span className="text-navy">Grand Total</span>
          <span className="text-navy">₹{quotation.grandTotal ?? 0}</span>
        </div>
      </div>

      {editable && (
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await pushQuotationToErpNext(quotation.id);
              load();
              setResultModal({
                title: "Pushed to ERPNext",
                message: "Draft Quotation created in ERPNext.",
                success: true,
              });
            } catch (err) {
              setResultModal({ title: "Could not push to ERPNext", message: extractErrorMessage(err), success: false });
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy || quotation.items.length === 0}
          className="rounded-md bg-orange px-4 py-2 text-sm font-bold text-navy disabled:opacity-50"
        >
          {busy ? "Pushing…" : "Push to ERPNext"}
        </button>
      )}

      {resultModal && (
        <Modal title={resultModal.title} onClose={() => setResultModal(null)}>
          <p className={`text-sm ${resultModal.success ? "text-brand-green" : "text-brand-red"}`}>
            {resultModal.message}
          </p>
          <div className="mt-3">
            <button
              onClick={() => setResultModal(null)}
              className="rounded-md bg-orange px-4 py-2 text-sm font-bold text-navy"
            >
              OK
            </button>
          </div>
        </Modal>
      )}

      {!editable && (
        <div className="space-y-2 rounded-lg border border-line bg-white p-4 text-sm">
          <p className="text-xs font-bold uppercase text-muted">ERPNext Pipeline Status</p>
          <StatusRow label="Quotation" value={quotation.erpnextQuotationId} />
          <div className="flex items-center justify-between">
            <StatusRow className="flex-1" label="Sales Order" value={quotation.erpnextSalesOrderId} pending="Awaiting negotiation & submission in ERPNext" />
            {!quotation.erpnextSalesOrderId && (
              <button
                onClick={async () => {
                  setBusy(true);
                  try {
                    await createSalesOrderFromQuotation(quotation.id);
                    load();
                    setResultModal({ title: "Sales Order created", message: "Submitted in ERPNext.", success: true });
                  } catch (err) {
                    setResultModal({ title: "Could not create Sales Order", message: extractErrorMessage(err), success: false });
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                className="ml-3 shrink-0 rounded-md bg-orange px-3 py-1 text-xs font-bold text-navy disabled:opacity-50"
              >
                Create Sales Order
              </button>
            )}
          </div>
          <div className="flex items-center justify-between">
            <StatusRow className="flex-1" label="Delivery Note" value={quotation.erpnextDeliveryNoteId} pending="Awaiting manual Delivery Note in ERPNext" />
            {quotation.erpnextSalesOrderId && !quotation.erpnextDeliveryNoteId && (
              <button
                onClick={async () => {
                  setBusy(true);
                  try {
                    await checkDeliveryNoteForQuotation(quotation.id);
                    load();
                    setResultModal({ title: "Delivery Note found", message: "Fetched from ERPNext.", success: true });
                  } catch (err) {
                    setResultModal({ title: "Could not check Delivery Note", message: extractErrorMessage(err), success: false });
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                className="ml-3 shrink-0 rounded-md bg-orange px-3 py-1 text-xs font-bold text-navy disabled:opacity-50"
              >
                Check Delivery Note
              </button>
            )}
          </div>
          <div className="flex items-center justify-between">
            <StatusRow
              className="flex-1"
              label="Sales Invoice (draft)"
              value={quotation.erpnextInvoiceId}
              pending={
                quotation.ticket?.status !== "CLOSED"
                  ? "Awaiting ticket closure"
                  : "Awaiting Sales Order status “To Bill”"
              }
            />
            {/* Client decision (2026-07-27): Create Invoice only becomes available once
                the ticket is fully Closed — not merely once the Sales Order exists. */}
            {quotation.erpnextSalesOrderId && !quotation.erpnextInvoiceId && quotation.ticket?.status === "CLOSED" && (
              <button
                onClick={async () => {
                  setBusy(true);
                  try {
                    await createInvoiceFromQuotation(quotation.id);
                    load();
                    setResultModal({ title: "Sales Invoice created", message: "Draft created in ERPNext.", success: true });
                  } catch (err) {
                    setResultModal({ title: "Could not create Invoice", message: extractErrorMessage(err), success: false });
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                className="ml-3 shrink-0 rounded-md bg-orange px-3 py-1 text-xs font-bold text-navy disabled:opacity-50"
              >
                Create Invoice
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase text-navy">{title}</h3>
          <button type="button" onClick={onClose} className="text-lg leading-none text-muted hover:text-navy">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusRow({
  label,
  value,
  pending,
  className,
}: {
  label: string;
  value: string | null;
  pending?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between ${className ?? ""}`}>
      <span className="text-muted">{label}</span>
      <span className={value ? "font-bold text-navy" : "text-xs text-muted"}>{value ?? pending ?? "—"}</span>
    </div>
  );
}

const DELIVERY_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  PARTIAL: "Partial",
  DELIVERED: "Delivered",
};

/**
 * Read-only info block (2026-08-01, client feedback) — every field here was
 * already returned by the backend, just never rendered anywhere on this
 * page. HeaderFields below only ever covered the fields someone actively
 * edits (Valid Until, Labour, Notes, T&C); this covers the system-tracked /
 * informational ones (who created it, when, PO paperwork, delivery status).
 */
function InfoBlock({ quotation, reload }: { quotation: Quotation; reload: () => void }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Customer ID", value: <span className="font-mono text-xs">{quotation.customerId}</span> },
    { label: "Created By", value: quotation.createdByUser?.fullName ?? "—" },
    { label: "Quotation Date", value: new Date(quotation.quotationDate).toLocaleDateString() },
    { label: "Sent At", value: quotation.sentAt ? new Date(quotation.sentAt).toLocaleString() : "—" },
    { label: "Delivery Status", value: DELIVERY_STATUS_LABEL[quotation.deliveryStatus] ?? quotation.deliveryStatus },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 rounded-lg border border-line bg-white p-4 text-sm sm:grid-cols-2 md:grid-cols-5">
        {rows.map((r) => (
          <div key={r.label} className="min-w-0">
            <p className="text-xs font-bold uppercase text-muted">{r.label}</p>
            <p className="break-words text-navy">{r.value}</p>
          </div>
        ))}
      </div>
      <CustomerPoBlock quotation={quotation} reload={reload} />
    </div>
  );
}

/**
 * Customer PO capture — client decision (2026-08-01): manual entry in ACE
 * once the customer sends the PO (email/phone), not synced from ERPNext.
 * Deliberately NOT gated by the quotation's own `editable` lock — a PO
 * normally arrives after the quotation is already pushed to ERPNext, so
 * this has to stay editable even when the rest of the page is read-only.
 */
function CustomerPoBlock({ quotation, reload }: { quotation: Quotation; reload: () => void }) {
  const [poNumber, setPoNumber] = useState(quotation.customerPoNumber ?? "");
  const [poDate, setPoDate] = useState(quotation.customerPoDate?.slice(0, 10) ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      await updateCustomerPo(quotation.id, {
        customerPoNumber: poNumber.trim() || undefined,
        customerPoDate: poDate || undefined,
      });
      reload();
    } catch {
      setError("Could not save the Customer PO details.");
    } finally {
      setSaving(false);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadCustomerPoDocument(quotation.id, file);
      reload();
    } catch {
      setError("Could not upload the Customer PO document.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="mb-3 text-xs font-bold uppercase text-muted">Customer PO</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">PO Number</label>
          <input
            value={poNumber}
            onChange={(e) => setPoNumber(e.target.value)}
            onBlur={onSave}
            disabled={saving}
            className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy disabled:bg-navy-soft"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">PO Date</label>
          <input
            type="date"
            value={poDate}
            onChange={(e) => setPoDate(e.target.value)}
            onBlur={onSave}
            disabled={saving}
            className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy disabled:bg-navy-soft"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">PO Document</label>
          {quotation.customerPoDocUrl ? (
            <a href={quotation.customerPoDocUrl} target="_blank" rel="noreferrer" className="block h-10 pt-2 text-sm font-bold text-navy underline">
              View document
            </a>
          ) : null}
          <label className="mt-1 flex h-9 w-fit cursor-pointer items-center rounded-md bg-navy-tint px-3 text-xs font-bold text-navy">
            {uploading ? "Uploading…" : quotation.customerPoDocUrl ? "Replace" : "Upload"}
            <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={onUpload} disabled={uploading} className="hidden" />
          </label>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-brand-red">{error}</p>}
    </div>
  );
}

function HeaderFields({
  quotation,
  editable,
  onSave,
}: {
  quotation: Quotation;
  editable: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 rounded-lg border border-line bg-white p-4 sm:grid-cols-2">
      <div>
        <label className="mb-1.5 block text-xs font-bold text-navy">Valid Until</label>
        <input
          type="date"
          defaultValue={quotation.validUntil.slice(0, 10)}
          disabled={!editable}
          onBlur={(e) => onSave({ validUntil: e.target.value })}
          className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy disabled:bg-navy-soft"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-bold text-navy">Labour Charges (₹)</label>
        <input
          type="number"
          defaultValue={quotation.labourCharges ? Number(quotation.labourCharges) : ""}
          disabled={!editable}
          onBlur={(e) => onSave({ labourCharges: Number(e.target.value) })}
          className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy disabled:bg-navy-soft"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1.5 block text-xs font-bold text-navy">Notes to Customer (optional)</label>
        <textarea
          defaultValue={quotation.notesToCustomer ?? ""}
          disabled={!editable}
          onBlur={(e) => onSave({ notesToCustomer: e.target.value })}
          className="h-16 w-full rounded-md border border-line p-2 text-sm text-navy disabled:bg-navy-soft"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1.5 block text-xs font-bold text-navy">Terms &amp; Conditions (optional)</label>
        <textarea
          defaultValue={quotation.termsAndConditions ?? ""}
          disabled={!editable}
          onBlur={(e) => onSave({ termsAndConditions: e.target.value })}
          className="h-16 w-full rounded-md border border-line p-2 text-sm text-navy disabled:bg-navy-soft"
        />
      </div>
    </div>
  );
}

function ItemsSection({
  quotation,
  editable,
  run,
}: {
  quotation: Quotation;
  editable: boolean;
  run: <T>(action: () => Promise<T>, note?: string) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ItemListItem[]>([]);
  const [selected, setSelected] = useState<ItemListItem | null>(null);
  const [qty, setQty] = useState("1");
  const [unitPrice, setUnitPrice] = useState("0");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editUnitPrice, setEditUnitPrice] = useState("");
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [linePriceListName, setLinePriceListName] = useState("");

  function startEdit(it: QuotationItem) {
    setEditingId(it.id);
    setEditQty(String(it.qty));
    setEditUnitPrice(String(it.unitPrice));
  }

  useEffect(() => {
    listPriceLists()
      .then((all) => {
        const active = all.filter((p) => p.isActive);
        setPriceLists(active);
        setLinePriceListName(active.find((p) => p.isDefault)?.name ?? active[0]?.name ?? "");
      })
      .catch(() => setPriceLists([]));
  }, []);

  // Per-line price list (client confirmed 2026-07-25 a single quotation can
  // genuinely mix rates from different price lists across its lines) — the
  // rate lookup and the search itself are both scoped to whichever price
  // list is currently picked for this line, re-querying when it changes.
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      listItems(query.trim(), linePriceListName || undefined)
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, linePriceListName]);

  // Client-reported bug (2026-08-04): changing the Price List after an item
  // is already selected left Unit Price stale — nothing re-fetched against
  // the new list. Skipped on mount (the effect above sets the initial
  // linePriceListName once priceLists resolve, which isn't a user-driven
  // change and shouldn't trigger a refetch before any item is selected).
  const linePriceListMounted = useRef(false);
  useEffect(() => {
    if (!linePriceListMounted.current) {
      linePriceListMounted.current = true;
      return;
    }
    if (!selected) return;
    const qs = linePriceListName ? `?priceListName=${encodeURIComponent(linePriceListName)}` : "";
    apiFetch<ItemDetail>(`/items/${encodeURIComponent(selected.itemCode)}${qs}`)
      .then((detail) => setUnitPrice(detail.sellingRate != null ? String(detail.sellingRate) : "0"))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linePriceListName]);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-bold text-navy">Items</label>
        {editable && (
          <button type="button" onClick={() => setShowAdd(true)} className="text-xs font-bold text-navy hover:underline">
            + Add Item
          </button>
        )}
      </div>

      {quotation.items.length === 0 ? (
        <p className="text-xs text-muted">No items yet.</p>
      ) : (
        <table className="w-full rounded-md border border-line bg-white text-xs">
          <thead>
            <tr className="border-b border-line text-left font-bold uppercase text-navy">
              <th className="px-2 py-1.5">Item</th>
              <th className="px-2 py-1.5">Qty</th>
              <th className="px-2 py-1.5">Unit Price</th>
              <th className="px-2 py-1.5">Line Total</th>
              {editable && <th className="px-2 py-1.5" />}
            </tr>
          </thead>
          <tbody>
            {quotation.items.map((it) =>
              editingId === it.id ? (
                <tr key={it.id} className="border-b border-line last:border-0 bg-navy-soft">
                  <td className="px-2 py-1.5 text-navy">{it.itemName}</td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={editQty}
                      onChange={(e) => setEditQty(e.target.value)}
                      className="h-8 w-16 rounded-md border border-line px-1.5 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      value={editUnitPrice}
                      onChange={(e) => setEditUnitPrice(e.target.value)}
                      className="h-8 w-20 rounded-md border border-line px-1.5 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5 text-muted">₹{it.lineTotal}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <button
                      onClick={() => {
                        run(() =>
                          updateQuotationItem(quotation.id, it.id, {
                            qty: Number(editQty),
                            unitPrice: Number(editUnitPrice),
                          }),
                        );
                        setEditingId(null);
                      }}
                      className="mr-2 font-bold text-brand-green"
                    >
                      Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="font-bold text-muted">
                      Cancel
                    </button>
                  </td>
                </tr>
              ) : (
                <tr key={it.id} className="border-b border-line last:border-0">
                  <td className="px-2 py-1.5 text-navy">{it.itemName}</td>
                  <td className="px-2 py-1.5 text-muted">
                    {it.qty} {it.uom}
                  </td>
                  <td className="px-2 py-1.5 text-muted">₹{it.unitPrice}</td>
                  <td className="px-2 py-1.5 text-muted">₹{it.lineTotal}</td>
                  {editable && (
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(it)} className="mr-2 font-bold text-navy">
                        Edit
                      </button>
                      <button
                        onClick={() => run(() => removeQuotationItem(quotation.id, it.id))}
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
                value={linePriceListName}
                onChange={(e) => setLinePriceListName(e.target.value)}
                className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy"
              >
                {priceLists.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!selected ? (
            <div className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search item…"
                className="h-9 w-full rounded-md border border-line px-2 text-sm text-navy"
              />
              {results.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-line bg-white shadow-lg">
                  {results.map((it) => (
                    <button
                      key={it.itemCode}
                      type="button"
                      onClick={() => {
                        setSelected(it);
                        if (it.rate != null) setUnitPrice(String(it.rate));
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-navy hover:bg-navy-tint"
                    >
                      {it.itemCode} — {it.itemName}
                      {it.rate != null && <span className="ml-2 text-xs text-muted">₹{it.rate}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              <p className="text-sm font-bold text-navy">{selected.itemName}</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted">Qty</label>
                  <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="h-9 w-full rounded-md border border-line px-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted">Unit Price</label>
                  <input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="h-9 w-full rounded-md border border-line px-2 text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    run(() =>
                      addQuotationItem(quotation.id, {
                        itemCode: selected.itemCode,
                        itemName: selected.itemName,
                        qty: Number(qty),
                        uom: selected.uom,
                        unitPrice: Number(unitPrice),
                        priceListName: linePriceListName || undefined,
                      }),
                    );
                    setShowAdd(false);
                    setSelected(null);
                    setQuery("");
                    setQty("1");
                    setUnitPrice("0");
                  }}
                  className="rounded-md bg-orange px-3 py-1.5 text-xs font-bold text-navy"
                >
                  Add
                </button>
                <button
                  onClick={() => {
                    setSelected(null);
                    setUnitPrice("0");
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
