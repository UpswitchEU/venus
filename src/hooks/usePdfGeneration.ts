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
  /** Trigger PDF generation */
  generatePdf: () => Promise<void>
  /** Download existing PDF */
  downloadPdf: () => Promise<void>
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

  // Cleanup on unmount
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
   * WORLD-CLASS: Poll for PDF status without jobId (for bootstrap 'generating' state)
   */
  const startStatusPolling = useCallback(() => {
    if (!reportId) return

    // Clear any existing polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
    }

    let pollCount = 0
    const maxPolls = 60 // 5 minutes max (5s intervals)

    pollingRef.current = setInterval(async () => {
      pollCount++

      if (pollCount > maxPolls) {
        clearInterval(pollingRef.current!)
        setState({
          status: 'error',
          url: null,
          error: 'PDF generation timed out',
          progress: 0,
        })
        return
      }

      try {
        // Check PDF status via GET endpoint
        const response = await fetch(`/api/valuations/${reportId}/pdf`, {
          method: 'GET',
          credentials: 'include',
        })

        if (!response.ok) {
          if (response.status === 404) {
            // PDF not ready yet, continue polling
            setState((prev) => ({
              ...prev,
              progress: Math.min(20 + pollCount * 2, 90),
            }))
            return
          }
          throw new Error('Failed to check PDF status')
        }

        const data = await response.json()

        if (data.status === 'ready' && data.pdfUrl) {
          clearInterval(pollingRef.current!)
          setState({
            status: 'ready',
            url: data.pdfUrl,
            error: null,
            progress: 100,
          })
          generalLogger.info('[PDF] PDF ready after polling', {
            reportId: reportId.substring(0, 20),
            pollCount,
          })
        } else if (data.status === 'none') {
          // PDF generation completed but no URL - may have failed silently
          clearInterval(pollingRef.current!)
          setState({
            status: 'none',
            url: null,
            error: null,
            progress: 0,
          })
        } else {
          // Still generating, update progress
          setState((prev) => ({
            ...prev,
            progress: Math.min(20 + pollCount * 2, 90),
          }))
        }
      } catch (error) {
        // Don't fail on polling errors - keep trying
        generalLogger.warn('[PDF] Polling error', { error })
      }
    }, 5000)
  }, [reportId])

  /**
   * Trigger PDF generation via Titan API
   */
  const generatePdf = useCallback(async () => {
    if (!reportId) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: 'No report ID available',
      }))
      return
    }

    // Abort any existing request
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
      // Call Titan API to generate PDF
      // Route: POST /api/valuations/:id/pdf (proxies to Titan)
      const response = await fetch(`/api/valuations/${reportId}/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || 'Failed to start PDF generation')
      }

      const data = await response.json()

      // Check if PDF was generated synchronously
      if (data.pdfUrl) {
        setState({
          status: 'ready',
          url: data.pdfUrl,
          error: null,
          progress: 100,
        })
        return
      }

      // Async generation - start polling
      if (data.jobId) {
        setState((prev) => ({ ...prev, progress: 30 }))
        startPolling(data.jobId)
      } else {
        setState({
          status: 'error',
          url: null,
          error: 'No PDF URL or job ID returned — please try again',
          progress: 0,
        })
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return // Cancelled
      }
      setState({
        status: 'error',
        url: null,
        error: error instanceof Error ? error.message : 'PDF generation failed',
        progress: 0,
      })
    }
  }, [reportId])

  /**
   * Poll for PDF generation status
   */
  const startPolling = useCallback((jobId: string) => {
    // Clear any existing polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
    }

    let pollCount = 0
    const maxPolls = 60 // 5 minutes max (5s intervals)

    pollingRef.current = setInterval(async () => {
      pollCount++

      if (pollCount > maxPolls) {
        clearInterval(pollingRef.current!)
        setState({
          status: 'error',
          url: null,
          error: 'PDF generation timed out',
          progress: 0,
        })
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

        // Update progress
        const progress = Math.min(30 + pollCount * 2, 90)
        setState((prev) => ({ ...prev, progress }))

        if (data.status === 'completed' && data.pdfUrl) {
          clearInterval(pollingRef.current!)
          setState({
            status: 'ready',
            url: data.pdfUrl,
            error: null,
            progress: 100,
          })
        } else if (data.status === 'failed') {
          clearInterval(pollingRef.current!)
          setState({
            status: 'error',
            url: null,
            error: data.error || 'PDF generation failed',
            progress: 0,
          })
        }
      } catch (error) {
        // Don't fail on polling errors - keep trying
        generalLogger.warn('[PDF] Polling error', { error })
      }
    }, 5000)
  }, [])

  /**
   * Download the PDF file
   */
  const downloadPdf = useCallback(async () => {
    if (!state.url) {
      // If no URL, try to generate first
      if (state.status !== 'generating') {
        await generatePdf()
      }
      return
    }

    try {
      // Fetch the PDF
      const response = await fetch(state.url, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to download PDF')
      }

      const blob = await response.blob()

      // Create download link
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `valuation-report-${reportId || 'unknown'}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      generalLogger.error('[PDF] Download error', { error })
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Download failed',
      }))
    }
  }, [state.url, state.status, reportId, generatePdf])

  return {
    state,
    generatePdf,
    downloadPdf,
    isReady: state.status === 'ready',
    isGenerating: state.status === 'generating',
  }
}
