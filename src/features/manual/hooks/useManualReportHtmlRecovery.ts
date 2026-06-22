import { useEffect, useRef, useState } from 'react'
import { useSessionStore } from '../../../store/useSessionStore'
import type { ValuationResponse, ValuationSession } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { isReportDeleteInProgress } from '../utils/manualReportDeleteGuard'
import {
  needsManualReportHtmlRecovery,
  recoverManualReportHtmlIfNeeded,
} from '../utils/manualReportHtmlRecoveryUtil'
import { useLatestRef } from './useNavigationCancellation'

export interface UseManualReportHtmlRecoveryParams {
  reportId: string
  session: ValuationSession | null | undefined
  result: ValuationResponse | null | undefined
  standaloneHtmlReport?: string | null
  restorationComplete: boolean
  isCalculating: boolean
  isGenerating: boolean
}

const HOOK_RECOVERY_MAX_PASSES = 4
const HOOK_RECOVERY_RETRY_MS = [0, 5_000, 15_000, 45_000] as const

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
  standaloneHtmlReport,
  restorationComplete,
  isCalculating,
  isGenerating,
}: UseManualReportHtmlRecoveryParams): UseManualReportHtmlRecoveryResult {
  const [isRecoveringReportHtml, setIsRecoveringReportHtml] = useState(false)
  const passRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlightRef = useRef(false)
  const sessionRef = useLatestRef(session)
  const resultRef = useLatestRef(result)
  const standaloneHtmlReportRef = useLatestRef(standaloneHtmlReport)
  const needsRecovery = needsManualReportHtmlRecovery({
    reportId,
    session,
    result,
    standaloneHtmlReport,
  })

  useEffect(() => {
    if (isCalculating || isGenerating) {
      passRef.current = 0
      if (useSessionStore.getState().renderError === 'html_recovery_failed') {
        useSessionStore.getState().setRenderError(null)
      }
    }
  }, [isCalculating, isGenerating])

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const stillNeedsRecovery = () =>
      needsManualReportHtmlRecovery({
        reportId,
        session: sessionRef.current,
        result: resultRef.current,
        standaloneHtmlReport: standaloneHtmlReportRef.current,
      })

    if (
      !restorationComplete ||
      isCalculating ||
      isGenerating ||
      isReportDeleteInProgress(reportId) ||
      isReportDeleteInProgress(sessionRef.current?.reportId)
    ) {
      clearTimer()
      inFlightRef.current = false
      setIsRecoveringReportHtml(false)
      return
    }

    if (!needsRecovery) {
      passRef.current = 0
      clearTimer()
      inFlightRef.current = false
      setIsRecoveringReportHtml(false)
      return
    }

    if (inFlightRef.current) return

    let cancelled = false
    setIsRecoveringReportHtml(true)

    const schedulePass = (pass: number) => {
      if (cancelled || pass >= HOOK_RECOVERY_MAX_PASSES) return

      const delay =
        HOOK_RECOVERY_RETRY_MS[pass] ??
        HOOK_RECOVERY_RETRY_MS[HOOK_RECOVERY_RETRY_MS.length - 1] ??
        0
      clearTimer()
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        void runPass(pass)
      }, delay)
    }

    const runPass = async (pass: number) => {
      if (cancelled || pass >= HOOK_RECOVERY_MAX_PASSES) return

      inFlightRef.current = true
      try {
        const recovery = await recoverManualReportHtmlIfNeeded({
          reportId,
          session: sessionRef.current,
          result: resultRef.current,
          standaloneHtmlReport: standaloneHtmlReportRef.current,
        })
        if (cancelled) return

        if (recovery.status === 'recovered' && recovery.result) {
          passRef.current = 0
          setIsRecoveringReportHtml(false)
          generalLogger.info('[ManualValuationWorkspace] Report HTML recovered via ensure-html', {
            reportId,
            htmlLength: recovery.html?.length ?? 0,
            pass,
          })
          return
        }

        if (recovery.status === 'failed') {
          const nextPass = pass + 1
          passRef.current = nextPass
          generalLogger.warn(
            '[ManualValuationWorkspace] Report HTML ensure-html recovery did not return renderable HTML',
            { reportId, pass, nextPass }
          )
          if (nextPass >= HOOK_RECOVERY_MAX_PASSES && stillNeedsRecovery()) {
            useSessionStore.getState().setRenderError('html_recovery_failed')
            setIsRecoveringReportHtml(false)
            return
          }
          schedulePass(nextPass)
        }
      } finally {
        inFlightRef.current = false
      }
    }

    schedulePass(passRef.current)

    return () => {
      cancelled = true
      clearTimer()
      inFlightRef.current = false
      setIsRecoveringReportHtml(false)
    }
  }, [
    reportId,
    needsRecovery,
    restorationComplete,
    isCalculating,
    isGenerating,
    sessionRef,
    resultRef,
    standaloneHtmlReportRef,
  ])

  return { isRecoveringReportHtml }
}
