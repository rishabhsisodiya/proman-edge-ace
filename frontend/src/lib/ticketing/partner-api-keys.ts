import { apiFetch } from "@/lib/api";

export interface PartnerApiKey {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdBy: { fullName: string };
}

export interface GeneratedPartnerApiKey {
  id: string;
  label: string;
  rawKey: string;
  createdAt: string;
}

export const listPartnerApiKeys = () => apiFetch<PartnerApiKey[]>(`/admin/partner-api-keys`);

export const generatePartnerApiKey = (label: string) =>
  apiFetch<GeneratedPartnerApiKey>(`/admin/partner-api-keys`, { method: "POST", body: JSON.stringify({ label }) });

export const revokePartnerApiKey = (id: string) =>
  apiFetch<void>(`/admin/partner-api-keys/${id}`, { method: "DELETE" });
