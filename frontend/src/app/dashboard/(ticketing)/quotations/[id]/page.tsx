"use client";

import { use, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  addQuotationItem,
  getQuotation,
  pushQuotationToErpNext,
  Quotation,
  removeQuotationItem,
  updateQuotation,
} from "@/lib/ticketing/quotation";
import { ItemListItem, listItems } from "@/lib/ticketing/masters";

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
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <div>
        <p className="font-mono text-xs text-muted">{quotation.quotationNo}</p>
        <h1 className="text-xl font-bold text-navy">{quotation.customer?.customerName}</h1>
        <span className="mt-1 inline-block rounded-full bg-navy-tint px-2.5 py-0.5 text-[10px] font-bold text-navy">
          {STATUS_LABEL[quotation.status]}
        </span>
      </div>

      {notice && <p className="rounded-md bg-brand-green-bg px-3 py-2 text-xs text-brand-green">{notice}</p>}
      {error && <p className="rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {!editable && (
        <p className="rounded-md bg-navy-soft px-3 py-2 text-xs text-navy">
          This quotation is in ERPNext ({quotation.erpnextQuotationId}) — negotiation, quantity/price changes, and
          submission all happen there now, not in ACE. This page just reflects status as it updates.
        </p>
      )}

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
          onClick={() => run(() => pushQuotationToErpNext(quotation.id), "Draft Quotation created in ERPNext.")}
          disabled={busy || quotation.items.length === 0}
          className="rounded-md bg-orange px-4 py-2 text-sm font-bold text-navy disabled:opacity-50"
        >
          {busy ? "Pushing…" : "Push to ERPNext"}
        </button>
      )}

      {!editable && (
        <div className="space-y-1 rounded-lg border border-line bg-white p-4 text-sm">
          <p className="text-xs font-bold uppercase text-muted">ERPNext Pipeline Status</p>
          <StatusRow label="Quotation" value={quotation.erpnextQuotationId} />
          <StatusRow label="Sales Order" value={quotation.erpnextSalesOrderId} pending="Awaiting negotiation & submission in ERPNext" />
          <StatusRow label="Delivery Note" value={quotation.erpnextDeliveryNoteId} pending="Awaiting manual Delivery Note in ERPNext" />
          <StatusRow label="Sales Invoice (draft)" value={quotation.erpnextInvoiceId} pending="Awaiting Sales Order status “To Bill”" />
        </div>
      )}
    </div>
  );
}

function StatusRow({ label, value, pending }: { label: string; value: string | null; pending?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted">{label}</span>
      <span className={value ? "font-bold text-navy" : "text-xs text-muted"}>{value ?? pending ?? "—"}</span>
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
  const [taxAmount, setTaxAmount] = useState("0");

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      listItems(query.trim()).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

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
            {quotation.items.map((it) => (
              <tr key={it.id} className="border-b border-line last:border-0">
                <td className="px-2 py-1.5 text-navy">{it.itemName}</td>
                <td className="px-2 py-1.5 text-muted">
                  {it.qty} {it.uom}
                </td>
                <td className="px-2 py-1.5 text-muted">₹{it.unitPrice}</td>
                <td className="px-2 py-1.5 text-muted">₹{it.lineTotal}</td>
                {editable && (
                  <td className="px-2 py-1.5 text-right">
                    <button
                      onClick={() => run(() => removeQuotationItem(quotation.id, it.id))}
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
                      onClick={() => setSelected(it)}
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
              <p className="text-sm font-bold text-navy">{selected.itemName}</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted">Qty</label>
                  <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="h-9 w-full rounded-md border border-line px-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted">Unit Price</label>
                  <input type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="h-9 w-full rounded-md border border-line px-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-muted">Tax</label>
                  <input type="number" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} className="h-9 w-full rounded-md border border-line px-2 text-sm" />
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
                        taxAmount: Number(taxAmount),
                      }),
                    );
                    setShowAdd(false);
                    setSelected(null);
                    setQuery("");
                    setQty("1");
                  }}
                  className="rounded-md bg-orange px-3 py-1.5 text-xs font-bold text-navy"
                >
                  Add
                </button>
                <button onClick={() => setSelected(null)} className="text-xs font-bold text-muted">
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
