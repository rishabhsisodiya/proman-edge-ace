'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import api from '@/lib/dashboardsApi'
import { deleteCookie } from '@/lib/api'

// Ported from PROMAN/frontend/src/hooks/useCurrentUser.ts — same SWR shape
// and behavior, adapted to our auth: our /auth/me response shape (fullName,
// role are what page.tsx actually reads) and our real cookie names on
// session-expiry cleanup, redirecting to /login instead of /.

export interface CurrentUser {
  id:       string
  fullName: string
  email:    string
  role:     string
}

function fetchMe(): Promise<CurrentUser> {
  return api
    .get<{ success: boolean; data: CurrentUser } | CurrentUser>('/api/v1/auth/me')
    .then(r => ('data' in r.data ? (r.data as { data: CurrentUser }).data : (r.data as CurrentUser)))
}

export function useCurrentUser() {
  const router = useRouter()
  const { data, error, isLoading } = useSWR<CurrentUser>('auth/me', fetchMe, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })

  useEffect(() => {
    if (error) {
      deleteCookie('ace_token')
      deleteCookie('ace_refresh')
      deleteCookie('ace_user')
      router.replace('/login')
    }
  }, [error, router])

  return { user: data ?? null, isLoading, isError: !!error }
}
