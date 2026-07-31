import { apiFetch } from "@/lib/api";
import { STATUS_LABEL, TicketStatus } from "./types";

export interface TicketStatusLabelRow {
  status: TicketStatus;
  label: string;
  updatedAt: string;
}

export const listWorkflowLabels = () => apiFetch<TicketStatusLabelRow[]>(`/workflow-labels`);

export const updateWorkflowLabel = (status: TicketStatus, label: string) =>
  apiFetch<TicketStatusLabelRow>(`/workflow-labels/${status}`, { method: "PATCH", body: JSON.stringify({ label }) });

/**
 * Fetches Admin-edited status labels and mutates the shared STATUS_LABEL
 * object in place (2026-08-01, FSD §5.2 "Workflow States & Transitions"
 * scoped down to labels-only). Every existing call site across the app
 * already reads `STATUS_LABEL[status]` from this same imported object, so
 * mutating it here — rather than introducing a separate reactive store —
 * means zero other files need touching to pick up an Admin's edits. Silent
 * no-op on failure: the compiled-in defaults in `types.ts` are always a
 * valid fallback, so a failed fetch is never worse than before this existed.
 */
export async function loadWorkflowLabelOverrides(): Promise<void> {
  try {
    const rows = await listWorkflowLabels();
    for (const row of rows) STATUS_LABEL[row.status] = row.label;
  } catch {
    // Fall back to compiled-in defaults — never block the app on this.
  }
}
