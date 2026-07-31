import { apiFetch } from "@/lib/api";

export interface CsatSurveyState {
  ticketNo: string;
  alreadySubmitted: boolean;
  score: number | null;
  responseText: string | null;
}

// Public (unauthenticated) — same apiFetch client works fine here since
// there's no auth guard on this backend route at all; its 401-refresh logic
// simply never triggers.
export const getCsatSurveyState = (ticketId: string) => apiFetch<CsatSurveyState>(`/public/csat/${ticketId}`);

export const submitCsat = (ticketId: string, score: number, responseText?: string) =>
  apiFetch<{ ok: boolean }>(`/public/csat/${ticketId}`, {
    method: "POST",
    body: JSON.stringify({ score, responseText }),
  });
