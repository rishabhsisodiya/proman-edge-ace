"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { createTicket } from "@/lib/ticketing/actions";
import { CustomerListItem, EquipmentListItem, equipmentForCustomer, listCustomers } from "@/lib/ticketing/masters";
import {
  MANUAL_SOURCES,
  Priority,
  SERVICE_TYPE_LABEL,
  SOURCE_LABEL,
  ServiceType,
  Source,
} from "@/lib/ticketing/types";

const PRIORITIES: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

// §10.1 W-09 New Ticket. Manual creation only (Call Center/ASM/Manager, per
// backend @Roles on POST /tickets) — auto-sources (AMC/warranty/predictive/
// bulk/partner) aren't in this form, they're system-generated (§7.1).
export default function NewTicketPage() {
  const router = useRouter();

  const [source, setSource] = useState<string>("CUSTOMER_CALL");
  const [serviceType, setServiceType] = useState<ServiceType | "">("");
  const [priority, setPriority] = useState<Priority>("MEDIUM");

  // Customer — searchable combobox, not a full dropdown (client flagged:
  // 4,500+ real customers, a plain <select> doesn't scale).
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerListItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerListItem | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const customerBoxRef = useRef<HTMLDivElement>(null);

  const [equipment, setEquipment] = useState<EquipmentListItem[]>([]);
  const [equipmentId, setEquipmentId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Debounced customer search — only queries once 2+ characters are typed,
  // matching the backend's "blank search returns nothing" behavior.
  useEffect(() => {
    if (customerQuery.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    const handle = setTimeout(() => {
      listCustomers(customerQuery.trim())
        .then(setCustomerResults)
        .catch(() => setCustomerResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [customerQuery]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (customerBoxRef.current && !customerBoxRef.current.contains(e.target as Node)) setCustomerOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    setEquipmentId("");
    if (!selectedCustomer) {
      setEquipment([]);
      return;
    }
    equipmentForCustomer(selectedCustomer.id).then(setEquipment).catch(() => setEquipment([]));
  }, [selectedCustomer]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!selectedCustomer) {
      setError("Select a customer.");
      return;
    }
    // Equipment is optional for every service type per client request — no
    // longer gated on service type the way it was before.
    if (description.trim().length === 0) {
      setError("Description is required.");
      return;
    }

    setSubmitting(true);
    try {
      const ticket = await createTicket({
        source,
        serviceType: serviceType || undefined,
        priority,
        customerId: selectedCustomer.id,
        equipmentId: equipmentId || undefined,
        subject: subject.trim() || undefined,
        description: description.trim(),
      });
      router.push(`/dashboard/tickets/${ticket.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { message?: string | string[] } | null;
        const msg = Array.isArray(body?.message) ? body!.message.join(", ") : body?.message;
        setError(msg ?? "Could not create ticket.");
      } else {
        setError("Could not reach the server.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-1 text-xl font-bold text-navy">Ticket Form</h1>
      <p className="mb-6 text-sm text-muted">Manual ticket creation.</p>

      <form onSubmit={onSubmit} className="w-full space-y-4 rounded-lg border border-line bg-white p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-navy">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="h-11 w-full rounded-md border border-line px-3 text-sm text-navy"
            >
              {MANUAL_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-navy">
              Service Type <span className="font-normal text-muted">(optional — may not be known yet)</span>
            </label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as ServiceType | "")}
              className="h-11 w-full rounded-md border border-line px-3 text-sm text-navy"
            >
              <option value="">Not yet determined</option>
              {Object.entries(SERVICE_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold text-navy">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="h-11 w-full rounded-md border border-line px-3 text-sm text-navy"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div ref={customerBoxRef} className="relative">
            <label className="mb-1.5 block text-xs font-bold text-navy">Customer</label>
            {selectedCustomer ? (
              <div className="flex h-11 items-center justify-between rounded-md border border-line bg-navy-soft px-3 text-sm text-navy">
                <span>
                  {selectedCustomer.customerName} — {selectedCustomer.region}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomer(null);
                    setCustomerQuery("");
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
                placeholder="Type at least 2 letters of the customer name…"
                className="h-11 w-full rounded-md border border-line px-3 text-sm text-navy placeholder:text-text-disabled"
              />
            )}
            {customerOpen && !selectedCustomer && customerResults.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-white shadow-lg">
                {customerResults.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelectedCustomer(c);
                      setCustomerOpen(false);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm text-navy hover:bg-navy-tint"
                  >
                    {c.customerName} <span className="text-muted">— {c.region}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedCustomer?.accountStatus === "BLACKLISTED" && (
              <p className="mt-1 text-xs text-brand-red">
                This customer is blacklisted — only a Manager can create this ticket.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-navy">
              Equipment <span className="font-normal text-muted">(optional)</span>
            </label>
            <select
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              disabled={!selectedCustomer}
              className="h-11 w-full rounded-md border border-line px-3 text-sm text-navy disabled:bg-navy-soft"
            >
              <option value="">{selectedCustomer ? "Select equipment (optional)…" : "Select a customer first"}</option>
              {equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.serialNo} — {eq.itemName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">
            Service Issue / Request Title <span className="font-normal text-muted">(optional — auto-generated if left blank)</span>
          </label>
          <input
            type="text"
            maxLength={200}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="[Equipment model] — [fault description] — [customer site]"
            className="h-11 w-full rounded-md border border-line px-3 text-sm text-navy placeholder:text-text-disabled"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="h-28 w-full rounded-md border border-line p-3 text-sm text-navy"
          />
        </div>

        {error && <p className="rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="h-11 w-full rounded-md bg-orange text-sm font-bold text-navy transition disabled:opacity-50 sm:w-auto sm:px-8"
        >
          {submitting ? "Creating…" : "Create Ticket"}
        </button>
      </form>
    </div>
  );
}
