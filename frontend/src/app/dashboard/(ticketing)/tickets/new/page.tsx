"use client";

import { useEffect, useState } from "react";
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
// Spares Supply is the one service type where equipment is optional (§5.3).
const EQUIPMENT_OPTIONAL: ServiceType[] = ["SPARES_SUPPLY_INSTALLATION"];

// §10.1 W-09 New Ticket. Manual creation only (Call Center/ASM/Manager, per
// backend @Roles on POST /tickets) — auto-sources (AMC/warranty/predictive/
// bulk/partner) aren't in this form, they're system-generated (§7.1).
export default function NewTicketPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [equipment, setEquipment] = useState<EquipmentListItem[]>([]);

  const [source, setSource] = useState<Source>("CUSTOMER_CALL");
  const [serviceType, setServiceType] = useState<ServiceType>("BREAKDOWN_CHARGEABLE");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [customerId, setCustomerId] = useState("");
  const [equipmentId, setEquipmentId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    listCustomers().then(setCustomers).catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    setEquipmentId("");
    if (!customerId) {
      setEquipment([]);
      return;
    }
    equipmentForCustomer(customerId).then(setEquipment).catch(() => setEquipment([]));
  }, [customerId]);

  const equipmentRequired = !EQUIPMENT_OPTIONAL.includes(serviceType);
  const selectedCustomer = customers.find((c) => c.id === customerId);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!customerId) {
      setError("Select a customer.");
      return;
    }
    if (equipmentRequired && !equipmentId) {
      setError("Select equipment (required for this service type).");
      return;
    }
    if (description.trim().length === 0) {
      setError("Description is required.");
      return;
    }

    setSubmitting(true);
    try {
      const ticket = await createTicket({
        source,
        serviceType,
        priority,
        customerId,
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
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-1 text-xl font-bold text-navy">New Ticket</h1>
      <p className="mb-6 text-sm text-muted">Manual ticket creation.</p>

      <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-line bg-white p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-navy">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as Source)}
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
            <label className="mb-1.5 block text-xs font-bold text-navy">Service Type</label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as ServiceType)}
              className="h-11 w-full rounded-md border border-line px-3 text-sm text-navy"
            >
              {Object.entries(SERVICE_TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
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

        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">Customer</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="h-11 w-full rounded-md border border-line px-3 text-sm text-navy"
          >
            <option value="">Select customer…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.customerName} — {c.region}
              </option>
            ))}
          </select>
          {selectedCustomer?.accountStatus === "BLACKLISTED" && (
            <p className="mt-1 text-xs text-brand-red">
              This customer is blacklisted — only a Manager can create this ticket.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">
            Equipment {!equipmentRequired && <span className="font-normal text-muted">(optional for this service type)</span>}
          </label>
          <select
            value={equipmentId}
            onChange={(e) => setEquipmentId(e.target.value)}
            disabled={!customerId}
            className="h-11 w-full rounded-md border border-line px-3 text-sm text-navy disabled:bg-navy-soft"
          >
            <option value="">{customerId ? "Select equipment…" : "Select a customer first"}</option>
            {equipment.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.serialNo} — {eq.itemName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-bold text-navy">
            Subject <span className="font-normal text-muted">(optional — auto-generated if left blank)</span>
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
          className="h-11 w-full rounded-md bg-orange text-sm font-bold text-navy transition disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create Ticket"}
        </button>
      </form>
    </div>
  );
}
