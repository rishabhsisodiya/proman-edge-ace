import { apiFetch } from "@/lib/api";
import { SELECTABLE_SERVICE_TYPES, SERVICE_TYPE_LABEL } from "./types";

export interface ServiceTypeConfigRow {
  code: string;
  label: string;
  isSystemManaged: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const listServiceTypes = () => apiFetch<ServiceTypeConfigRow[]>(`/service-types`);
export const listActiveServiceTypes = () => apiFetch<ServiceTypeConfigRow[]>(`/service-types?active=true`);

export const createServiceType = (code: string, label: string) =>
  apiFetch<ServiceTypeConfigRow>(`/service-types`, { method: "POST", body: JSON.stringify({ code, label }) });

export const updateServiceTypeConfig = (code: string, input: { label?: string; isActive?: boolean }) =>
  apiFetch<ServiceTypeConfigRow>(`/service-types/${code}`, { method: "PATCH", body: JSON.stringify(input) });

/**
 * Fetches the real active service-type list and rewrites SERVICE_TYPE_LABEL
 * + SELECTABLE_SERVICE_TYPES in place (2026-08-02, Service Types Tier 1) —
 * same in-place-mutation approach as loadWorkflowLabelOverrides()/
 * loadPriorityLabelOverrides(), except this one also grows the *set* of
 * selectable options, not just relabels a fixed set, since Admin can add a
 * genuinely new service type. WARRANTY_RENEWAL_OUTREACH stays excluded from
 * the selectable list regardless of what's Active — it's system-managed,
 * auto-created only, never a manual pick, same as before this change.
 * Silent no-op on failure — the compiled-in 8-row default in types.ts
 * remains a valid fallback.
 */
export async function loadServiceTypeOverrides(): Promise<void> {
  try {
    const rows = await listActiveServiceTypes();
    for (const key of Object.keys(SERVICE_TYPE_LABEL)) delete SERVICE_TYPE_LABEL[key];
    for (const row of rows) SERVICE_TYPE_LABEL[row.code] = row.label;
    const codes = rows.map((r) => r.code).filter((c) => c !== "WARRANTY_RENEWAL_OUTREACH");
    SELECTABLE_SERVICE_TYPES.length = 0;
    SELECTABLE_SERVICE_TYPES.push(...codes);
  } catch {
    // Fall back to compiled-in defaults — never block the app on this.
  }
}
