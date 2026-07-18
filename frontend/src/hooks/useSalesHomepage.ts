'use client'
import useSWR from 'swr'
import api, { ApiError } from '@/lib/dashboardsApi'
import type { SalesHomepageData } from '@/types/sales'

// Ported from PROMAN/frontend/src/hooks/useSalesHomepage.ts — same SWR usage,
// api client import and endpoint path changed (our backend groups dashboard
// routes under /dashboards/*), plus now surfaces the HTTP status so the page
// can distinguish 403 (no access) from a real connection failure.

function fetcher(url: string): Promise<SalesHomepageData> {
  return api.get<{ success: boolean; data: SalesHomepageData }>(url).then(r => r.data.data)
}

// companies: single string or array — ['PISPL'] | ['PISPL','ACE','PROMAX']
export function useSalesHomepage(companies: string | string[] = ['PISPL']) {
  const param = Array.isArray(companies) ? companies.join(',') : companies

  const { data, error, isLoading, mutate } = useSWR<SalesHomepageData>(
    `/api/v1/dashboards/sales/homepage?companies=${param}`,
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false, refreshInterval: 300_000 },
  )

  return {
    data: data ?? null,
    isLoading,
    isError: !!error,
    status: error instanceof ApiError ? error.status : undefined,
    refresh: () => mutate(),
  }
}
