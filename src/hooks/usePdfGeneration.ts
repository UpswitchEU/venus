/**
 * PDF Generation Hook
 *
 * WORLD-CLASS: Integrates with Titan API for server-side PDF generation.
 * Handles async PDF generation with status polling and WebSocket notifications.
 *
 * @module hooks/usePdfGeneration
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useIsMountedRef } from '../features/manual/hooks/useNavigationCancellation'
import { useSessionStore } from '../store/useSessionStore'
import { APIError } from '../types/errors'
import { generalLogger } from '../utils/logger'

/** Let the BFF return its structured 504 before the browser gives up. */
const PDF_DOWNLOAD_FETCH_MS = 125_000
const PDF_STATUS_FETCH_MS = 10_000
const PDF_STATUS_POLL_INTERVAL_MS = 2_000
const PDF_STATUS_MAX_POLL_MS = 5 * 60_000

type TimeoutAbortHandle = {
  signal: AbortSignal
  abort: () => void
  cleanup: () => void
  didTimeout: () => boolean
}

function createTimeoutAbortHandle(
  timeoutMs: number,
  incomingSignal?: AbortSignal
): TimeoutAbortHandle {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abortFromIncomingSignal = () => controller.abort(incomingSignal?.reason)

  if (incomingSignal) {
    if (incomingSignal.aborted) {
      abortFromIncomingSignal()
    } else {
      incomingSignal.addEventListener('abort', abortFromIncomingSignal, { once: true })
    }
  }

  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    cleanup: () => {
      clearTimeout(timeoutId)
      incomingSignal?.removeEventListener('abort', abortFromIncomingSignal)
    },
    didTimeout: () => timedOut,
  }
}

async function blobStartsWithPdfMagic(blob: Blob): Promise<boolean> {
  if (blob.size < 8) return false
  const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer())
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46
}

type PdfAccessErrorBody = {
  action?: unknown
  code?: unknown
  inviteAdvisorRequired?: unknown
  required_tier?: unknown
  upgradeRequired?: unknown
}

function buildPdfAccessErrorContext(errBody: PdfAccessErrorBody): Record<string, unknown> {
  const code = typeof errBody.code === 'string' ? errBody.code : undefined
  const inviteAdvisorRequired =
    errBody.inviteAdvisorRequired === true || code === 'INVITE_ADVISOR_REQUIRED'
  return {
    upgradeRequired: inviteAdvisorRequired ? false : true,
    inviteAdvisorRequired,
    ...(code ? { code } : {}),
    ...(typeof errBody.action === 'string' ? { action: errBody.action } : {}),
    ...(typeof errBody.required_tier === 'string' ? { required_tier: errBody.required_tier } : {}),
  }
}

export type PdfStatus = 'none' | 'generating' | 'ready' | 'error'

export interface PdfGenerationState {
  status: PdfStatus
  url: string | null
  error: string | null
  progress: number
}

export interface UsePdfGenerationReturn {
  /** Current PDF generation state */
  state: PdfGenerationState
  /** Trigger PDF generation — returns the PDF URL if available synchronously */
  generatePdf: () => Promise<string | null>
  /** Download existing PDF with optional custom filename and abort signal */
  downloadPdf: (
    url?: string,
    filename?: string,
    signal?: AbortSignal,
    reportIdOverride?: string | null
  ) => Promise<void>
  /** Check if PDF is ready */
  isReady: boolean
  /** Check if generating */
  isGenerating: boolean
}

/**
 * Hook for PDF generation with server-side Puppeteer rendering
 *
 * WORLD-CLASS Features:
 * - Triggers Titan API PDF generation
 * - Polls for completion status
 * - Provides real-time progress
 * - Handles download when ready
 * - Checks session store for existing PDF URL on mount
 */
