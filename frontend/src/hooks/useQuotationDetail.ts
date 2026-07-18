'use client'
import useSWR from 'swr'
import api from '@/lib/dashboardsApi'
import type { QuotationDetail, SalesActionResult } from '@/types/sales'

// Ported from PROMAN/frontend/src/hooks/useQuotationDetail.ts — same SWR/call
// shape, api client import and endpoint path changed to our /dashboards/* prefix.

const fetcher = (url: string) =>
  api.get<{ success: boolean; data: QuotationDetail }>(url).then(r => r.data.data)

export function useQuotationDetail(quotation: string | null) {
  const { data, isLoading } = useSWR<QuotationDetail>(
    quotation ? `/api/v1/dashboards/sales/quotation/${encodeURIComponent(quotation)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  )
  return { detail: data ?? null, isLoading }
}

export async function extendQuotation(
  quotation: string,
  opts: { valid_till?: string; days?: number } = {},
): Promise<{ validTill?: string }> {
  try {
    const res = await api.post<{ success: boolean; validTill?: string; error?: string }>(
      `/api/v1/dashboards/sales/quotation/${encodeURIComponent(quotation)}/extend`,
      opts,
    )
    if (!res.data.success) throw new Error(res.data.error ?? 'Extend failed')
    return { validTill: res.data.validTill }
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { error?: string } }; message?: string }
    const msg = axiosError?.response?.data?.error ?? axiosError?.message ?? 'Extend failed'
    throw new Error(msg)
  }
}

export async function logFollowUp(quotation: string, message: string, sendEmail = true): Promise<SalesActionResult> {
  try {
    const res = await api.post<{ success: boolean; data?: SalesActionResult; error?: string }>(
      `/api/v1/dashboards/sales/quotation/${encodeURIComponent(quotation)}/followup`,
      { message, sendEmail },
    )
    if (!res.data.success || !res.data.data) throw new Error(res.data.error ?? 'Follow-up failed')
    return res.data.data
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { error?: string } }; message?: string }
    const msg = axiosError?.response?.data?.error ?? axiosError?.message ?? 'Follow-up failed'
    throw new Error(msg)
  }
}

export async function convertToSalesOrder(quotation: string, deliveryDate?: string): Promise<{ salesOrder?: string }> {
  try {
    const res = await api.post<{ success: boolean; salesOrder?: string; error?: string }>(
      `/api/v1/dashboards/sales/quotation/${encodeURIComponent(quotation)}/convert`,
      deliveryDate ? { delivery_date: deliveryDate } : {},
    )
    if (!res.data.success) throw new Error(res.data.error ?? 'Conversion failed')
    return { salesOrder: res.data.salesOrder }
  } catch (err: unknown) {
    const axiosError = err as { response?: { data?: { error?: string } }; message?: string }
    const msg = axiosError?.response?.data?.error ?? axiosError?.message ?? 'Conversion failed'
    throw new Error(msg)
  }
}
