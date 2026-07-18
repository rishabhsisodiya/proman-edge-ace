export function formatDueIn(dueIso: string | null): { label: string; state: "breached" | "at-risk" | "ok" } | null {
  if (!dueIso) return null;
  const diffMs = new Date(dueIso).getTime() - Date.now();
  const hours = Math.abs(diffMs) / (1000 * 60 * 60);
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);

  if (diffMs < 0) {
    return { label: `Breached ${h}h ${m}m ago`, state: "breached" };
  }
  if (hours < 6) {
    return { label: `${h}h ${m}m left`, state: "at-risk" };
  }
  return { label: `${h}h left`, state: "ok" };
}
