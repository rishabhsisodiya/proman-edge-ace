import { apiFetch, ApiError } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100/api/v1";

export interface Holiday {
  id: string;
  date: string;
  label: string;
  createdAt: string;
}

export interface HolidayUploadResult {
  total: number;
  succeeded: number;
  failed: number;
  results: { row: number; date?: string; error?: string }[];
}

export const listHolidays = () => apiFetch<Holiday[]>(`/admin/holidays`);

export const createHoliday = (date: string, label: string) =>
  apiFetch<Holiday>(`/admin/holidays`, { method: "POST", body: JSON.stringify({ date, label }) });

export const deleteHoliday = (id: string) => apiFetch<void>(`/admin/holidays/${id}`, { method: "DELETE" });

export function downloadHolidayTemplate() {
  window.open(`${API_URL}/admin/holidays/template`, "_blank");
}

/** Not routed through apiFetch — that forces Content-Type: application/json, which breaks multipart. */
export async function uploadHolidays(file: File): Promise<HolidayUploadResult> {
  const formData = new FormData();
  formData.append("file", file);

  const send = () => fetch(`${API_URL}/admin/holidays/upload`, { method: "POST", credentials: "include", body: formData });

  let res = await send();
  if (res.status === 401) {
    const refreshed = await fetch(`${API_URL}/auth/refresh`, { method: "POST", credentials: "include" });
    if (refreshed.ok) res = await send();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<HolidayUploadResult>;
}
