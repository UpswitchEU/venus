'use client'

import { useEffect, useState } from 'react'
import type { LedgerAccount } from '@/constants/grootboek'
import { generalLogger } from '@/utils/logger'

const GROOTBOEK_REFERENCE_URL = '/api/reference/grootboek'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAbortError(error: unknown) {
  return (
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError') ||
    (isRecord(error) && error.name === 'AbortError')
  )
}

export function normalizeLedgerAccountsPayload(payload: unknown): LedgerAccount[] {
  if (!isRecord(payload)) return []

  const nestedData = isRecord(payload.data) ? payload.data : null
  const codes = Array.isArray(payload.codes)
    ? payload.codes
    : nestedData && Array.isArray(nestedData.codes)
      ? nestedData.codes
      : []

  return codes.filter(isRecord).map((account) => ({
    code: String(account.code ?? ''),
    name: String(account.name ?? ''),
    category: typeof account.category === 'string' ? account.category : '',
  }))
}

export function useFetchedLedgerAccounts(logContext = '[useFetchedLedgerAccounts]') {
  const [fetchedLedgers, setFetchedLedgers] = useState<LedgerAccount[]>([])

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    fetch(GROOTBOEK_REFERENCE_URL, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload) return
        const ledgers = normalizeLedgerAccountsPayload(payload)
        if (ledgers.length > 0) setFetchedLedgers(ledgers)
      })
      .catch((error) => {
        if (cancelled || isAbortError(error)) return
        generalLogger.debug(`${logContext} Grootboek fetch failed, using defaults`, {
          error: error instanceof Error ? error.message : String(error),
        })
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [logContext])

  return fetchedLedgers
}
