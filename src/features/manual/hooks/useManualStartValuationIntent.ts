import { useEffect, useRef } from 'react'
import type { ValuationFormData } from '../../../components/calculator'
import { generalLogger } from '../../../utils/logger'
import { getManualSubmitValidationIssue } from '../utils/manualSubmitValidation'

export const START_VALUATION_INTENT = 'start_valuation' as const
export const START_VALUATION_RESERVATION_TTL_MS = 5 * 60 * 1000

const START_VALUATION_COMPLETE = 'complete'
const START_VALUATION_RESERVED_PREFIX = 'reserved:'

export function startValuationIntentStorageKey(reportId: string): string {
  return `venus:start-valuation-intent:v1:${reportId}`
}

function startValuationReservation(now: number): string {
  return `${START_VALUATION_RESERVED_PREFIX}${now}`
}

function activeStartValuationReservation(value: string | null, now: number): boolean {
  if (!value?.startsWith(START_VALUATION_RESERVED_PREFIX)) return false
  const reservedAt = Number(value.slice(START_VALUATION_RESERVED_PREFIX.length))
  return Number.isFinite(reservedAt) && now - reservedAt < START_VALUATION_RESERVATION_TTL_MS
}

export function urlWithoutStartValuationIntent(href: string): string {
  const url = new URL(href)
  if (url.searchParams.get('intent') === START_VALUATION_INTENT) {
    url.searchParams.delete('intent')
  }
  return `${url.pathname}${url.search}${url.hash}`
}

export interface UseManualStartValuationIntentParams {
  accountantCustomerId?: string | null
  buildSubmitData: () => ValuationFormData
  effectiveMethod?: string | null
  hasExistingValuation: boolean
  intent?: typeof START_VALUATION_INTENT
  isAccountantMode: boolean
  isCalculating: boolean
  isGenerating: boolean
  onStart: (data: ValuationFormData) => Promise<void>
  reportId: string
  restorationComplete: boolean
}

/** Consume Mercury's explicit CTA once, after delegated identity and prefill are ready. */
export function useManualStartValuationIntent({
  accountantCustomerId,
  buildSubmitData,
  effectiveMethod,
  hasExistingValuation,
  intent,
  isAccountantMode,
  isCalculating,
  isGenerating,
  onStart,
  reportId,
  restorationComplete,
}: UseManualStartValuationIntentParams): void {
  const consumedRef = useRef(false)

  useEffect(() => {
    if (intent !== START_VALUATION_INTENT || consumedRef.current) return
    if (!restorationComplete || !isAccountantMode || !accountantCustomerId) return
    if (isCalculating || isGenerating || !reportId) return

    const storageKey = startValuationIntentStorageKey(reportId)
    const stripIntentFromAddress = () => {
      window.history.replaceState(null, '', urlWithoutStartValuationIntent(window.location.href))
    }

    const storedIntentState = window.sessionStorage.getItem(storageKey)
    const completed = storedIntentState === START_VALUATION_COMPLETE
    const reserved = activeStartValuationReservation(storedIntentState, Date.now())
    if (hasExistingValuation || completed || reserved) {
      consumedRef.current = true
      stripIntentFromAddress()
      generalLogger.info('[start-valuation-intent] automatic start skipped', {
        reportId,
        reason: hasExistingValuation
          ? 'existing_valuation'
          : reserved
            ? 'start_in_progress'
            : 'already_consumed',
      })
      return
    }

    // A reservation can outlive an aborted navigation because the browser may
    // terminate the promise without running its rejection handler. Expire it
    // after a short lease so a fresh explicit CTA can recover safely.
    if (storedIntentState) window.sessionStorage.removeItem(storageKey)

    const submitData = buildSubmitData()
    if (getManualSubmitValidationIssue(submitData, effectiveMethod)) return

    consumedRef.current = true
    window.sessionStorage.setItem(storageKey, startValuationReservation(Date.now()))
    stripIntentFromAddress()
    generalLogger.info('[start-valuation-intent] automatic start reserved', {
      reportId,
      financialYearCount: Array.isArray(submitData.yearlyFinancials)
        ? submitData.yearlyFinancials.length
        : 0,
    })
    void onStart(submitData)
      .then(() => {
        window.sessionStorage.setItem(storageKey, START_VALUATION_COMPLETE)
        generalLogger.info('[start-valuation-intent] automatic start completed', { reportId })
      })
      .catch((error) => {
        window.sessionStorage.removeItem(storageKey)
        generalLogger.error('[start-valuation-intent] automatic start failed', {
          reportId,
          error: error instanceof Error ? error.message : String(error),
        })
      })
  }, [
    accountantCustomerId,
    buildSubmitData,
    effectiveMethod,
    hasExistingValuation,
    intent,
    isAccountantMode,
    isCalculating,
    isGenerating,
    onStart,
    reportId,
    restorationComplete,
  ])
}
