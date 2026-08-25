import { useEffect, useRef } from 'react'
import type { ValuationFormData } from '../../../components/calculator'
import { generalLogger } from '../../../utils/logger'
import { getManualSubmitValidationIssue } from '../utils/manualSubmitValidation'

export const START_VALUATION_INTENT = 'start_valuation' as const

export function startValuationIntentStorageKey(reportId: string): string {
  return `venus:start-valuation-intent:v1:${reportId}`
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

    if (hasExistingValuation || window.sessionStorage.getItem(storageKey)) {
      consumedRef.current = true
      stripIntentFromAddress()
      return
    }

    const submitData = buildSubmitData()
    if (getManualSubmitValidationIssue(submitData, effectiveMethod)) return

    consumedRef.current = true
    window.sessionStorage.setItem(storageKey, 'reserved')
    stripIntentFromAddress()
    void onStart(submitData)
      .then(() => window.sessionStorage.setItem(storageKey, 'complete'))
      .catch((error) => {
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
