import Link from "next/link";

// Admin Console — hub for §5.2's 10 admin-managed config entities plus
// login/security. Only "Login & Security" is actually built today (the
// auth-hardening work: failed-login lockout + unlock); everything else is a
// placeholder until its own Build Plan slot lands (Days 1-3 leaf config,
// Days 4-10/11-16 for Workflow Designer/Notification Templates/Predictive
// Rules — see ACE-Ticket-Engine-Build-Plan.md).
const SECTIONS = [
  {
    label: "Login & Security",
    description: "Locked accounts, unlock action",
    href: "/dashboard/admin/security",
  },
  { label: "Service Types", description: "The 7 service_type values + billing model", href: null },
  { label: "SLA Policies", description: "Response/resolution hours by service type × priority", href: null },
  { label: "Ticket Priorities", description: "Priority levels + Priority Matrix", href: null },
  { label: "Workflow States & Transitions", description: "Ticket lifecycle designer", href: null },
  { label: "Regions & Territories", description: "Region list, ASM territory assignment", href: null },
  { label: "Notification Templates", description: "23 trigger templates, per channel", href: null },
  { label: "Skill Tags", description: "Standard engineer skill-tag list", href: null },
  { label: "Billing Rates", description: "engineer_level → hourly rate", href: null },
  { label: "Predictive Rules", description: "Time-since-service / breakdown-frequency / hours thresholds", href: null },
  { label: "User Management", description: "Full user CRUD (roles, regions, skill tags)", href: null },
];

export default function AdminConsolePage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-1 text-xl font-bold text-navy">Admin Console</h1>
      <p className="mb-6 text-sm text-muted">System configuration (FSD §5.2) and platform administration.</p>

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
