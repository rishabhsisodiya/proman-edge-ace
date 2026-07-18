'use client'
import useSWR from 'swr'
import api from '@/lib/dashboardsApi'

// Ported from PROMAN/frontend/src/hooks/useFinanceSettings.ts — same SWR
// shape, api client import and endpoint path changed to our /dashboards/* prefix.

export interface FinanceSettings {
  grossMarginTargetPct: { default: number; byEntity: Record<string, number> }
}

function fetcher(): Promise<FinanceSettings> {
  return api
    .get<{ success: boolean; data: FinanceSettings }>('/api/v1/dashboards/finance/settings')
    .then(r => r.data.data)
}

export function useFinanceSettings() {
  const { data, error, isLoading, mutate } = useSWR<FinanceSettings>('finance/settings', fetcher)
  return { settings: data ?? null, isLoading, isError: !!error, refresh: mutate }
}

export async function setGmTarget(entity: string | null, value: number): Promise<FinanceSettings> {
  const res = await api.put<{ success: boolean; data: FinanceSettings }>(
    '/api/v1/dashboards/finance/settings/gross-margin-target',
    { entity, value },
  )
  return res.data.data
}

export async function clearGmTargetOverride(entity: string): Promise<FinanceSettings> {
  const res = await api.delete<{ success: boolean; data: FinanceSettings }>(
    `/api/v1/dashboards/finance/settings/gross-margin-target/${encodeURIComponent(entity)}`,
  )
  return res.data.data
}
