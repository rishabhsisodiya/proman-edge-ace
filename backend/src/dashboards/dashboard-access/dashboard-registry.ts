/**
 * Single source of truth for which business dashboards exist. Adding a new
 * dashboard later is: add an entry here + wire its controller with
 * @DashboardKey(...) — no Prisma migration needed for the access-control
 * system itself (DashboardAccessRule.dashboardKey is a plain string, not an
 * enum), since the client expects more dashboards to come.
 */
export const DASHBOARD_REGISTRY = [
  { key: 'SALES', label: 'Sales' },
  { key: 'DISPATCH', label: 'Dispatch' },
  { key: 'STORES', label: 'Stores' },
  { key: 'MANUFACTURING', label: 'Manufacturing' },
  { key: 'PROCUREMENT', label: 'Procurement' },
  { key: 'FINANCE', label: 'Finance' },
] as const;

export type DashboardKey = (typeof DASHBOARD_REGISTRY)[number]['key'];

export const DASHBOARD_KEYS = DASHBOARD_REGISTRY.map((d) => d.key) as DashboardKey[];
