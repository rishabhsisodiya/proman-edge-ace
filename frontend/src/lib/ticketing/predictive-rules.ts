import { apiFetch } from "@/lib/api";

export interface PredictiveRuleConfig {
  id: string;
  equipmentCategory: string;
  monthsSinceService: number;
  operatingHoursInterval: number;
  breakdownFrequencyThreshold: number;
  breakdownFrequencyWindowMonths: number;
  warrantyPmIntervalMonths: number;
  updatedAt: string;
}

export const listPredictiveRules = () => apiFetch<PredictiveRuleConfig[]>(`/admin/predictive-rules`);

export const updatePredictiveRule = (
  id: string,
  monthsSinceService: number,
  operatingHoursInterval: number,
  breakdownFrequencyThreshold: number,
  breakdownFrequencyWindowMonths: number,
  warrantyPmIntervalMonths: number,
) =>
  apiFetch<PredictiveRuleConfig>(`/admin/predictive-rules/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      monthsSinceService,
      operatingHoursInterval,
      breakdownFrequencyThreshold,
      breakdownFrequencyWindowMonths,
      warrantyPmIntervalMonths,
    }),
  });

/** Warranty PM ticket-creation look-ahead — single Admin-configurable setting, same panel as the per-category rules. */
export const getWarrantyPmSettings = () => apiFetch<{ lookAheadDays: number }>(`/admin/predictive-rules/warranty-pm-settings`);

export const setWarrantyPmSettings = (lookAheadDays: number) =>
  apiFetch<{ lookAheadDays: number }>(`/admin/predictive-rules/warranty-pm-settings`, {
    method: "PATCH",
    body: JSON.stringify({ lookAheadDays }),
  });
