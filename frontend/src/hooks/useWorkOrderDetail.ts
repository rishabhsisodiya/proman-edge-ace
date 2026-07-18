import useSWR from 'swr'
import api from '@/lib/dashboardsApi'

// Ported verbatim from PROMAN/frontend/src/hooks/useWorkOrderDetail.ts
// — only the api client import and endpoint path changed.

export interface WODetail {
  wo: string
  status: string
  product: string
  qty: number
  producedQty: number
  completion: number
  dueDate: string
  salesOrder: string
  customer: string
  company: string
  stage: string
}

const fetcher = (url: string) =>
  api.get<{ success: boolean; data: WODetail }>(url).then(r => r.data.data)

export function useWorkOrderDetail(wo: string | null) {
  const { data, isLoading } = useSWR<WODetail>(
    wo ? `/api/v1/dashboards/manufacturing/work-order/${encodeURIComponent(wo)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  return { detail: data ?? null, isLoading }
}
