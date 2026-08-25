'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

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

export function useVenusClientValuationReadiness(): {
  clientId: string | null
  readiness: VenusClientValuationReadiness | null
} {
  const searchParams = useSearchParams()
  const clientId = searchParams?.get('clientId')?.trim() || null
  const [readiness, setReadiness] = useState<VenusClientValuationReadiness | null>(null)

  useEffect(() => {
    if (!clientId) {
      setReadiness(null)
      return
    }
    const controller = new AbortController()
    void fetch(`/api/accountants/clients/${encodeURIComponent(clientId)}/valuation-readiness`, {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null
        return (await response.json()) as VenusClientValuationReadiness
      })
      .then((result) => {
        if (result) setReadiness(result)
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [clientId])

  return { clientId, readiness }
}
