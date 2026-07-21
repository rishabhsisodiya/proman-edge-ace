"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import AmcContractForm from "@/components/amc/AmcContractForm";
import { AmcContractRecord, listAmcContracts } from "@/lib/ticketing/amc";
import {
  createEquipment,
  EQUIP_CATEGORY_LABEL,
  EquipCategory,
  EquipmentFormInput,
  EquipmentRecord,
  EquipStatus,
  updateEquipment,
} from "@/lib/ticketing/equipment-admin";
import { CustomerListItem, CustomerSiteListItem, ItemListItem, listCustomers, listItems, sitesForCustomer } from "@/lib/ticketing/masters";

const EQUIP_CATEGORIES = Object.keys(EQUIP_CATEGORY_LABEL) as EquipCategory[];
const EQUIP_STATUSES: EquipStatus[] = ["ACTIVE", "UNDER_REPAIR", "DECOMMISSIONED", "SOLD"];

interface Props {
  existing?: EquipmentRecord;
  onSaved: (equipment: EquipmentRecord) => void;
}

// Item and AMC Contract selection both follow the "search from existing, or
// create inline" pattern — Item is always search-only (Item sync already
// populates the catalog), AMC Contract additionally offers a "+ New AMC
// Contract" modal since, unlike Item, it's something this admin screen
// itself is often the very first place a given contract gets created.
export default function EquipmentForm({ existing, onSaved }: Props) {
  const [serialNo, setSerialNo] = useState(existing?.serialNo ?? "");
  const [modelNumber, setModelNumber] = useState(existing?.modelNumber ?? "");
  const [equipmentCategory, setEquipmentCategory] = useState<EquipCategory>(existing?.equipmentCategory ?? "OTHER");
  const [status, setStatus] = useState<EquipStatus>(existing?.status ?? "ACTIVE");

  const [itemQuery, setItemQuery] = useState(existing?.itemName ?? "");
  const [itemResults, setItemResults] = useState<ItemListItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemListItem | null>(
    existing ? { itemCode: existing.itemCode, itemName: existing.itemName, itemGroup: "", uom: "" } : null,
  );
  const [itemOpen, setItemOpen] = useState(false);

  const [customerQuery, setCustomerQuery] = useState(existing?.customer?.customerName ?? "");
  const [customerResults, setCustomerResults] = useState<CustomerListItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; customerName: string } | null>(
    existing?.customer ? { id: existing.customer.id, customerName: existing.customer.customerName } : null,
  );
  const [customerOpen, setCustomerOpen] = useState(false);

  const [sites, setSites] = useState<CustomerSiteListItem[]>([]);
  const [siteId, setSiteId] = useState(existing?.siteId ?? "");

  const [installationDate, setInstallationDate] = useState(existing?.installationDate.slice(0, 10) ?? "");
  const [deliveryDate, setDeliveryDate] = useState(existing?.deliveryDate?.slice(0, 10) ?? "");
  const [warrantyStartDate, setWarrantyStartDate] = useState(existing?.warrantyStartDate.slice(0, 10) ?? "");
  const [warrantyEndDate, setWarrantyEndDate] = useState(existing?.warrantyEndDate.slice(0, 10) ?? "");
  const [warrantyPeriodMonths, setWarrantyPeriodMonths] = useState(
    existing ? String(existing.warrantyPeriodMonths) : "12",
  );
  const [notes, setNotes] = useState(existing?.notes ?? "");

  const [customerAmcContracts, setCustomerAmcContracts] = useState<AmcContractRecord[]>([]);
  const [amcContractIds, setAmcContractIds] = useState<string[]>(existing?.amcContracts?.map((c) => c.id) ?? []);
  const [showAmcModal, setShowAmcModal] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
      setSites([]);
      setCustomerAmcContracts([]);
      return;
    }
    sitesForCustomer(selectedCustomer.id).then(setSites).catch(() => setSites([]));
    listAmcContracts(selectedCustomer.id)
      .then(setCustomerAmcContracts)
      .catch(() => setCustomerAmcContracts([]));
  }, [selectedCustomer]);

  function toggleAmc(id: string) {
    setAmcContractIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedItem) {
      setError("Select an item.");
      return;
    }
    if (!selectedCustomer) {
      setError("Select a customer.");
      return;
    }

    const input: EquipmentFormInput = {
      serialNo: serialNo.trim(),
      itemCode: selectedItem.itemCode,
      itemName: selectedItem.itemName,
      equipmentCategory,
      modelNumber: modelNumber.trim() || undefined,
      customerId: selectedCustomer.id,
      siteId: siteId || undefined,
      installationDate,
      deliveryDate: deliveryDate || undefined,
      warrantyStartDate,
      warrantyEndDate,
      warrantyPeriodMonths: Number(warrantyPeriodMonths),
      status,
      notes: notes.trim() || undefined,
      amcContractIds,
    };

    setSaving(true);
    try {
      const result = existing ? await updateEquipment(existing.id, input) : await createEquipment(input);
      onSaved(result);
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string | string[] } | null;
        const msg = Array.isArray(body?.message) ? body!.message.join(", ") : body?.message;
        setError(msg ?? "Could not save equipment.");
      } else {
        setError("Could not reach the server.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-navy">Serial No.</label>
            <input
              type="text"
              value={serialNo}
              onChange={(e) => setSerialNo(e.target.value)}
              required
              className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy"
            />
          </div>

          <div className="relative">
            <label className="mb-1.5 block text-xs font-bold text-navy">Item</label>
            {selectedItem ? (
              <div className="flex h-10 items-center justify-between rounded-md border border-line bg-navy-soft px-3 text-sm text-navy">
                <span>
                  {selectedItem.itemCode} — {selectedItem.itemName}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedItem(null);
                    setItemQuery("");
                  }}
                  className="text-xs font-bold text-brand-red"
                >
                  Change
                </button>
              </div>
            ) : (
              <input
                type="text"
                value={itemQuery}
                onChange={(e) => {
                  setItemQuery(e.target.value);
                  setItemOpen(true);
                }}
                onFocus={() => setItemOpen(true)}
                placeholder="Type at least 2 letters…"
                className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy placeholder:text-text-disabled"
              />
            )}
            {itemOpen && !selectedItem && itemResults.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-line bg-white shadow-lg">
                {itemResults.map((it) => (
                  <button
                    key={it.itemCode}
                    type="button"
                    onClick={() => {
                      setSelectedItem(it);
                      setItemOpen(false);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-navy hover:bg-navy-tint"
                  >
                    {it.itemCode} — {it.itemName}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-navy">Equipment Category</label>
            <select
              value={equipmentCategory}
              onChange={(e) => setEquipmentCategory(e.target.value as EquipCategory)}
              className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy"
            >
              {EQUIP_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EQUIP_CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-navy">Model Number (optional)</label>
            <input
              type="text"
              value={modelNumber}
              onChange={(e) => setModelNumber(e.target.value)}
              className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy"
            />
          </div>

          <div className="relative">
            <label className="mb-1.5 block text-xs font-bold text-navy">Customer</label>
            {selectedCustomer ? (
              <div className="flex h-10 items-center justify-between rounded-md border border-line bg-navy-soft px-3 text-sm text-navy">
                <span>{selectedCustomer.customerName}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomerQuery("");
                    setSiteId("");
                    setAmcContractIds([]);
                  }}
                  className="text-xs font-bold text-brand-red"
                >
                  Change
                </button>
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
            <label className="mb-1.5 block text-xs font-bold text-navy">
              Site <span className="font-normal text-muted">(optional)</span>
            </label>
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              disabled={!selectedCustomer}
              className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy disabled:bg-navy-soft"
            >
              <option value="">{selectedCustomer ? "No specific site" : "Select a customer first"}</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.siteName} — {s.city}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-navy">Installation Date</label>
            <input
              type="date"
              value={installationDate}
              onChange={(e) => setInstallationDate(e.target.value)}
              required
              className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-navy">Delivery Date (optional)</label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-navy">Warranty Start Date</label>
            <input
              type="date"
              value={warrantyStartDate}
              onChange={(e) => setWarrantyStartDate(e.target.value)}
              required
              className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-navy">Warranty End Date</label>
            <input
              type="date"
              value={warrantyEndDate}
              onChange={(e) => setWarrantyEndDate(e.target.value)}
              required
              className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-navy">Warranty Period (months)</label>
            <input
              type="number"
              min={0}
              value={warrantyPeriodMonths}
              onChange={(e) => setWarrantyPeriodMonths(e.target.value)}
              required
              className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-navy">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as EquipStatus)}
              className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy"
            >
              {EQUIP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-bold text-navy">
              AMC Contracts <span className="font-normal text-muted">(optional)</span>
            </label>
            {selectedCustomer && existing && (
              <button
                type="button"
                onClick={() => setShowAmcModal(true)}
                className="text-xs font-bold text-navy hover:underline"
              >
                + New AMC Contract
              </button>
            )}
          </div>
          {!selectedCustomer ? (
            <p className="text-xs text-muted">Select a customer first.</p>
          ) : !existing ? (
            <p className="text-xs text-muted">
              Save this equipment first, then reopen it to link or create an AMC contract — a contract must cover an
              already-saved equipment record.
            </p>
          ) : customerAmcContracts.length === 0 ? (
            <p className="text-xs text-muted">No AMC contracts for this customer yet.</p>
          ) : (
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-line p-2">
              {customerAmcContracts.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-navy">
                  <input type="checkbox" checked={amcContractIds.includes(c.id)} onChange={() => toggleAmc(c.id)} />
                  {c.contractReferenceNo} ({new Date(c.startDate).toLocaleDateString()} –{" "}
                  {new Date(c.endDate).toLocaleDateString()})
                </label>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-20 w-full rounded-md border border-line p-2 text-sm text-navy"
          />
        </div>

        {error && <p className="rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-orange px-4 py-2 text-sm font-bold text-navy transition disabled:opacity-50"
        >
          {saving ? "Saving…" : existing ? "Save Changes" : "Create Equipment"}
        </button>
      </form>

      {showAmcModal && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6">
            <h2 className="mb-4 text-lg font-bold text-navy">New AMC Contract for {selectedCustomer.customerName}</h2>
            <AmcContractForm
              fixedCustomer={selectedCustomer}
              onSaved={(contract) => {
                setCustomerAmcContracts((prev) => [contract, ...prev]);
                setAmcContractIds((prev) => [...prev, contract.id]);
                setShowAmcModal(false);
              }}
              onCancel={() => setShowAmcModal(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
