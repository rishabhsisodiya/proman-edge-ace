"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  createAmcContract,
  updateAmcContract,
  renewAmcContract,
  uploadAmcContractDocument,
  generateAmcSchedule,
  addAmcVisit,
  removeAmcVisit,
  rescheduleAmcVisit,
  getAmcContract,
  AmcContractFormInput,
  AmcContractRecord,
  AmcScheduledVisit,
  VISIT_STATUS_LABEL,
  PARTS_COVERAGE_LABEL,
  PartsCoverage,
} from "@/lib/ticketing/amc";
import { CustomerListItem, EquipmentListItem, equipmentForCustomer, listCustomers } from "@/lib/ticketing/masters";
import { listUsers } from "@/lib/ticketing/users";

const PARTS_COVERAGE_OPTIONS: PartsCoverage[] = ["NONE", "CONSUMABLES_ONLY", "ALL_PARTS"];

interface Props {
  existing?: AmcContractRecord;
  /**
   * Contract renewal (2026-08-03) — prefills the form's field VALUES from
   * an old contract without treating this as an edit of that record: kept
   * deliberately separate from `existing`, since `existing` also drives the
   * scheduled-visit management UI (reschedule/remove existing rows) —
   * a renewal is a brand-new contract with zero visits of its own yet, so
   * that machinery must not activate. Pass alongside `renewFromId`.
   */
  prefillFrom?: AmcContractRecord;
  /** The old contract's id to renew — submit calls renewAmcContract() instead of createAmcContract(). */
  renewFromId?: string;
  /** Pre-select a customer (e.g. opened from the Equipment form for a specific customer) and lock the field. */
  fixedCustomer?: { id: string; customerName: string };
  onSaved: (contract: AmcContractRecord) => void;
  onCancel?: () => void;
}

