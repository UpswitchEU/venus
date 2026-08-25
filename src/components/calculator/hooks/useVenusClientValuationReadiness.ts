'use client'

import { useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

export interface VenusClientValuationReadiness {
  state: 'syncing' | 'review_required' | 'ready' | 'queued' | 'calculating' | 'complete' | 'failed'
  source: {
    provider: string | null
    synced_at: string | null
    fiscal_years: number[]
  }
  issues: Array<{
    code: string
    action: string
    fiscal_year?: number
    reason_code?: string
    supports_attestation?: boolean
  }>
}

async function fetchClientValuationReadiness(
  clientId: string,
  signal?: AbortSignal
): Promise<VenusClientValuationReadiness> {
  const response = await fetch(
    `/api/accountants/clients/${encodeURIComponent(clientId)}/valuation-readiness`,
    {
      credentials: 'include',
      cache: 'no-store',
      signal,
    }
  )
  if (!response.ok) throw new Error('Failed to fetch valuation readiness')
  return response.json() as Promise<VenusClientValuationReadiness>
}

export function useVenusClientValuationReadiness(): {
  clientId: string | null
  readiness: VenusClientValuationReadiness | null
  refreshReadiness: () => Promise<VenusClientValuationReadiness | null>
} {
  const searchParams = useSearchParams()
  const clientId = searchParams?.get('clientId')?.trim() || null
  const [readiness, setReadiness] = useState<VenusClientValuationReadiness | null>(null)

  const refreshReadiness = useCallback(async () => {
    if (!clientId) {
      setReadiness(null)
      return null
    }
    const next = await fetchClientValuationReadiness(clientId)
    setReadiness(next)
    return next
  }, [clientId])

  useEffect(() => {
    if (!clientId) {
      setReadiness(null)
      return
    }
    const controller = new AbortController()
    setReadiness(null)
    void fetchClientValuationReadiness(clientId, controller.signal)
      .then(setReadiness)
      .catch(() => undefined)
    return () => controller.abort()
  }, [clientId])

  return { clientId, readiness, refreshReadiness }
}
