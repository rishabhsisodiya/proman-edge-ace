'use client'
import useSWR from 'swr'
import api, { ApiError } from '@/lib/dashboardsApi'
import type { FinanceHomepageData } from '@/types/finance'
import { fiscalYearRange } from '@/lib/fiscalYear'

// Ported from PROMAN/frontend/src/hooks/useFinanceHomepage.ts — same SWR
// usage/refresh interval, api client import and endpoint path changed to our
// /dashboards/* prefix, plus now surfaces the HTTP status so the page can
// distinguish 403 (no access) from a real connection failure.

function fetcher(fyStart: string, fyEnd: string): Promise<FinanceHomepageData> {
  return api
    .get<{ success: boolean; data: FinanceHomepageData }>('/api/v1/dashboards/finance/homepage', {
      params: { fy_start: fyStart, fy_end: fyEnd },
    })
    .then(r => r.data.data)
}

export function useFinanceHomepage(fyStartYear: number) {
  const { fyStart, fyEnd } = fiscalYearRange(fyStartYear)
  const { data, error, isLoading, mutate } = useSWR<FinanceHomepageData>(
    ['finance/homepage', fyStart, fyEnd],
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

export interface FinanceActionResult {
  ok: boolean
  summary?: {
    purchase_invoice?: string
    payment_entry?: string
    paid_amount?: number
    docstatus?: number
    journal_entry?: string
    name?: string
    [k: string]: unknown
  }
  deep_link?: string
  meta?: { note?: string }
  error?: { code?: string; message?: string }
}

export async function releasePayment(invoiceNo: string): Promise<FinanceActionResult> {
  const res = await api.post<{ success: boolean; data: FinanceActionResult }>(
    '/api/v1/dashboards/finance/action-queue/release',
    { invoiceNo },
  )
  return res.data.data
}

export async function approvePurchaseOrder(poNo: string): Promise<FinanceActionResult> {
  const res = await api.post<{ success: boolean; data: FinanceActionResult }>(
    '/api/v1/dashboards/finance/po-approval/approve',
    { poNo },
  )
  return res.data.data
}

export async function approveJournalEntry(journalEntry: string): Promise<FinanceActionResult> {
  const res = await api.post<{ success: boolean; data: FinanceActionResult }>(
    '/api/v1/dashboards/finance/action-queue/approve-je',
    { journalEntry },
  )
  return res.data.data
}
