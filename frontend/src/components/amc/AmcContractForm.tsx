"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { createAmcContract, updateAmcContract, AmcContractFormInput, AmcContractRecord, PARTS_COVERAGE_LABEL, PartsCoverage } from "@/lib/ticketing/amc";
import { CustomerListItem, EquipmentListItem, equipmentForCustomer, listCustomers } from "@/lib/ticketing/masters";

const PARTS_COVERAGE_OPTIONS: PartsCoverage[] = ["NONE", "CONSUMABLES_ONLY", "ALL_PARTS"];

interface Props {
  existing?: AmcContractRecord;
  /** Pre-select a customer (e.g. opened from the Equipment form for a specific customer) and lock the field. */
  fixedCustomer?: { id: string; customerName: string };
  onSaved: (contract: AmcContractRecord) => void;
  onCancel?: () => void;
}

// Shared between the standalone AMC Contract create/edit pages and the
// inline "+ New AMC Contract" modal opened from the Equipment form — same
// component, same validation, so the modal isn't a stripped-down duplicate.
export default function AmcContractForm({ existing, fixedCustomer, onSaved, onCancel }: Props) {
  const [contractReferenceNo, setContractReferenceNo] = useState(existing?.contractReferenceNo ?? "");
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; customerName: string } | null>(
    fixedCustomer ?? (existing?.customer ? { id: existing.customer.id, customerName: existing.customer.customerName } : null),
  );
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerListItem[]>([]);
  const [customerOpen, setCustomerOpen] = useState(false);

  const [startDate, setStartDate] = useState(existing?.startDate.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(existing?.endDate.slice(0, 10) ?? "");
  const [contractValue, setContractValue] = useState(existing ? String(existing.contractValue) : "");
  const [visitsIncluded, setVisitsIncluded] = useState(existing ? String(existing.visitsIncluded) : "4");
  const [partsCoverage, setPartsCoverage] = useState<PartsCoverage>(existing?.partsCoverage ?? "CONSUMABLES_ONLY");
  const [scopeOfServices, setScopeOfServices] = useState(existing?.scopeOfServices ?? "");
  const [exclusions, setExclusions] = useState(existing?.exclusions ?? "");

  const [customerEquipment, setCustomerEquipment] = useState<EquipmentListItem[]>([]);
  const [coveredEquipmentIds, setCoveredEquipmentIds] = useState<string[]>(
    existing?.coveredEquipment?.map((e) => e.id) ?? [],
  );

  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (customerQuery.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    const handle = setTimeout(() => {
      listCustomers(customerQuery.trim()).then(setCustomerResults).catch(() => setCustomerResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [customerQuery]);

  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerEquipment([]);
      return;
    }
    equipmentForCustomer(selectedCustomer.id).then(setCustomerEquipment).catch(() => setCustomerEquipment([]));
  }, [selectedCustomer]);

  function toggleEquipment(id: string) {
    setCoveredEquipmentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWarnings([]);

    if (!selectedCustomer) {
      setError("Select a customer.");
      return;
    }
    if (coveredEquipmentIds.length === 0) {
      setError("Select at least one covered equipment.");
      return;
    }

    const input: AmcContractFormInput = {
      contractReferenceNo: contractReferenceNo.trim(),
      customerId: selectedCustomer.id,
      startDate,
      endDate,
      contractValue: Number(contractValue),
      visitsIncluded: Number(visitsIncluded),
      partsCoverage,
      scopeOfServices: scopeOfServices.trim() || undefined,
      exclusions: exclusions.trim() || undefined,
      coveredEquipmentIds,
    };

    setSaving(true);
    try {
      const result = existing ? await updateAmcContract(existing.id, input) : await createAmcContract(input);
      if (result.overlapWarnings.length > 0) {
        setWarnings(
          result.overlapWarnings.map(
            (w) => `${w.equipmentSerialNo} is already covered by contract ${w.otherContractRefNo} in an overlapping period.`,
          ),
        );
      }
      onSaved(result.contract);
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string | string[] } | null;
        const msg = Array.isArray(body?.message) ? body!.message.join(", ") : body?.message;
        setError(msg ?? "Could not save AMC contract.");
      } else {
        setError("Could not reach the server.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">Contract Reference No.</label>
          <input
            type="text"
            value={contractReferenceNo}
            onChange={(e) => setContractReferenceNo(e.target.value)}
            required
            className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy"
          />
        </div>

        <div className="relative">
          <label className="mb-1.5 block text-xs font-bold text-navy">Customer</label>
          {selectedCustomer ? (
            <div className="flex h-10 items-center justify-between rounded-md border border-line bg-navy-soft px-3 text-sm text-navy">
              <span>{selectedCustomer.customerName}</span>
              {!fixedCustomer && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomerQuery("");
                    setCoveredEquipmentIds([]);
                  }}
                  className="text-xs font-bold text-brand-red"
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <input
              type="text"
              value={customerQuery}
              onChange={(e) => {
                setCustomerQuery(e.target.value);
                setCustomerOpen(true);
              }}
              onFocus={() => setCustomerOpen(true)}
              placeholder="Type at least 2 letters…"
              className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy placeholder:text-text-disabled"
            />
          )}
          {customerOpen && !selectedCustomer && customerResults.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-line bg-white shadow-lg">
              {customerResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedCustomer({ id: c.id, customerName: c.customerName });
                    setCustomerOpen(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-navy hover:bg-navy-tint"
                >
                  {c.customerName}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            required
            className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">Contract Value (INR)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={contractValue}
            onChange={(e) => setContractValue(e.target.value)}
            required
            className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">Visits Included / Year</label>
          <input
            type="number"
            min={0}
            value={visitsIncluded}
            onChange={(e) => setVisitsIncluded(e.target.value)}
            required
            className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">Parts Coverage</label>
          <select
            value={partsCoverage}
            onChange={(e) => setPartsCoverage(e.target.value as PartsCoverage)}
            className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy"
          >
            {PARTS_COVERAGE_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {PARTS_COVERAGE_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-bold text-navy">
          Covered Equipment {selectedCustomer ? "" : "(select a customer first)"}
        </label>
        {customerEquipment.length === 0 ? (
          <p className="text-xs text-muted">
            {selectedCustomer ? "This customer has no equipment on file yet." : "—"}
          </p>
        ) : (
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-line p-2">
            {customerEquipment.map((eq) => (
              <label key={eq.id} className="flex items-center gap-2 text-sm text-navy">
                <input
                  type="checkbox"
                  checked={coveredEquipmentIds.includes(eq.id)}
                  onChange={() => toggleEquipment(eq.id)}
                />
                {eq.serialNo} — {eq.itemName}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">Scope of Services (optional)</label>
          <textarea
            value={scopeOfServices}
            onChange={(e) => setScopeOfServices(e.target.value)}
            className="h-20 w-full rounded-md border border-line p-2 text-sm text-navy"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">Exclusions (optional)</label>
          <textarea
            value={exclusions}
            onChange={(e) => setExclusions(e.target.value)}
            className="h-20 w-full rounded-md border border-line p-2 text-sm text-navy"
          />
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-md bg-brand-amber-bg px-3 py-2 text-xs text-brand-amber">
          {warnings.map((w, i) => (
            <p key={i}>⚠ {w}</p>
          ))}
        </div>
      )}
      {error && <p className="rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-orange px-4 py-2 text-sm font-bold text-navy transition disabled:opacity-50"
        >
          {saving ? "Saving…" : existing ? "Save Changes" : "Create AMC Contract"}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md bg-navy-tint px-4 py-2 text-sm font-bold text-navy transition"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
