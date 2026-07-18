'use client'
import useSWR from 'swr'
import api, { ApiError } from '@/lib/dashboardsApi'
import type { ProcurementHomepageData, PODetail, ProcurementActionResult } from '@/types/procurement'
import { fiscalYearRange } from '@/lib/fiscalYear'

// Ported from PROMAN/frontend/src/hooks/useProcurementHomepage.ts — same SWR
// usage/refresh interval, api client import and endpoint path changed to our
// /dashboards/* prefix, plus now surfaces the HTTP status so the page can
// distinguish 403 (no access) from a real connection failure.

function fetcher(fyStart: string, fyEnd: string): Promise<ProcurementHomepageData> {
  return api
    .get<{ success: boolean; data: ProcurementHomepageData }>('/api/v1/dashboards/procurement/homepage', {
      params: { fy_start: fyStart, fy_end: fyEnd },
    })
    .then(r => r.data.data)
}

export function useProcurementHomepage(fyStartYear: number) {
  const { fyStart, fyEnd } = fiscalYearRange(fyStartYear)
  const { data, error, isLoading, mutate } = useSWR<ProcurementHomepageData>(
    ['procurement/homepage', fyStart, fyEnd],
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

export async function fetchPODetail(poNo: string): Promise<PODetail | null> {
  try {
    const res = await api.get<{ success: boolean; data: PODetail }>(
      `/api/v1/dashboards/procurement/po/${encodeURIComponent(poNo)}`,
    )
    return res.data.data
  } catch {
    return null
  }
}

export async function approvePO(poNo: string): Promise<ProcurementActionResult> {
  const res = await api.post<{ success: boolean; data: ProcurementActionResult }>(
    `/api/v1/dashboards/procurement/po/${encodeURIComponent(poNo)}/approve`,
  )
  return res.data.data
}

export async function returnPO(poNo: string, reason: string): Promise<ProcurementActionResult> {
  const res = await api.post<{ success: boolean; data: ProcurementActionResult }>(
    `/api/v1/dashboards/procurement/po/${encodeURIComponent(poNo)}/return`,
    { reason },
  )
  return res.data.data
}

export async function logFollowUp(poNo: string, comment: string): Promise<ProcurementActionResult> {
  const res = await api.post<{ success: boolean; data: ProcurementActionResult }>(
    `/api/v1/dashboards/procurement/po/${encodeURIComponent(poNo)}/followup`,
    { comment },
  )
  return res.data.data
}

export async function makeGRN(poNo: string): Promise<ProcurementActionResult> {
  const res = await api.post<{ success: boolean; data: ProcurementActionResult }>(
    `/api/v1/dashboards/procurement/po/${encodeURIComponent(poNo)}/grn`,
  )
  return res.data.data
}
