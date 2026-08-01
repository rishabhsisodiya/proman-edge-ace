import { apiFetch } from "@/lib/api";
import { PRIORITY_LABEL, Priority } from "./types";

export interface PriorityLabelRow {
  priority: Priority;
  label: string;
  definition: string | null;
  updatedAt: string;
}

export const listPriorityLabels = () => apiFetch<PriorityLabelRow[]>(`/priority-labels`);

export const updatePriorityLabel = (priority: Priority, label: string, definition?: string) =>
  apiFetch<PriorityLabelRow>(`/priority-labels/${priority}`, { method: "PATCH", body: JSON.stringify({ label, definition }) });

/** Same in-place-mutation approach as loadWorkflowLabelOverrides() — see that function's comment. */
export async function loadPriorityLabelOverrides(): Promise<void> {
  try {
    const rows = await listPriorityLabels();
    for (const row of rows) PRIORITY_LABEL[row.priority] = row.label;
  } catch {
    // Fall back to compiled-in defaults — never block the app on this.
  }
}
