"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ApiError } from "@/lib/api";
import { CustomerDetail, getCustomer } from "@/lib/ticketing/masters";
import { PRIORITY_LABEL, STATUS_LABEL, STATUS_STYLE, TicketStatus, Priority } from "@/lib/ticketing/types";

const ACCOUNT_STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-brand-green-bg text-brand-green",
  INACTIVE: "bg-brand-amber-bg text-brand-amber",
  BLACKLISTED: "bg-brand-red-bg text-brand-red",
};

const RENEWAL_STATUS_STYLE: Record<string, string> = {
  ACTIVE: "bg-brand-green-bg text-brand-green",
  RENEWAL_DUE: "bg-brand-amber-bg text-brand-amber",
  FINAL_NOTICE: "bg-brand-red-bg text-brand-red",
  LAPSED: "bg-brand-red-bg text-brand-red",
  RENEWED: "bg-navy-tint text-navy",
};

// §10.1 W-18 Customer Detail (Call Center/ASM/Manager) — "Customer fields,
// site addresses, equipment list, ticket history, AMC list."
export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCustomer(params.id)
      .then(setCustomer)
      .catch((err) => setError(err instanceof ApiError ? "Customer not found." : "Could not reach the server."))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <div className="w-full px-6 py-8 text-sm text-muted">Loading…</div>;
  if (error || !customer) return <div className="w-full px-6 py-8 text-sm text-brand-red">{error ?? "Not found."}</div>;

  return (
    <div className="w-full px-6 py-8">
      <Link href="/dashboard/customers" className="mb-4 inline-block text-xs font-medium text-muted hover:text-navy">
        ← Customers
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-navy">{customer.customerName}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${ACCOUNT_STATUS_STYLE[customer.accountStatus] ?? ""}`}>
          {customer.accountStatus}
        </span>
        <span className="text-sm text-muted">{customer.region ?? "Region pending"}</span>
      </div>

      {/* Customer fields */}
      <section className="mb-6 grid grid-cols-1 gap-4 rounded-lg border border-line bg-white p-5 sm:grid-cols-3">
        <Field label="Customer Type" value={customer.customerType} />
        <Field label="Primary Contact" value={`${customer.primaryContactName} · ${customer.primaryContactMobile}`} />
        <Field label="Primary Email" value={customer.primaryContactEmail} />
        <Field label="Secondary Contact" value={customer.secondaryContactName ?? "—"} />
        <Field label="GST Number" value={customer.gstNumber ?? "—"} />
        <Field label="Credit Terms" value={customer.creditTerms ?? "—"} />
        <Field
          label="Billing Address"
          value={
            [customer.billingAddressLine1, customer.billingAddressLine2, customer.billingCity, customer.billingState, customer.billingPin]
              .filter(Boolean)
              .join(", ") || "—"
          }
        />
        <Field label="ERPNext Customer ID" value={customer.erpnextCustomerId ?? "—"} />
        <Field label="Last Synced" value={customer.lastSyncedAt ? new Date(customer.lastSyncedAt).toLocaleString() : "—"} />
      </section>

      {/* Site addresses */}
      <Section title={`Site Addresses (${customer.sites.length})`}>
        {customer.sites.length === 0 ? (
          <EmptyRow text="No sites on record." />
        ) : (
          <Table headers={["Site Name", "City", "State"]}>
            {customer.sites.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-navy">{s.siteName}</td>
                <td className="px-4 py-3 text-muted">{s.city}</td>
                <td className="px-4 py-3 text-muted">{s.state}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* Equipment list */}
      <Section title={`Equipment (${customer.equipment.length})`}>
        {customer.equipment.length === 0 ? (
          <EmptyRow text="No equipment on record." />
        ) : (
          <Table headers={["Serial No", "Item", "Category", "Status", "Warranty"]}>
            {customer.equipment.map((eq) => (
              <tr key={eq.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-mono text-xs text-navy">{eq.serialNo}</td>
                <td className="px-4 py-3 text-navy">{eq.itemName}</td>
                <td className="px-4 py-3 text-muted">{eq.equipmentCategory}</td>
                <td className="px-4 py-3 text-muted">{eq.status}</td>
                <td className="px-4 py-3 text-muted">{eq.warrantyStatus}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* Ticket history */}
      <Section title={`Ticket History (${customer.tickets.length})`}>
        {customer.tickets.length === 0 ? (
          <EmptyRow text="No tickets on record." />
        ) : (
          <Table headers={["Ticket No", "Status", "Priority", "Service Type", "Created", "Closed"]}>
            {customer.tickets.map((t) => (
              <tr key={t.id} className="border-b border-line last:border-0 hover:bg-navy-tint">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/tickets/${t.id}`} className="font-medium text-navy hover:underline">
                    {t.ticketNo}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[t.status as TicketStatus] ?? ""}`}>
                    {STATUS_LABEL[t.status as TicketStatus] ?? t.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{PRIORITY_LABEL[t.priority as Priority] ?? t.priority}</td>
                <td className="px-4 py-3 text-muted">{t.serviceType ?? "—"}</td>
                <td className="px-4 py-3 text-muted">{new Date(t.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-muted">{t.closedAt ? new Date(t.closedAt).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* AMC list */}
      <Section title={`AMC Contracts (${customer.amcContracts.length})`}>
        {customer.amcContracts.length === 0 ? (
          <EmptyRow text="No AMC contracts on record." />
        ) : (
          <Table headers={["Contract No", "Status", "Start Date", "End Date"]}>
            {customer.amcContracts.map((a) => (
              <tr key={a.id} className="border-b border-line last:border-0 hover:bg-navy-tint">
                <td className="px-4 py-3">
                  <Link href={`/dashboard/admin/amc-contracts/${a.id}`} className="font-medium text-navy hover:underline">
                    {a.contractReferenceNo}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${RENEWAL_STATUS_STYLE[a.renewalStatus] ?? ""}`}>
                    {a.renewalStatus}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{new Date(a.startDate).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-muted">{new Date(a.endDate).toLocaleDateString()}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-sm text-navy">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-bold text-navy">{title}</h2>
      {children}
    </section>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="rounded-lg border border-line bg-white px-4 py-3 text-sm text-muted">{text}</p>;
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full rounded-lg border border-line bg-white text-sm">
      <thead>
        <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
          {headers.map((h) => (
            <th key={h} className="px-4 py-3">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
