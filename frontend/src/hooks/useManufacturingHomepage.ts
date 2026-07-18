'use client'
import useSWR from 'swr'
import api, { ApiError } from '@/lib/dashboardsApi'
import type { ManufacturingHomepageData } from '@/types/manufacturing'

// Ported from PROMAN/frontend/src/hooks/useManufacturingHomepage.ts — same
// SWR usage/refresh interval, api client import and endpoint path changed
// (our backend groups dashboard routes under /dashboards/*), plus now
// surfaces the HTTP status so the page can distinguish 403 (no access) from
// a real connection failure instead of one generic error message.

function fetcher(): Promise<ManufacturingHomepageData> {
  return api
    .get<{ success: boolean; data: ManufacturingHomepageData }>('/api/v1/dashboards/manufacturing/homepage')
    .then(r => r.data.data)
}

export function useManufacturingHomepage() {
  const { data, error, isLoading, mutate } = useSWR<ManufacturingHomepageData>(
    'manufacturing/homepage',
    fetcher,
    { refreshInterval: 300_000 } // 5 min
  )
  return {
    data:      data ?? null,
    isLoading,
    isError:   !!error,
    status:    error instanceof ApiError ? error.status : undefined,
    refresh:   mutate,
  }
}
