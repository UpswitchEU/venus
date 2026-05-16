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

/** Titan + VIQ sync paths can exceed 60s; align with Venus pdf/download maxDuration (120s). */
const PDF_DOWNLOAD_FETCH_MS = 130_000

async function blobStartsWithPdfMagic(blob: Blob): Promise<boolean> {
  if (blob.size < 8) return false
  const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer())
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46
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
  downloadPdf: (url?: string, filename?: string, signal?: AbortSignal) => Promise<void>
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
  const abortControllerRef = useRef<AbortController | null>(null)
  const hasCheckedSessionRef = useRef(false)
  const mountedRef = useIsMountedRef()
  const isGeneratingRef = useRef(false)

  // Get session data to check existing PDF
  const getSessionData = useSessionStore((s) => s.getSessionData)

  // Check for existing PDF on mount from session store
  useEffect(() => {
    if (hasCheckedSessionRef.current) return
    hasCheckedSessionRef.current = true

    const sessionData = getSessionData()
    if (sessionData?.pdfUrl) {
      setState({
        status: 'ready',
        url: sessionData.pdfUrl as string,
        error: null,
        progress: 100,
      })
    }
  }, [getSessionData])

  // Keep isGeneratingRef in sync with status
  isGeneratingRef.current = state.status === 'generating'

  // Cleanup on unmount — mount tracking is owned by useIsMountedRef above;
  // this effect handles the polling-interval + abort-controller teardown.
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
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
      // Clear any existing polling
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }

      let pollCount = 0
      const maxPolls = 150 // 5 minutes max (2s intervals)

      pollingRef.current = setInterval(async () => {
        pollCount++

        if (pollCount > maxPolls) {
          const timer = pollingRef.current
          if (timer) clearInterval(timer)
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

        try {
          const response = await fetch(`/api/valuations/pdf/status/${jobId}`, {
            credentials: 'include',
          })

          if (!response.ok) {
            if (response.status === 402) {
              const timer = pollingRef.current
              if (timer) clearInterval(timer)
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

          if (!mountedRef.current) return

          // Update progress
          const progress = Math.min(30 + pollCount, 90)
          setState((prev) => ({ ...prev, progress }))

          if (data.status === 'completed' && data.pdfUrl) {
            const timer = pollingRef.current
            if (timer) clearInterval(timer)
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
            if (timer) clearInterval(timer)
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
          // Don't fail on polling errors - keep trying
          generalLogger.warn('[PDF] Polling error', { error })
        }
      }, 2000)
    },
    [mountedRef.current]
  )

  /**
   * Trigger PDF generation via Titan API
   * ROBUST: Guards against double-invocation and race conditions
   */
  const generatePdf = useCallback(async (): Promise<string | null> => {
    if (!reportId) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: 'No report ID available',
      }))
      return null
    }

    // Guard: Prevent concurrent generation (double-click, rapid navigation)
    if (isGeneratingRef.current) {
      generalLogger.debug('[PDF] Generation already in progress, ignoring duplicate request')
      return null
    }
    isGeneratingRef.current = true

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

    try {
      const ctrl = abortControllerRef.current!
      const combinedSignal =
        typeof AbortSignal.any === 'function' && typeof AbortSignal.timeout === 'function'
          ? AbortSignal.any([ctrl.signal, AbortSignal.timeout(130_000)])
          : ctrl.signal

      const response = await fetch(`/api/valuations/${reportId}/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: combinedSignal,
      })

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}))
        if (response.status === 402) {
          isGeneratingRef.current = false
          const errMsg =
            (typeof errBody.message === 'string' && errBody.message) ||
            (typeof errBody.error === 'string' && errBody.error) ||
            'PDF download requires a plan that includes downloadable reports.'
          if (mountedRef.current) {
            setState({
              status: 'none',
              url: null,
              error: null,
              progress: 0,
            })
          }
          throw new APIError(errMsg, 402, undefined, true, { upgradeRequired: true as const })
        }
        const errMsg =
          errBody.message ?? errBody.error ?? errBody.detail ?? 'Failed to start PDF generation'
        throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg))
      }

      const data = await response.json()

      if (!mountedRef.current) {
        isGeneratingRef.current = false
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
        isGeneratingRef.current = false
        // Unmount abort leaves `mountedRef` false — skip churning UI state.
        if (mountedRef.current) {
          setState({
            status: 'error',
            url: null,
            error: 'PDF generation timed out — please try again.',
            progress: 0,
          })
        }
        return null
      }
      isGeneratingRef.current = false
      if (error instanceof APIError && error.statusCode === 402) {
        throw error
      }
      if (mountedRef.current) {
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
  }, [reportId, startPolling, mountedRef.current])

  /**
   * Download the PDF file via proxy (avoids CORS/403 when fetching Supabase storage directly)
   */
  const downloadPdf = useCallback(
    async (url?: string, filename?: string, signal?: AbortSignal) => {
      void url
      if (!reportId) {
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

      try {
        const timeoutSignal =
          typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(PDF_DOWNLOAD_FETCH_MS)
            : undefined
        const fetchSignal =
          signal && timeoutSignal && typeof AbortSignal.any === 'function'
            ? AbortSignal.any([signal, timeoutSignal])
            : (signal ?? timeoutSignal)

        // Use proxy to avoid CORS/403 when fetching Supabase storage from browser.
        // BFF runs Titan GET + optional POST generate + storage stream.
        const response = await fetch(
          `/api/valuations/${reportId}/pdf/download?_=${encodeURIComponent(String(Date.now()))}`,
          {
            credentials: 'include',
            signal: fetchSignal,
            cache: 'no-store',
          }
        )

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
            throw new APIError(errMsg, 402, undefined, true, {
              upgradeRequired: true as const,
            })
          }
          throw new Error(errMsg)
        }

        const blob = await response.blob()
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

        const blobUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = filename || `valuation-report-${reportId}-${Date.now()}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(blobUrl)
      } catch (error) {
        if (error instanceof APIError && error.statusCode === 402) {
          throw error
        }
        if (error instanceof Error && error.name === 'AbortError') {
          throw error
        }
        generalLogger.error('[PDF] Download error', { error })
        if (mountedRef.current) {
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : 'Download failed',
          }))
        }
        throw error
      }
    },
    [reportId, mountedRef.current]
  )

  return {
    state,
    generatePdf,
    downloadPdf,
    isReady: state.status === 'ready',
    isGenerating: state.status === 'generating',
  }
}