export function usePdfGeneration(reportId: string | null): UsePdfGenerationReturn {
  const [state, setState] = useState<PdfGenerationState>({
    status: 'none',
    url: null,
    error: null,
    progress: 0,
  })

  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const pollInFlightRef = useRef(false)
  const statusPollAbortRef = useRef<TimeoutAbortHandle | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const mountedRef = useIsMountedRef()
  const isGeneratingRef = useRef(false)
  const activeReportIdRef = useRef<string | null>(reportId)
  const generationRunIdRef = useRef(0)
  const pollRunIdRef = useRef(0)
  const downloadRunIdRef = useRef(0)
  activeReportIdRef.current = reportId

  // Get session data to check existing PDF
  const getSessionData = useSessionStore((s) => s.getSessionData)

  // Reset report-scoped state when the active report changes. This prevents
  // late completions for report A from marking report B as ready/error.
  useEffect(() => {
    generationRunIdRef.current++
    pollRunIdRef.current++
    downloadRunIdRef.current++
    isGeneratingRef.current = false
    pollInFlightRef.current = false

    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    if (statusPollAbortRef.current) {
      statusPollAbortRef.current.abort()
      statusPollAbortRef.current = null
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    const sessionData = getSessionData()
    if (reportId && sessionData?.pdfUrl) {
      setState({
        status: 'ready',
        url: sessionData.pdfUrl as string,
        error: null,
        progress: 100,
      })
      return
    }
    setState({
      status: 'none',
      url: null,
      error: null,
      progress: 0,
    })
  }, [getSessionData, reportId])

  // Keep isGeneratingRef in sync with status
  isGeneratingRef.current = state.status === 'generating'

  // Cleanup on unmount — mount tracking is owned by useIsMountedRef above;
  // this effect handles the polling-interval + abort-controller teardown.
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
      if (statusPollAbortRef.current) {
        statusPollAbortRef.current.abort()
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  /**
   * Poll for PDF generation status
   */
  const startPolling = useCallback(
    (jobId: string) => {
      const pollRunId = ++pollRunIdRef.current
      // Clear any existing polling
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
      if (statusPollAbortRef.current) {
        statusPollAbortRef.current.abort()
        statusPollAbortRef.current = null
      }
      pollInFlightRef.current = false

      let pollCount = 0
      const startedAt = Date.now()

      pollingRef.current = setInterval(async () => {
        if (pollRunIdRef.current !== pollRunId) return
        if (pollInFlightRef.current) return
        pollCount++

        if (Date.now() - startedAt > PDF_STATUS_MAX_POLL_MS) {
          const timer = pollingRef.current
          if (timer) {
            clearInterval(timer)
            pollingRef.current = null
          }
          isGeneratingRef.current = false
          if (mountedRef.current) {
            setState({
              status: 'error',
              url: null,
              error: 'PDF generation timed out',
              progress: 0,
            })
          }
          return
        }

        pollInFlightRef.current = true
        const statusAbortHandle = createTimeoutAbortHandle(PDF_STATUS_FETCH_MS)
        statusPollAbortRef.current = statusAbortHandle

        try {
          const response = await fetch(`/api/valuations/pdf/status/${encodeURIComponent(jobId)}`, {
            credentials: 'include',
            signal: statusAbortHandle.signal,
          })
          if (pollRunIdRef.current !== pollRunId) return

          if (!response.ok) {
            if (response.status === 402) {
              const timer = pollingRef.current
              if (timer) {
                clearInterval(timer)
                pollingRef.current = null
              }
              isGeneratingRef.current = false
              if (mountedRef.current) {
                setState({
                  status: 'none',
                  url: null,
                  error: null,
                  progress: 0,
                })
              }
              return
            }
            throw new Error('Failed to check status')
          }

          const data = await response.json()
          if (pollRunIdRef.current !== pollRunId) return

          if (!mountedRef.current) return

          // Update progress
          const progress = Math.min(30 + pollCount, 90)
          setState((prev) => ({ ...prev, progress }))

          if (data.status === 'completed' && data.pdfUrl) {
            const timer = pollingRef.current
            if (timer) {
              clearInterval(timer)
              pollingRef.current = null
            }
            isGeneratingRef.current = false
            if (mountedRef.current) {
              setState({
                status: 'ready',
                url: data.pdfUrl,
                error: null,
                progress: 100,
              })
            }
          } else if (data.status === 'failed') {
            const timer = pollingRef.current
            if (timer) {
              clearInterval(timer)
              pollingRef.current = null
            }
            isGeneratingRef.current = false
            if (mountedRef.current) {
              setState({
                status: 'error',
                url: null,
                error: data.error || 'PDF generation failed',
                progress: 0,
              })
            }
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            if (statusAbortHandle.didTimeout()) {
              generalLogger.warn('[PDF] Polling status request timed out', { jobId, pollCount })
            }
            return
          }
          // Don't fail on polling errors - keep trying
          generalLogger.warn('[PDF] Polling error', { error })
        } finally {
          statusAbortHandle.cleanup()
          if (statusPollAbortRef.current === statusAbortHandle) {
            statusPollAbortRef.current = null
          }
          if (pollRunIdRef.current === pollRunId) {
            pollInFlightRef.current = false
          }
        }
      }, PDF_STATUS_POLL_INTERVAL_MS)
    },
    [mountedRef]
  )

  /**
   * Trigger PDF generation via Titan API
   * ROBUST: Guards against double-invocation and race conditions
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: mountedRef.current is read lazily, not reactive
  const generatePdf = useCallback(async (): Promise<string | null> => {
    if (!reportId) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: 'No report ID available',
      }))
      return null
    }
    const targetReportId = reportId

    // Guard: Prevent concurrent generation (double-click, rapid navigation)
    if (isGeneratingRef.current) {
      generalLogger.debug('[PDF] Generation already in progress, ignoring duplicate request')
      return null
    }
    isGeneratingRef.current = true
    const generationRunId = ++generationRunIdRef.current
    const isCurrentGeneration = () =>
      mountedRef.current &&
      generationRunIdRef.current === generationRunId &&
      activeReportIdRef.current === targetReportId

    // Abort any existing request before starting new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    setState({
      status: 'generating',
      url: null,
      error: null,
      progress: 10,
    })

    let generationTimedOut = false
    try {
      const ctrl = abortControllerRef.current
      if (!ctrl) throw new Error('PDF generation was not initialized')
      const generationAbortHandle = createTimeoutAbortHandle(PDF_DOWNLOAD_FETCH_MS, ctrl.signal)
      let response: Response
      try {
        response = await fetch(`/api/valuations/${encodeURIComponent(targetReportId)}/pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          signal: generationAbortHandle.signal,
        })
      } finally {
        generationTimedOut = generationAbortHandle.didTimeout()
        generationAbortHandle.cleanup()
      }

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}))
        if (response.status === 402) {
          const errMsg =
            (typeof errBody.message === 'string' && errBody.message) ||
            (typeof errBody.error === 'string' && errBody.error) ||
            'PDF download requires a plan that includes downloadable reports.'
          if (isCurrentGeneration()) {
            isGeneratingRef.current = false
            setState({
              status: 'none',
              url: null,
              error: null,
              progress: 0,
            })
          }
          throw new APIError(errMsg, 402, undefined, true, buildPdfAccessErrorContext(errBody))
        }
        const errMsg =
          errBody.message ?? errBody.error ?? errBody.detail ?? 'Failed to start PDF generation'
        throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg))
      }

      const data = await response.json()

      if (!isCurrentGeneration()) {
        return null
      }

      // BFF forwards Titan body; tolerate `{ success: true, ... }` without pdfUrl/jobId.
      if (data && typeof data === 'object' && data.success === false) {
        const errMsg =
          (typeof data.error === 'string' && data.error) ||
          (typeof data.message === 'string' && data.message) ||
          'PDF generation failed'
        throw new Error(errMsg)
      }

      if (data.pdfUrl) {
        isGeneratingRef.current = false
        setState({
          status: 'ready',
          url: data.pdfUrl,
          error: null,
          progress: 100,
        })
        return data.pdfUrl
      }

      if (data.jobId) {
        setState((prev) => ({ ...prev, progress: 30 }))
        startPolling(data.jobId)
        return null
      }

      isGeneratingRef.current = false
      setState({
        status: 'error',
        url: null,
        error: 'No PDF URL or job ID returned — please try again',
        progress: 0,
      })
      return null
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // Unmount abort leaves `mountedRef` false — skip churning UI state.
        if (isCurrentGeneration()) {
          isGeneratingRef.current = false
          setState({
            status: 'error',
            url: null,
            error: generationTimedOut
              ? 'PDF generation timed out — please try again.'
              : 'PDF generation was cancelled.',
            progress: 0,
          })
        }
        return null
      }
      if (error instanceof APIError && error.statusCode === 402) {
        throw error
      }
      if (isCurrentGeneration()) {
        isGeneratingRef.current = false
        const message = error instanceof Error ? error.message : 'PDF generation failed'
        setState({
          status: 'error',
          url: null,
          error: message,
          progress: 0,
        })
      }
      return null
    }
    // `mountedRef.current` is intentionally NOT a dep: refs don't notify React
    // on change, and listing `.current` makes the memo unstable in subtle ways
    // (the value flips false during unmount, causing late re-creations).
  }, [reportId, startPolling])

  /**
   * Download the PDF file via proxy (avoids CORS/403 when fetching Supabase storage directly)
   */
  const downloadPdf = useCallback(
    async (
      url?: string,
      filename?: string,
      signal?: AbortSignal,
      reportIdOverride?: string | null
    ) => {
      void url
      const targetReportId = reportIdOverride || reportId
      if (!targetReportId) {
        const msg = 'Cannot download PDF until the valuation report is saved (no report ID).'
        generalLogger.warn('[PDF] downloadPdf without reportId')
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            error: msg,
          }))
        }
        throw new Error(msg)
      }
      const downloadRunId = ++downloadRunIdRef.current
      const isCurrentDownload = () => {
        const activeReportId = activeReportIdRef.current
        return (
          mountedRef.current &&
          downloadRunIdRef.current === downloadRunId &&
          (activeReportId == null || activeReportId === targetReportId)
        )
      }

      let downloadTimedOut = false
      try {
        // Use proxy to avoid CORS/403 when fetching Supabase storage from browser.
        // BFF runs Titan GET + optional POST generate + storage stream.
        const downloadAbortHandle = createTimeoutAbortHandle(PDF_DOWNLOAD_FETCH_MS, signal)
        let response: Response
        try {
          response = await fetch(
            `/api/valuations/${encodeURIComponent(targetReportId)}/pdf/download?_=${encodeURIComponent(String(Date.now()))}`,
            {
              credentials: 'include',
              signal: downloadAbortHandle.signal,
              cache: 'no-store',
            }
          )
        } finally {
          downloadTimedOut = downloadAbortHandle.didTimeout()
          downloadAbortHandle.cleanup()
        }
        if (!isCurrentDownload()) return

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}))
          const errMsg =
            (typeof errBody.error === 'string' && errBody.error) ||
            (typeof errBody.message === 'string' && errBody.message) ||
            'Failed to download PDF'
          if (response.status === 402) {
            if (mountedRef.current) {
              setState({
                status: 'none',
                url: null,
                error: null,
                progress: 0,
              })
            }
            throw new APIError(errMsg, 402, undefined, true, buildPdfAccessErrorContext(errBody))
          }
          throw new Error(errMsg)
        }

        const blob = await response.blob()
        if (!isCurrentDownload()) return
        if (!(await blobStartsWithPdfMagic(blob))) {
          const snippet = (await blob.slice(0, 240).text()).trim()
          let parsed: { error?: string; message?: string } | null = null
          try {
            parsed = JSON.parse(snippet) as { error?: string; message?: string }
          } catch {
            /* not JSON — probably HTML error page */
          }
          const hint =
            (parsed && (parsed.error || parsed.message)) ||
            (snippet.startsWith('<!')
              ? 'Server returned HTML instead of a PDF.'
              : snippet.slice(0, 120))
          throw new Error(hint || 'Download did not return a valid PDF file.')
        }
        if (!isCurrentDownload()) return

        const blobUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = filename || `valuation-report-${targetReportId}-${Date.now()}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(blobUrl)
      } catch (error) {
        if (error instanceof APIError && error.statusCode === 402) {
          throw error
        }
        if (error instanceof Error && error.name === 'AbortError') {
          if (downloadTimedOut && isCurrentDownload()) {
            setState((prev) => ({
              ...prev,
              error: 'PDF download timed out — please try again.',
            }))
          }
          throw error
        }
        generalLogger.error('[PDF] Download error', { error })
        if (isCurrentDownload()) {
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : 'Download failed',
          }))
        }
        throw error
      }
    },
    [reportId, mountedRef]
  )

  return {
    state,
    generatePdf,
    downloadPdf,
    isReady: state.status === 'ready',
    isGenerating: state.status === 'generating',
  }
}
