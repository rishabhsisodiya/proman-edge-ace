import { apiFetch } from "@/lib/api";

export interface PredictiveRuleConfig {
  id: string;
  equipmentCategory: string;
  monthsSinceService: number;
  operatingHoursInterval: number;
  breakdownFrequencyThreshold: number;
  breakdownFrequencyWindowMonths: number;
  updatedAt: string;
}

export const listPredictiveRules = () => apiFetch<PredictiveRuleConfig[]>(`/admin/predictive-rules`);

export const updatePredictiveRule = (
  id: string,
  monthsSinceService: number,
  operatingHoursInterval: number,
  breakdownFrequencyThreshold: number,
  breakdownFrequencyWindowMonths: number,
) =>
  apiFetch<PredictiveRuleConfig>(`/admin/predictive-rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ monthsSinceService, operatingHoursInterval, breakdownFrequencyThreshold, breakdownFrequencyWindowMonths }),
  });
