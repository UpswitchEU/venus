import { useCallback, useRef, useState } from 'react'
import { useIsMountedRef, useLatestRef } from './useNavigationCancellation'
import { getNextPdfWaitExtensionMs, getPdfWaitDelayMs } from './usePdfStalenessLifecycleModel'

interface UsePdfStalenessLifecycleRuntimeParams {
  isPdfGenerating: boolean
  persistedReportLookupId: string | null
}

export function usePdfStalenessLifecycleRuntime({
  isPdfGenerating,
  persistedReportLookupId,
}: UsePdfStalenessLifecycleRuntimeParams) {
  const [pdfWaitTimedOut, setPdfWaitTimedOut] = useState(false)
  const [isPdfRetrying, setIsPdfRetrying] = useState(false)
  const [pdfPollErrorCount, setPdfPollErrorCount] = useState(0)
  const [pdfPollTransientCount, setPdfPollTransientCount] = useState(0)

  const pollInFlightRef = useRef(false)
  const bySessionBackoffUntilRef = useRef(0)
  const bySession404StreakRef = useRef(0)
  const unchangedStreakRef = useRef(0)
  const lastPolledPdfGeneratedAtMsRef = useRef<number | null>(null)
  const waitExtensionMsRef = useRef(0)
  const waitTimerIdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transientBackoffUntilRef = useRef(0)
  const transientErrorStreakRef = useRef(0)
  const isMountedRef = useIsMountedRef()
  const lookupIdRef = useLatestRef(persistedReportLookupId)
  const isPdfGeneratingRef = useRef(isPdfGenerating)
  isPdfGeneratingRef.current = isPdfGenerating

  const resetTransientBackoff = useCallback(() => {
    transientBackoffUntilRef.current = 0
    transientErrorStreakRef.current = 0
  }, [])

  const resetPollErrorCounts = useCallback(() => {
    setPdfPollErrorCount(0)
    setPdfPollTransientCount(0)
  }, [])

  const clearWaitTimer = useCallback(() => {
    if (waitTimerIdRef.current) {
      clearTimeout(waitTimerIdRef.current)
      waitTimerIdRef.current = null
    }
  }, [])

  const scheduleWaitTimeout = useCallback(() => {
    clearWaitTimer()
    const delayMs = getPdfWaitDelayMs(waitExtensionMsRef.current)
    waitTimerIdRef.current = setTimeout(() => {
      if (!isPdfGeneratingRef.current) setPdfWaitTimedOut(true)
    }, delayMs)
  }, [clearWaitTimer])

  const extendWaitTimeoutForTransientError = useCallback(() => {
    waitExtensionMsRef.current = getNextPdfWaitExtensionMs(waitExtensionMsRef.current)
    scheduleWaitTimeout()
  }, [scheduleWaitTimeout])

  const resetReportScopedPolling = useCallback(() => {
    bySessionBackoffUntilRef.current = 0
    bySession404StreakRef.current = 0
    unchangedStreakRef.current = 0
    lastPolledPdfGeneratedAtMsRef.current = null
    waitExtensionMsRef.current = 0
    resetTransientBackoff()
    pollInFlightRef.current = false
  }, [resetTransientBackoff])

  const resetFreshCycle = useCallback(() => {
    setPdfWaitTimedOut(false)
    clearWaitTimer()
    resetPollErrorCounts()
    resetReportScopedPolling()
  }, [clearWaitTimer, resetPollErrorCounts, resetReportScopedPolling])

  const resetStaleCycle = useCallback(
    (lastPdfGeneratedAtMs: number | null) => {
      setPdfWaitTimedOut(false)
      unchangedStreakRef.current = 0
      lastPolledPdfGeneratedAtMsRef.current = lastPdfGeneratedAtMs
      waitExtensionMsRef.current = 0
      resetTransientBackoff()
      scheduleWaitTimeout()
    },
    [resetTransientBackoff, scheduleWaitTimeout]
  )

  const resetPostGenerationSync = useCallback(() => {
    setPdfWaitTimedOut(false)
    clearWaitTimer()
    unchangedStreakRef.current = 0
    lastPolledPdfGeneratedAtMsRef.current = null
    waitExtensionMsRef.current = 0
    resetTransientBackoff()
    resetPollErrorCounts()
  }, [clearWaitTimer, resetPollErrorCounts, resetTransientBackoff])

  const startRetryCycle = useCallback(() => {
    setIsPdfRetrying(true)
    unchangedStreakRef.current = 0
    lastPolledPdfGeneratedAtMsRef.current = null
    waitExtensionMsRef.current = 0
    resetTransientBackoff()
    resetPollErrorCounts()
    setPdfWaitTimedOut(false)
    clearWaitTimer()
  }, [clearWaitTimer, resetPollErrorCounts, resetTransientBackoff])

  const resetSuccessfulPollBackoff = useCallback(() => {
    bySession404StreakRef.current = 0
    resetTransientBackoff()
    resetPollErrorCounts()
  }, [resetPollErrorCounts, resetTransientBackoff])

  const effectivePdfWaitTimedOut = pdfWaitTimedOut && !isPdfGenerating

  return {
    bySession404StreakRef,
    bySessionBackoffUntilRef,
    clearWaitTimer,
    effectivePdfWaitTimedOut,
    extendWaitTimeoutForTransientError,
    isMountedRef,
    isPdfGeneratingRef,
    isPdfRetrying,
    lastPolledPdfGeneratedAtMsRef,
    lookupIdRef,
    pdfPollErrorCount,
    pdfPollTransientCount,
    pdfWaitTimedOut,
    pollInFlightRef,
    resetFreshCycle,
    resetPostGenerationSync,
    resetReportScopedPolling,
    resetStaleCycle,
    resetSuccessfulPollBackoff,
    scheduleWaitTimeout,
    setIsPdfRetrying,
    setPdfPollErrorCount,
    setPdfPollTransientCount,
    setPdfWaitTimedOut,
    startRetryCycle,
    transientBackoffUntilRef,
    transientErrorStreakRef,
    unchangedStreakRef,
  }
}
