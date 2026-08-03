import { apiFetch } from "@/lib/api";

export interface SkillTagRow {
  id: string;
  label: string;
  createdAt: string;
}

export const listSkillTags = () => apiFetch<SkillTagRow[]>(`/skill-tags`);

export const createSkillTag = (label: string) =>
  apiFetch<SkillTagRow>(`/skill-tags`, { method: "POST", body: JSON.stringify({ label }) });

export const deleteSkillTag = (id: string) => apiFetch<void>(`/skill-tags/${id}`, { method: "DELETE" });
