import { apiFetch } from "@/lib/api";

export interface AmcEngineSettings {
  id: number;
  lookAheadDays: number;
}

export const getAmcEngineSettings = () => apiFetch<AmcEngineSettings>(`/admin/amc-engine-settings`);

export const updateAmcEngineSettings = (lookAheadDays: number) =>
  apiFetch<AmcEngineSettings>(`/admin/amc-engine-settings`, { method: "PATCH", body: JSON.stringify({ lookAheadDays }) });
