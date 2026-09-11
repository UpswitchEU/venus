import { useEffect, useRef } from 'react'
import type { ValuationFormData } from '../../../components/calculator'
import { generalLogger } from '../../../utils/logger'
import {
  getManualSubmitValidationIssue,
  type ManualSubmitValidationIssue,
} from '../utils/manualSubmitValidation'

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

function readStartValuationIntentState(storageKey: string): string | null {
  try {
    return window.sessionStorage.getItem(storageKey)
  } catch (error) {
    generalLogger.warn('[start-valuation-intent] session storage read unavailable', {
      storageKey,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

function writeStartValuationIntentState(storageKey: string, value: string): void {
  try {
    window.sessionStorage.setItem(storageKey, value)
  } catch (error) {
    generalLogger.warn('[start-valuation-intent] session storage write unavailable', {
      storageKey,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function removeStartValuationIntentState(storageKey: string): void {
  try {
    window.sessionStorage.removeItem(storageKey)
  } catch (error) {
    generalLogger.warn('[start-valuation-intent] session storage cleanup unavailable', {
      storageKey,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export function urlWithoutStartValuationIntent(href: string): string {
  const url = new URL(href)
  if (url.searchParams.get('intent') === START_VALUATION_INTENT) {
    url.searchParams.delete('intent')
  }
  return `${url.pathname}${url.search}${url.hash}`
}

export type StartValuationIntentSkipReason = 'form_invalid' | 'user_interacted'

export interface UseManualStartValuationIntentParams {
  accountantCustomerId?: string | null
  buildSubmitData: () => ValuationFormData
  effectiveMethod?: string | null
  hasExistingValuation: boolean
  /**
   * True once the advisor has edited the form on this page. A pending intent is
   * dropped at that point: the advisor is working, not waiting for us.
   */
  hasUserInteracted?: () => boolean
  /** Called once when a pending intent is dropped instead of started. */
  onAutomaticStartSkipped?: (
    reason: StartValuationIntentSkipReason,
    issue: ManualSubmitValidationIssue | null
  ) => void
  intent?: typeof START_VALUATION_INTENT
  isAccountantMode: boolean
  isCalculating: boolean
  isGenerating: boolean
  /** Resolve true only after calculation and durable v1 persistence succeed. */
  onStart: (data: ValuationFormData) => Promise<boolean>
  reportId: string
  restorationComplete: boolean
}

/**
 * Consume Mercury's explicit CTA once, after delegated identity and prefill are ready.
 *
 * One-shot means exactly that: on the first render where the delegated context
 * and prefill are ready, the intent either starts the calculation or is dropped.
 * It must never stay armed while the advisor edits — this effect re-runs on
 * every form change, so an armed intent would fire on the first edit that makes
 * the form valid, generating a report the advisor did not ask for.
 */
export function useManualStartValuationIntent({
  accountantCustomerId,
  buildSubmitData,
  effectiveMethod,
  hasExistingValuation,
  hasUserInteracted,
  intent,
  isAccountantMode,
  isCalculating,
  isGenerating,
  onAutomaticStartSkipped,
  onStart,
  reportId,
  restorationComplete,
}: UseManualStartValuationIntentParams): void {
  const consumedReportIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (intent !== START_VALUATION_INTENT || consumedReportIdRef.current === reportId) return
    if (!restorationComplete || !isAccountantMode || !accountantCustomerId) return
    if (isCalculating || isGenerating || !reportId) return

    const storageKey = startValuationIntentStorageKey(reportId)
    const stripIntentFromAddress = () => {
      window.history.replaceState(null, '', urlWithoutStartValuationIntent(window.location.href))
    }

    const storedIntentState = readStartValuationIntentState(storageKey)
    const completed = storedIntentState === START_VALUATION_COMPLETE
    const reserved = activeStartValuationReservation(storedIntentState, Date.now())
    if (hasExistingValuation || completed || reserved) {
      consumedReportIdRef.current = reportId
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
    if (storedIntentState) removeStartValuationIntentState(storageKey)

    const dropIntent = (
      reason: StartValuationIntentSkipReason,
      issue: ManualSubmitValidationIssue | null
    ) => {
      consumedReportIdRef.current = reportId
      stripIntentFromAddress()
      generalLogger.info('[start-valuation-intent] automatic start skipped', {
        reportId,
        reason,
        validationIssue: issue,
      })
      onAutomaticStartSkipped?.(reason, issue)
    }

    if (hasUserInteracted?.()) {
      dropIntent('user_interacted', null)
      return
    }

    const submitData = buildSubmitData()
    const validationIssue = getManualSubmitValidationIssue(submitData, effectiveMethod)
    if (validationIssue) {
      dropIntent('form_invalid', validationIssue)
      return
    }

    consumedReportIdRef.current = reportId
    writeStartValuationIntentState(storageKey, startValuationReservation(Date.now()))
    stripIntentFromAddress()
    generalLogger.info('[start-valuation-intent] automatic start reserved', {
      reportId,
      financialYearCount: Array.isArray(submitData.yearlyFinancials)
        ? submitData.yearlyFinancials.length
        : 0,
    })
    void onStart(submitData)
      .then((completed) => {
        if (!completed) {
          removeStartValuationIntentState(storageKey)
          generalLogger.warn('[start-valuation-intent] automatic start not completed', {
            reportId,
          })
          return
        }
        writeStartValuationIntentState(storageKey, START_VALUATION_COMPLETE)
        generalLogger.info('[start-valuation-intent] automatic start completed', { reportId })
      })
      .catch((error) => {
        removeStartValuationIntentState(storageKey)
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
    hasUserInteracted,
    intent,
    isAccountantMode,
    isCalculating,
    isGenerating,
    onAutomaticStartSkipped,
    onStart,
    reportId,
    restorationComplete,
  ])
}
