import Link from "next/link";

// Admin's "Dashboards" hub — one place to reach every dashboard in the app,
// grouped by product area, instead of a flat sidebar list mixing ticketing
// roles with unrelated ERP modules. KPI-style ticketing dashboards
// (Executive/MD, CS Support) are placeholders until the aggregation layer
// and Quotation module exist.
const TICKETING_DASHBOARDS = [
  { label: "Call Center", description: "Intake, unassigned, SLA-at-risk", href: "/dashboard/call-center" },
  { label: "ASM", description: "Territory open tickets, pending acceptance", href: "/dashboard/asm" },
  { label: "Manager / Tickets", description: "Full ticket list, regional SLA overview", href: "/dashboard/service" },
  { label: "Executive / MD", description: "Summary KPI tiles (read-only)", href: null },
  { label: "CS Support", description: "Quotations pending PO, parts pending delivery", href: null },
];

// The original Proman Edge ERP dashboards — a separate, already-complete
// product area reading from ERPNext, not part of ACE ticketing.
const ERP_DASHBOARDS = [
  { label: "Manufacturing", description: "Work orders, production pipeline, material requests", href: "/dashboard/manufacturing" },
  { label: "Sales", description: "Quotations, sales orders, customer follow-ups", href: "/dashboard/sales" },
  { label: "Finance", description: "Cash & bank, GST liability, PO/JE approvals", href: "/dashboard/finance" },
  { label: "Procurement", description: "Purchase orders, GRN, vendor follow-up", href: "/dashboard/procurement" },
  { label: "Dispatch", description: "E-way bills, dispatch checklist", href: "/dashboard/dispatch" },
  { label: "Stores", description: "Material requests, GRN submission", href: "/dashboard/stores" },
];

function DashboardGrid({ items }: { items: { label: string; description: string; href: string | null }[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((d) =>
        d.href ? (
          <Link
            key={d.label}
            href={d.href}
            className="rounded-lg border border-line bg-white p-4 transition hover:border-navy hover:shadow-[0_1px_4px_rgba(42,47,105,.08)]"
          >
            <p className="text-sm font-bold text-navy">{d.label}</p>
            <p className="mt-1 text-xs text-muted">{d.description}</p>
          </Link>
        ) : (
          <div key={d.label} title="Not built yet" className="cursor-not-allowed rounded-lg border border-line bg-zinc-50 p-4 opacity-60">
            <p className="text-sm font-bold text-navy">{d.label}</p>
            <p className="mt-1 text-xs text-muted">{d.description}</p>
          </div>
        ),
      )}
    </div>
  );
}

export default function DashboardsHubPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <div>
        <h1 className="mb-1 text-xl font-bold text-navy">Dashboards</h1>
        <p className="text-sm text-muted">One place to reach every dashboard in the app.</p>
      </div>

      <div>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-navy">Service Ticketing (ACE)</h2>
        <DashboardGrid items={TICKETING_DASHBOARDS} />
      </div>

      <div>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-navy">Business Dashboards (ERP)</h2>
        <DashboardGrid items={ERP_DASHBOARDS} />
      </div>
    </div>
  );
}
