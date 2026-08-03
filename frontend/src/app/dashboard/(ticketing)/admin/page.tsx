import Link from "next/link";

// Admin Console — hub for §5.2's 10 admin-managed config entities plus
// User Management. "Login & Security" (failed-login lockout + unlock) was
// merged into User Management (2026-07-28) — locked accounts now show a
// badge + Unlock action directly on the Users list instead of a separate
// screen. Several other entries are still placeholders until their own
// Build Plan slot lands (Days 1-3 leaf config, Days 4-10/11-16 for Workflow
// Designer/Notification Templates/Predictive Rules — see
// ACE-Ticket-Engine-Build-Plan.md).
const SECTIONS = [
  {
    label: "User Management",
    description: "Create/edit users (any role except Admin), regions, skill tags, companies, locked-account unlock",
    href: "/dashboard/admin/users",
  },
  {
    label: "Equipment",
    description: "Manual equipment records — primary onboarding path until ERPNext Serial No is usable",
    href: "/dashboard/admin/equipment",
  },
  {
    label: "AMC Contracts",
    description: "Annual Maintenance Contracts, coverage, and renewal status",
    href: "/dashboard/admin/amc-contracts",
  },
  {
    label: "Service Types",
    description: "Add new service types, edit labels, activate/deactivate",
    href: "/dashboard/admin/service-types",
  },
  {
    label: "SLA Configuration",
    description: "Response/resolution policies, clock-pausing statuses, and the business-hours holiday list",
    href: "/dashboard/admin/sla",
  },
  {
    label: "Ticket Priorities",
    description: "Edit label + definition per priority level",
    href: "/dashboard/admin/priority-labels",
  },
  {
    label: "Workflow States & Transitions",
    description: "Edit each status's display label",
    href: "/dashboard/admin/workflow-labels",
  },
  {
    label: "Regions & Territories",
    description: "ERPNext territory → Region mapping, used by the nightly Customer Sync job",
    href: "/dashboard/admin/region-mapping",
  },
  {
    label: "Sync Monitor",
    description: "ERPNext Customer sync history, failures, skipped records, needs-review",
    href: "/dashboard/admin/sync-monitor",
  },
  {
    label: "Bulk Ticket Import",
    description: "Upload a CSV of ticket rows — valid rows create tickets, invalid rows report per-row errors",
    href: "/dashboard/admin/bulk-import",
  },
  {
    label: "Partner API Keys",
    description: "Generate/revoke API keys for the partner/IoT ticket-creation webhook",
    href: "/dashboard/admin/partner-api-keys",
  },
  {
    label: "Notification Templates",
    description: "Per-trigger, per-channel message content (13 of 23 triggers wired so far)",
    href: "/dashboard/admin/notification-templates",
  },
  { label: "Skill Tags", description: "Standard engineer skill-tag list", href: null },
  {
    label: "Billing Rates",
    description: "engineer_level → hourly rate, used for labour billing on chargeable tickets",
    href: "/dashboard/admin/billing-rates",
  },
  {
    label: "Selling Price Lists",
    description: "ERPNext price list names selectable when creating a Quotation, plus the default",
    href: "/dashboard/admin/price-lists",
  },
  {
    label: "Predictive Rules",
    description: "Per-category thresholds for time-since-service, operating hours, and breakdown frequency",
    href: "/dashboard/admin/predictive-rules",
  },
];

export default function AdminConsolePage() {
  return (
    <div className="w-full px-6 py-10">
      <h1 className="mb-1 text-xl font-bold text-navy">Admin Console</h1>
      <p className="mb-6 text-sm text-muted">System configuration and platform administration.</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) =>
          s.href ? (
            <Link
              key={s.label}
              href={s.href}
              className="rounded-lg border border-line bg-white p-4 transition hover:border-navy hover:shadow-[0_1px_4px_rgba(42,47,105,.08)]"
            >
              <p className="text-sm font-bold text-navy">{s.label}</p>
              <p className="mt-1 text-xs text-muted">{s.description}</p>
            </Link>
          ) : (
            <div
              key={s.label}
              title="Not built yet"
              className="cursor-not-allowed rounded-lg border border-line bg-zinc-50 p-4 opacity-60"
            >
              <p className="text-sm font-bold text-navy">{s.label}</p>
              <p className="mt-1 text-xs text-muted">{s.description}</p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
