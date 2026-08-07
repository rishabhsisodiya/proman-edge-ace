"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { Role } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/ticketing/users";
import {
  DashboardAccessRule,
  DashboardRegistryEntry,
  listDashboardAccessRules,
  listDashboardRegistry,
  setDashboardAccessRule,
} from "@/lib/ticketing/dashboard-access";

// Roles relevant to business-dashboard access — excludes the ACE ticketing-only
// roles (Call Center/ASM/Engineer/Manager/CS Support), which have nothing to do
// with these dashboards. Admin is excluded too — it's a universal bypass, never
// gated by this table, so there's nothing to toggle for it.
const DASHBOARD_ROLES: Role[] = [
  "MD",
  "SALES_HEAD_AGGREGATE",
  "SALES_HEAD_IM_BMH",
  "ENGINEERING_DESIGN_HEAD",
  "MANUFACTURING_HEAD",
  "PROCUREMENT_HEAD",
  "STORES_HEAD",
  "QMS_HEAD",
  "DISPATCH_HEAD",
  "SERVICE_AFTERSALES_HEAD",
  "FINANCE_HEAD",
];

export default function DashboardAccessPage() {
  const [registry, setRegistry] = useState<DashboardRegistryEntry[]>([]);
  const [rules, setRules] = useState<DashboardAccessRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    Promise.all([listDashboardRegistry(), listDashboardAccessRules()])
      .then(([reg, r]) => {
        setRegistry(reg);
        setRules(r);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setError("Admin access required.");
        else setError("Could not load dashboard access rules.");
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function isEnabled(role: Role, dashboardKey: string) {
    return rules.find((r) => r.role === role && r.dashboardKey === dashboardKey)?.enabled ?? false;
  }

  async function onToggle(role: Role, dashboardKey: string) {
    const k = `${role}__${dashboardKey}`;
    setBusyKey(k);
    setError(null);
    try {
      await setDashboardAccessRule(role, dashboardKey, !isEnabled(role, dashboardKey));
      load();
    } catch {
      setError("Could not update this access rule.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="p-6">
      <h1 className="mb-2 text-xl font-bold text-navy">Dashboard Access</h1>
      <p className="mb-6 text-sm text-muted">
        Which roles can see which business dashboard. <b>Admin</b> always sees every dashboard and isn&apos;t shown
        here. Every other role starts with no access until granted — check a box to give that role access to that
        dashboard. More dashboards may be added here over time as they&apos;re built.
      </p>

      {error && <p className="mb-4 rounded-md bg-brand-red-bg px-3 py-2 text-xs text-brand-red">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <table className="w-full rounded-lg border border-line bg-white text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-navy">
              <th className="px-4 py-3">Role</th>
              {registry.map((d) => (
                <th key={d.key} className="px-4 py-3 text-center">
                  {d.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DASHBOARD_ROLES.map((role) => (
              <tr key={role} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-navy">{ROLE_LABEL[role]}</td>
                {registry.map((d) => {
                  const k = `${role}__${d.key}`;
                  return (
                    <td key={d.key} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={isEnabled(role, d.key)}
                        disabled={busyKey === k}
                        onChange={() => onToggle(role, d.key)}
                        className="h-4 w-4"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
