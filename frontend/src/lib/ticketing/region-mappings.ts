import { apiFetch } from "@/lib/api";
import { Region } from "./types";

export interface RegionMapping {
  id: string;
  erpTerritory: string;
  region: Region;
  createdAt: string;
  updatedAt: string;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
}

export const listRegionMappings = () => apiFetch<RegionMapping[]>(`/admin/region-mappings`);

export const createRegionMapping = (erpTerritory: string, region: Region) =>
  post<RegionMapping>(`/admin/region-mappings`, { erpTerritory, region });

export const updateRegionMapping = (id: string, region: Region) =>
  apiFetch<RegionMapping>(`/admin/region-mappings/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ region }),
  });

export const deleteRegionMapping = (id: string) =>
  apiFetch<void>(`/admin/region-mappings/${id}`, { method: "DELETE" });
