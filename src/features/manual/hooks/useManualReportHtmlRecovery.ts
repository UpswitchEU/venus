import { useEffect, useRef, useState } from 'react'
import type { ValuationResponse, ValuationSession } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { isReportDeleteInProgress } from '../utils/manualReportDeleteGuard'
import {
  needsManualReportHtmlRecovery,
  recoverManualReportHtmlIfNeeded,
} from '../utils/manualReportHtmlRecoveryUtil'

export interface UseManualReportHtmlRecoveryParams {
  reportId: string
  session: ValuationSession | null | undefined
  result: ValuationResponse | null | undefined
  restorationComplete: boolean
  isCalculating: boolean
  isGenerating: boolean
  setResult: (result: ValuationResponse | null) => void
}

/**
 * When ValuationIQ returned safety-net HTML (or no HTML), trigger Titan ensure-html
 * so the right panel can show a full report after calculate or on session load.
 */
export interface UseManualReportHtmlRecoveryResult {
  isRecoveringReportHtml: boolean
}

export function useManualReportHtmlRecovery({
  reportId,
  session,
  result,
  restorationComplete,
  isCalculating,
  isGenerating,
  setResult,
}: UseManualReportHtmlRecoveryParams): UseManualReportHtmlRecoveryResult {
  const [isRecoveringReportHtml, setIsRecoveringReportHtml] = useState(false)
  const lastAttemptKeyRef = useRef<string | null>(null)
  const lastFailureKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (isCalculating || isGenerating) {
      lastAttemptKeyRef.current = null
      lastFailureKeyRef.current = null
    }
  }, [isCalculating, isGenerating])

  useEffect(() => {
    if (
      !restorationComplete ||
      isCalculating ||
      isGenerating ||
      isReportDeleteInProgress(reportId) ||
      isReportDeleteInProgress(session?.reportId)
    ) {
      return
    }

    if (!needsManualReportHtmlRecovery({ reportId, session, result })) {
      lastAttemptKeyRef.current = null
      lastFailureKeyRef.current = null
      return
    }

    const attemptKey = `${reportId}|${result?.valuation_id ?? ''}|${result?.render_fingerprint ?? ''}|${session?.reportId ?? ''}`
    if (lastAttemptKeyRef.current === attemptKey) return

    if (lastFailureKeyRef.current === attemptKey) return

    let cancelled = false
    let completed = false

    setIsRecoveringReportHtml(true)
    void (async () => {
      try {
        const recovery = await recoverManualReportHtmlIfNeeded({ reportId, session, result })
        if (cancelled) return
        completed = true
        lastAttemptKeyRef.current = attemptKey

        if (recovery.status === 'recovered' && recovery.result) {
          lastFailureKeyRef.current = null
          setResult(recovery.result)
          generalLogger.info('[ManualLayout] Report HTML recovered via ensure-html', {
            reportId,
            htmlLength: recovery.html?.length ?? 0,
          })
          return
        }

        if (recovery.status === 'failed') {
          lastFailureKeyRef.current = attemptKey
          generalLogger.warn(
            '[ManualLayout] Report HTML ensure-html recovery did not return renderable HTML',
            { reportId }
          )
        }
      } finally {
        if (!cancelled) setIsRecoveringReportHtml(false)
      }
    })()

    return () => {
      cancelled = true
      setIsRecoveringReportHtml(false)
      // Strict-mode remount: allow the second effect run to retry ensure-html.
      if (!completed && lastAttemptKeyRef.current === attemptKey) {
        lastAttemptKeyRef.current = null
      }
    }
  }, [
    reportId,
    session,
    result,
    restorationComplete,
    isCalculating,
    isGenerating,
    setResult,
  ])

  return { isRecoveringReportHtml }
}
