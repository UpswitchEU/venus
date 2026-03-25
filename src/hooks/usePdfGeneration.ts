/**
 * PDF Generation Hook
 *
 * WORLD-CLASS: Integrates with Titan API for server-side PDF generation.
 * Handles async PDF generation with status polling and WebSocket notifications.
 *
 * @module hooks/usePdfGeneration
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSessionStore } from '../store/useSessionStore'
import { generalLogger } from '../utils/logger'

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
  /** Download existing PDF with optional custom filename */
  downloadPdf: (url?: string, filename?: string) => Promise<void>
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
  const mountedRef = useRef(true)
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

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
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
  const startPolling = useCallback((jobId: string) => {
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
  }, [])

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
      const response = await fetch(`/api/valuations/${reportId}/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}))
        const errMsg =
          errBody.message ?? errBody.error ?? errBody.detail ?? 'Failed to start PDF generation'
        throw new Error(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg))
      }

      const data = await response.json()

      if (!mountedRef.current) {
        isGeneratingRef.current = false
        return null
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
      isGeneratingRef.current = false
      if ((error as Error).name === 'AbortError') {
        return null
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
  }, [reportId, startPolling])

  /**
   * Download the PDF file via proxy (avoids CORS/403 when fetching Supabase storage directly)
   */
  const downloadPdf = useCallback(
    async (url?: string, filename?: string) => {
      if (!reportId) {
        if (!isGeneratingRef.current) {
          await generatePdf()
        }
        return
      }

      try {
        // Use proxy to avoid CORS/403 when fetching Supabase storage from browser
        const response = await fetch(`/api/valuations/${reportId}/pdf/download`, {
          credentials: 'include',
        })

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}))
          throw new Error(errBody.error || 'Failed to download PDF')
        }

        const blob = await response.blob()

        const blobUrl = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = filename || `valuation-report-${reportId}.pdf`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(blobUrl)
      } catch (error) {
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
    [reportId, generatePdf]
  )

  return {
    state,
    generatePdf,
    downloadPdf,
    isReady: state.status === 'ready',
    isGenerating: state.status === 'generating',
  }
}
