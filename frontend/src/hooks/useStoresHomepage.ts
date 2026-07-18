'use client'
import useSWR from 'swr'
import api, { ApiError } from '@/lib/dashboardsApi'
import type { StoresHomepageData, StoresActionResult } from '@/types/stores'
import { fiscalYearRange } from '@/lib/fiscalYear'

// Ported from PROMAN/frontend/src/hooks/useStoresHomepage.ts — same SWR
// usage/refresh interval and 120s timeout override, api client import and
// endpoint path changed to our /dashboards/* prefix, plus now surfaces the
// HTTP status so the page can distinguish 403 (no access) from a real
// connection failure.
//
// Cold cache can take 60-90s+ on this DB (several widgets scan large ERPNext
// tables — see stores.service.ts). Override the default 10s client timeout so
// a cache-miss load doesn't error out before the backend responds.
function fetcher(fyStart: string, fyEnd: string): Promise<StoresHomepageData> {
  return api
    .get<{ success: boolean; data: StoresHomepageData }>('/api/v1/dashboards/stores/homepage', {
      timeout: 120_000, params: { fy_start: fyStart, fy_end: fyEnd },
    })
    .then(r => r.data.data)
}

export function useStoresHomepage(fyStartYear: number) {
  const { fyStart, fyEnd } = fiscalYearRange(fyStartYear)
  const { data, error, isLoading, mutate } = useSWR<StoresHomepageData>(
    ['stores/homepage', fyStart, fyEnd],
    () => fetcher(fyStart, fyEnd),
    { refreshInterval: 300_000 }, // 5 min
  )
  return {
    data: data ?? null,
    isLoading,
    isError: !!error,
    status: error instanceof ApiError ? error.status : undefined,
    refresh: mutate,
  }
}

export async function submitGrn(grnNo: string, action?: string): Promise<StoresActionResult> {
  const res = await api.post<{ success: boolean; data: StoresActionResult }>(
    `/api/v1/dashboards/stores/grn/${encodeURIComponent(grnNo)}/submit`,
    action ? { action } : {},
  )
  return res.data.data
}

export async function createMaterialRequest(itemCode: string, qty: number, warehouse?: string): Promise<StoresActionResult> {
  const res = await api.post<{ success: boolean; data: StoresActionResult }>(
    '/api/v1/dashboards/stores/material-request',
    { itemCode, qty, warehouse },
  )
  return res.data.data
}

export async function createPoFromMr(materialRequest: string, supplier?: string): Promise<StoresActionResult> {
  const res = await api.post<{ success: boolean; data: StoresActionResult }>(
    '/api/v1/dashboards/stores/purchase-order-from-mr',
    { materialRequest, supplier },
  )
  return res.data.data
}