// Shared between the standalone AMC Contract create/edit pages and the
// inline "+ New AMC Contract" modal opened from the Equipment form — same
// component, same validation, so the modal isn't a stripped-down duplicate.
export default function AmcContractForm({ existing, prefillFrom, renewFromId, fixedCustomer, onSaved, onCancel }: Props) {
  // Renewal (2026-08-03): prefillFrom seeds the same initial values as
  // `existing` would, without `existing` itself being set — so the
  // scheduled-visit management UI below (which is keyed off `existing`)
  // correctly treats this as a brand-new contract with no visits yet.
  const seed = existing ?? prefillFrom;
  const [contractReferenceNo, setContractReferenceNo] = useState(existing?.contractReferenceNo ?? "");
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; customerName: string } | null>(
    fixedCustomer ?? (seed?.customer ? { id: seed.customer.id, customerName: seed.customer.customerName } : null),
  );
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerListItem[]>([]);
  const [customerOpen, setCustomerOpen] = useState(false);

  const [startDate, setStartDate] = useState(seed?.startDate.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(seed?.endDate.slice(0, 10) ?? "");
  const [contractValue, setContractValue] = useState(seed ? String(seed.contractValue) : "");
  const [visitsIncluded, setVisitsIncluded] = useState(seed ? String(seed.visitsIncluded) : "4");
  const [partsCoverage, setPartsCoverage] = useState<PartsCoverage>(seed?.partsCoverage ?? "CONSUMABLES_ONLY");
  const [scopeOfServices, setScopeOfServices] = useState(seed?.scopeOfServices ?? "");
  const [exclusions, setExclusions] = useState(seed?.exclusions ?? "");
  const [termsAndConditions, setTermsAndConditions] = useState(seed?.termsAndConditions ?? "");
  const [signedAgreementUrl, setSignedAgreementUrl] = useState(existing?.signedAgreementUrl ?? null);
  const [uploadingDocument, setUploadingDocument] = useState(false);

  // Owning ASM (client feedback 2026-07-31: field existed on the schema and
  // backend DTO already, but the form never sent it and nothing displayed
  // it — genuinely dropped on the floor, not just a display gap).
  const [owningAsmId, setOwningAsmId] = useState(seed?.owningAsmId ?? "");
  const [asmOptions, setAsmOptions] = useState<{ id: string; fullName: string }[]>([]);
  useEffect(() => {
    listUsers({ role: "ASM" })
      .then((users) => setAsmOptions(users.map((u) => ({ id: u.id, fullName: u.fullName }))))
      .catch(() => {});
  }, []);

  const [customerEquipment, setCustomerEquipment] = useState<EquipmentListItem[]>([]);
  const [coveredEquipmentIds, setCoveredEquipmentIds] = useState<string[]>(
    seed?.coveredEquipment?.map((e) => e.id) ?? [],
  );

  // Visit Schedule editor (2026-07-27) — unified modal handling three cases
  // at once: brand-new contract (no visits exist anywhere yet), an existing
  // contract with some visits already (Visits Included changed since, so
  // more/fewer are needed), and rescheduling/removing individual visits.
  const [dayOfMonth, setDayOfMonth] = useState(
    String(seed ? new Date(seed.startDate).getDate() : new Date().getDate()),
  );
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  // For a brand-new contract: one date per visit, submitted with the main
  // Create button (unchanged from before).
  const [visitDates, setVisitDates] = useState<string[]>(Array(Number(visitsIncluded) || 0).fill(""));
  useEffect(() => {
    if (existing) return;
    const n = Number(visitsIncluded) || 0;
    setVisitDates((prev) => {
      const next = prev.slice(0, n);
      while (next.length < n) next.push("");
      return next;
    });
  }, [visitsIncluded, existing]);

  // For an existing contract: local copy of its real visits (editable/
  // removable in the modal) + a snapshot of their original dates so Save
  // only reschedules ones actually changed.
  const [visits, setVisits] = useState<AmcScheduledVisit[]>(
    existing?.scheduledVisits ? [...existing.scheduledVisits].sort((a, b) => a.visitSeqNo - b.visitSeqNo) : [],
  );
  const [originalDates, setOriginalDates] = useState<Record<string, string>>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    const sorted = existing?.scheduledVisits ? [...existing.scheduledVisits].sort((a, b) => a.visitSeqNo - b.visitSeqNo) : [];
    setVisits(sorted);
    setOriginalDates(Object.fromEntries(sorted.map((v) => [v.id, v.plannedDate.slice(0, 10)])));
    setRemovedIds(new Set());
  }, [existing?.scheduledVisits]);

  // New rows needed when Visits Included exceeds the existing visit count.
  const [newRows, setNewRows] = useState<{ equipmentId: string; plannedDate: string }[]>([]);
  useEffect(() => {
    if (!existing) return;
    const needed = Math.max(0, (Number(visitsIncluded) || 0) - visits.length);
    setNewRows((prev) => {
      const next = prev.slice(0, needed);
      while (next.length < needed) {
        const idx = visits.length + next.length;
        next.push({ equipmentId: coveredEquipmentIds[idx % Math.max(1, coveredEquipmentIds.length)] ?? "", plannedDate: "" });
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitsIncluded, visits.length, existing]);

  function applyCadence(monthsPerVisit: number) {
    if (!startDate) return;
    const day = Math.min(Math.max(Number(dayOfMonth) || 1, 1), 28);
    const anchor = new Date(startDate);
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), day);
    if (first < anchor) first.setMonth(first.getMonth() + 1);

    if (!existing) {
      const n = Number(visitsIncluded) || 0;
      if (n === 0) return;
      const dates = Array.from({ length: n }, (_, i) => {
        const d = new Date(first);
        d.setMonth(d.getMonth() + i * monthsPerVisit);
        return d.toISOString().slice(0, 10);
      });
      setVisitDates(dates);
    } else {
      // Only fills the new rows — existing visits' dates are left as-is,
      // edit those individually if they also need to move.
      setNewRows((prev) =>
        prev.map((row, i) => {
          const d = new Date(first);
          d.setMonth(d.getMonth() + (visits.length + i) * monthsPerVisit);
          return { ...row, plannedDate: d.toISOString().slice(0, 10) };
        }),
      );
    }
  }

  async function handleSaveSchedule() {
    if (!existing) return;
    setSavingSchedule(true);
    setError(null);
    try {
      const input = buildInput();
      if (!input) return;
      await updateAmcContract(existing.id, input);

      for (const v of visits) {
        if (removedIds.has(v.id)) continue;
        const current = v.plannedDate.slice(0, 10);
        if (current !== originalDates[v.id]) {
          await rescheduleAmcVisit(v.id, current);
        }
      }
      for (const id of removedIds) {
        await removeAmcVisit(id);
      }

      const remainingCount = visits.length - removedIds.size;
      if (remainingCount === 0 && newRows.length > 0) {
        if (newRows.some((r) => !r.plannedDate)) {
          setError("Set a planned date for every scheduled visit.");
          return;
        }
        await generateAmcSchedule(existing.id, newRows.map((r) => r.plannedDate));
      } else {
        for (const row of newRows) {
          if (row.equipmentId && row.plannedDate) {
            await addAmcVisit(existing.id, row.equipmentId, row.plannedDate);
          }
        }
      }

      const final = await getAmcContract(existing.id);
      onSaved(final);
      setShowScheduleModal(false);
    } catch (err) {
      setError(
        err instanceof ApiError ? ((err.body as { message?: string })?.message ?? "Could not save schedule") : "Could not reach the server.",
      );
    } finally {
      setSavingSchedule(false);
    }
  }

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

  function buildInput(): AmcContractFormInput | null {
    if (!selectedCustomer) {
      setError("Select a customer.");
      return null;
    }
    if (coveredEquipmentIds.length === 0) {
      setError("Select at least one covered equipment.");
      return null;
    }
    return {
      contractReferenceNo: contractReferenceNo.trim(),
      customerId: selectedCustomer.id,
      startDate,
      endDate,
      contractValue: Number(contractValue),
      visitsIncluded: Number(visitsIncluded),
      partsCoverage,
      scopeOfServices: scopeOfServices.trim() || undefined,
      exclusions: exclusions.trim() || undefined,
      termsAndConditions: termsAndConditions.trim() || undefined,
      owningAsmId: owningAsmId || undefined,
      coveredEquipmentIds,
      visitDates: !existing ? visitDates : undefined,
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setWarnings([]);

    if (!existing && visitDates.some((d) => !d)) {
      setError("Set a planned date for every scheduled visit (use Monthly/Quarterly to fill them quickly).");
      return;
    }

    const input = buildInput();
    if (!input) return;

    setSaving(true);
    try {
      const result = renewFromId
        ? await renewAmcContract(renewFromId, input)
        : existing
          ? await updateAmcContract(existing.id, input)
          : await createAmcContract(input);
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
          {Number(visitsIncluded) > 0 && (
            <button
              type="button"
              onClick={() => setShowScheduleModal(true)}
              className="mt-1.5 text-xs font-bold text-navy underline hover:text-orange"
            >
              {(existing ? visits.length : visitDates.filter((d) => d).length) > 0 ? "Edit Visit Schedule" : "Configure Visit Schedule →"}
            </button>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">Owning ASM</label>
          <select
            value={owningAsmId}
            onChange={(e) => setOwningAsmId(e.target.value)}
            className="h-10 w-full rounded-md border border-line px-3 text-sm text-navy"
          >
            <option value="">Unassigned</option>
            {asmOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fullName}
              </option>
            ))}
          </select>
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

      {showScheduleModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowScheduleModal(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase text-navy">Visit Schedule</h3>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="text-lg leading-none text-muted hover:text-navy"
              >
                ×
              </button>
            </div>

            <div className="mb-3 flex flex-wrap items-end gap-2">
              <div>
                <label className="text-xs text-muted">Day of month</label>
                <input
                  type="number"
                  min={1}
                  max={28}
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(e.target.value)}
                  className="h-9 w-20 rounded-md border border-line px-2 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => applyCadence(1)}
                className="h-9 rounded-md bg-navy-tint px-3 text-xs font-bold text-navy hover:bg-navy hover:text-white"
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => applyCadence(3)}
                className="h-9 rounded-md bg-navy-tint px-3 text-xs font-bold text-navy hover:bg-navy hover:text-white"
              >
                Quarterly
              </button>
              <span className="text-xs italic text-muted">
                {existing ? "fills the new visit rows below" : "or set each date below manually"}
              </span>
            </div>

            {!existing ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {visitDates.map((d, i) => (
                  <div key={i}>
                    <label className="text-xs text-muted">Visit {i + 1}</label>
                    <input
                      type="date"
                      value={d}
                      onChange={(e) => setVisitDates((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))}
                      className="h-9 w-full rounded-md border border-line px-2 text-sm"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {visits.filter((v) => !removedIds.has(v.id)).length > 0 && (
                  <table className="w-full rounded-md border border-line text-xs">
                    <thead>
                      <tr className="border-b border-line text-left font-bold uppercase text-navy">
                        <th className="px-2 py-1.5">#</th>
                        <th className="px-2 py-1.5">Planned Date</th>
                        <th className="px-2 py-1.5">Status</th>
                        <th className="px-2 py-1.5">Linked Ticket</th>
                        <th className="px-2 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {visits
                        .filter((v) => !removedIds.has(v.id))
                        .map((v) => {
                          const editable = v.status === "SCHEDULED_PENDING" || v.status === "RESCHEDULED";
                          return (
                            <tr key={v.id} className="border-b border-line last:border-0">
                              <td className="px-2 py-1.5 text-navy">{v.visitSeqNo}</td>
                              <td className="px-2 py-1.5">
                                {editable ? (
                                  <input
                                    type="date"
                                    value={v.plannedDate.slice(0, 10)}
                                    onChange={(e) =>
                                      setVisits((prev) =>
                                        prev.map((x) => (x.id === v.id ? { ...x, plannedDate: e.target.value } : x)),
                                      )
                                    }
                                    className="h-8 rounded-md border border-line px-2 text-xs"
                                  />
                                ) : (
                                  new Date(v.plannedDate).toLocaleDateString()
                                )}
                              </td>
                              <td className="px-2 py-1.5">
                                <span className="rounded-full bg-navy-tint px-2 py-0.5 text-[10px] font-bold text-navy">
                                  {VISIT_STATUS_LABEL[v.status]}
                                </span>
                              </td>
                              <td className="px-2 py-1.5">
                                {v.linkedTicketId ? (
                                  <a href={`/dashboard/tickets/${v.linkedTicketId}`} className="font-bold text-navy underline">
                                    View
                                  </a>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-right">
                                {editable && (
                                  <button
                                    type="button"
                                    onClick={() => setRemovedIds((prev) => new Set(prev).add(v.id))}
                                    className="font-bold text-brand-red"
                                  >
                                    Remove
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                )}

                {newRows.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-bold text-navy">New visits (Visits Included increased)</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {newRows.map((row, i) => (
                        <div key={i} className="flex gap-2 rounded-md border border-line p-2">
                          <select
                            value={row.equipmentId}
                            onChange={(e) =>
                              setNewRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, equipmentId: e.target.value } : r)))
                            }
                            className="h-9 flex-1 rounded-md border border-line px-2 text-xs"
                          >
                            {customerEquipment
                              .filter((eq) => coveredEquipmentIds.includes(eq.id))
                              .map((eq) => (
                                <option key={eq.id} value={eq.id}>
                                  {eq.serialNo}
                                </option>
                              ))}
                          </select>
                          <input
                            type="date"
                            value={row.plannedDate}
                            onChange={(e) =>
                              setNewRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, plannedDate: e.target.value } : r)))
                            }
                            className="h-9 w-36 rounded-md border border-line px-2 text-xs"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              {existing ? (
                <button
                  type="button"
                  disabled={savingSchedule}
                  onClick={handleSaveSchedule}
                  className="rounded-md bg-orange px-4 py-2 text-sm font-bold text-navy disabled:opacity-50"
                >
                  {savingSchedule ? "Saving…" : "Save Schedule"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="rounded-md bg-orange px-4 py-2 text-sm font-bold text-navy"
                >
                  Done
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="rounded-md bg-navy-tint px-4 py-2 text-sm font-bold text-navy"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-xs font-bold text-navy">Terms &amp; Conditions (optional)</label>
        <textarea
          value={termsAndConditions}
          onChange={(e) => setTermsAndConditions(e.target.value)}
          className="h-24 w-full rounded-md border border-line p-2 text-sm text-navy"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-bold text-navy">Contract Document</label>
        {signedAgreementUrl ? (
          <a href={signedAgreementUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-navy underline">
            View uploaded contract document
          </a>
        ) : (
          <p className="text-xs text-muted">No document uploaded yet.</p>
        )}
        {existing ? (
          <div className="mt-2">
            <label className="flex h-9 w-fit cursor-pointer items-center rounded-md bg-navy-tint px-3 text-xs font-bold text-navy">
              {uploadingDocument ? "Uploading…" : signedAgreementUrl ? "Replace Document" : "Upload Document"}
              <input
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                disabled={uploadingDocument}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setUploadingDocument(true);
                  setError(null);
                  try {
                    const updated = await uploadAmcContractDocument(existing.id, file);
                    setSignedAgreementUrl(updated.signedAgreementUrl);
                    onSaved(updated);
                  } catch (err) {
                    setError(
                      err instanceof ApiError
                        ? ((err.body as { message?: string })?.message ?? "Upload failed")
                        : "Could not reach the server.",
                    );
                  } finally {
                    setUploadingDocument(false);
                  }
                }}
                className="hidden"
              />
            </label>
          </div>
        ) : (
          <p className="mt-1 text-xs italic text-muted">Save the contract first, then upload its document.</p>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="rounded-md bg-brand-amber-bg px-3 py-2 text-xs text-brand-amber">
          {warnings.map((w, i) => (
            <p key={i}>⚠ {w}</p>
          ))}
        </div>
      )}
      {error && <p className="rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {existing && (
        <p className="text-xs text-muted">
          Created {new Date(existing.createdAt).toLocaleString()} · Last updated {new Date(existing.updatedAt).toLocaleString()}
        </p>
      )}

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
