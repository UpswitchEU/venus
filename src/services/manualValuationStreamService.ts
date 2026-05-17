/**
 * Manual Valuation Stream Service
 * Handles SSE streaming for manual valuation calculations
 */

import type { ValuationRequest } from '../types/valuation'
import { apiLogger } from '../utils/logger'
import { getRenderableReportHtml, isSafetyNetReportHtml } from '../utils/safetyNetReportHtml'

interface StreamEvent {
  type: 'progress' | 'section_loading' | 'report_section' | 'report_complete' | 'error'
  progress?: number
  status?: string
  message?: string
  section?: string
  phase?: number
  html?: string
  html_report?: string
  request_id?: string
  valuation_id?: string
  error?: string
  error_type?: string
  duration_seconds?: number
  warning?: string
}

interface StreamCallbacks {
  onProgress?: (progress: number, message: string) => void
  onSectionLoading?: (section: string, phase: number, progress: number) => void
  onSectionUpdate?: (section: string, html: string, phase: number, progress: number) => void
  onComplete?: (htmlReport: string, valuationId: string, fullResponse?: StreamEvent) => void
  onError?: (error: string, errorType?: string) => void
}

const MIN_STREAM_REPORT_HTML_LENGTH = 100

function getRenderableStreamReportHtml(html: string | null | undefined): string | undefined {
  const renderableHtml = getRenderableReportHtml(html)
  if (!renderableHtml || renderableHtml.trim().length < MIN_STREAM_REPORT_HTML_LENGTH) {
    return undefined
  }
  return renderableHtml
}

function getReportHtmlRejectReason(html: string | null | undefined): string {
  if (!html) return 'missing'
  if (isSafetyNetReportHtml(html)) return 'safety_net'
  if (html.trim().length < MIN_STREAM_REPORT_HTML_LENGTH) return 'too_short'
  return 'unknown'
}

function createMockEventSource(
  streamUrl: string,
  readyState: number,
  close: () => void
): EventSource {
  return {
    close,
    readyState,
    url: streamUrl,
    withCredentials: false,
    CONNECTING: EventSource.CONNECTING,
    OPEN: EventSource.OPEN,
    CLOSED: EventSource.CLOSED,
    onopen: null,
    onmessage: null,
    onerror: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }
}

export function handleManualValuationStreamEvent(
  event: StreamEvent,
  callbacks: StreamCallbacks,
  streamId: string
): void {
  apiLogger.debug('Handling stream event', {
    requestId: streamId,
    eventType: event.type,
    progress: event.progress,
  })

  switch (event.type) {
    case 'progress':
      if (event.progress !== undefined && event.message) {
        callbacks.onProgress?.(event.progress, event.message)
      }
      break

    case 'section_loading':
      if (event.section && event.phase !== undefined && event.progress !== undefined) {
        callbacks.onSectionLoading?.(event.section, event.phase, event.progress)
      }
      break

    case 'report_section':
      if (
        event.section &&
        event.html &&
        event.phase !== undefined &&
        event.progress !== undefined
      ) {
        // Special handling for complete_report section - treat as completion event
        if (event.section === 'complete_report') {
          const renderableHtml = getRenderableStreamReportHtml(event.html)
          const htmlLength = event.html.length

          apiLogger.info('[STREAM-FRONTEND] Complete report section received', {
            requestId: streamId,
            section: event.section,
            valuationId: event.valuation_id,
            htmlLength,
            hasRenderableHtml: !!renderableHtml,
            rejectReason: renderableHtml ? undefined : getReportHtmlRejectReason(event.html),
            htmlPreview: event.html.substring(0, 200),
            phase: event.phase,
            progress: event.progress,
            hasOnCompleteCallback: !!callbacks.onComplete,
          })

          if (!renderableHtml || !event.valuation_id) {
            apiLogger.warn(
              '[STREAM-FRONTEND] complete_report section ignored because report HTML is not renderable',
              {
                requestId: streamId,
                hasRenderableHtml: !!renderableHtml,
                hasValuationId: !!event.valuation_id,
                htmlLength,
                rejectReason: getReportHtmlRejectReason(event.html),
              }
            )
            break
          }

          const completionEvent: StreamEvent = {
            ...event,
            html: renderableHtml,
            html_report: renderableHtml,
          }

          callbacks.onComplete?.(renderableHtml, event.valuation_id, completionEvent)

          apiLogger.info('[STREAM-FRONTEND] onComplete callback triggered for complete_report', {
            requestId: streamId,
            valuationId: event.valuation_id,
            htmlLength: renderableHtml.length,
          })
        } else {
          // Regular section update
          apiLogger.debug('[STREAM-FRONTEND] Regular section update received', {
            requestId: streamId,
            section: event.section,
            htmlLength: event.html.length,
            phase: event.phase,
            progress: event.progress,
          })
          callbacks.onSectionUpdate?.(event.section, event.html, event.phase, event.progress)
        }
      }
      break

    case 'report_complete': {
      const renderableHtmlReport = getRenderableStreamReportHtml(event.html_report)
      const hasHtmlReport = !!event.html_report
      const htmlReportLength = event.html_report?.length || 0
      apiLogger.info('[STREAM-FRONTEND] report_complete event received', {
        requestId: streamId,
        valuationId: event.valuation_id,
        hasHtmlReport,
        hasRenderableHtmlReport: !!renderableHtmlReport,
        rejectReason: renderableHtmlReport
          ? undefined
          : getReportHtmlRejectReason(event.html_report),
        htmlReportLength,
        htmlReportPreview: event.html_report?.substring(0, 200) || 'N/A',
        progress: event.progress,
        status: event.status,
        hasOnCompleteCallback: !!callbacks.onComplete,
      })

      if (renderableHtmlReport && event.valuation_id) {
        const completionEvent: StreamEvent = {
          ...event,
          html_report: renderableHtmlReport,
        }

        callbacks.onComplete?.(renderableHtmlReport, event.valuation_id, completionEvent)

        apiLogger.info('[STREAM-FRONTEND] onComplete callback triggered for report_complete', {
          requestId: streamId,
          valuationId: event.valuation_id,
          htmlReportLength: renderableHtmlReport.length,
        })
      } else {
        apiLogger.warn(
          '[STREAM-FRONTEND] report_complete event missing renderable html_report or valuation_id',
          {
            requestId: streamId,
            hasHtmlReport,
            hasRenderableHtmlReport: !!renderableHtmlReport,
            hasValuationId: !!event.valuation_id,
            htmlReportLength,
            rejectReason: getReportHtmlRejectReason(event.html_report),
          }
        )
        callbacks.onError?.(
          'Valuation report HTML was not renderable. Please try recalculating the valuation.',
          'ReportHtmlUnavailable'
        )
      }
      break
    }

    case 'error':
      callbacks.onError?.(event.error || event.message || 'Unknown error', event.error_type)
      break

    default:
      apiLogger.warn('Unknown stream event type', {
        requestId: streamId,
        eventType: event.type,
      })
  }
}

class ManualValuationStreamService {
  private activeStreams: Map<
    string,
    { controller: AbortController; reader?: ReadableStreamDefaultReader }
  > = new Map()
  private streamTimeouts: Map<string, NodeJS.Timeout> = new Map()
  private completedStreams: Set<string> = new Set()
  // BANK-GRADE: Cascading Timeout Chain - Venus (85s) > Titan (80s) > ValuationIQ (70s)
  private readonly DEFAULT_TIMEOUT = 85000 // 85 seconds (cascade)

  /**
   * Generate request fingerprint for deduplication
   */
  private getRequestFingerprint(request: ValuationRequest): string {
    const key = `${request.company_name}_${request.current_year_data?.revenue}_${request.current_year_data?.ebitda}_${request.industry}`
    return btoa(key).substring(0, 16)
  }

  /**
   * Stream manual valuation calculation with progressive HTML report generation
   * Supports request cancellation, timeout, and deduplication
   */
  async streamManualValuation(
    request: ValuationRequest,
    callbacks: StreamCallbacks,
    requestId?: string,
    options?: {
      timeout?: number
      enableDeduplication?: boolean
    }
  ): Promise<EventSource> {
    const streamId = requestId || this.getRequestFingerprint(request)
    const timeout = options?.timeout || this.DEFAULT_TIMEOUT

    // Check for duplicate stream
    if (options?.enableDeduplication !== false && this.activeStreams.has(streamId)) {
      apiLogger.warn('Duplicate stream detected, closing previous', { streamId })
      this.closeStream(streamId)
    }

    apiLogger.info('Starting manual valuation stream', {
      requestId: streamId,
      companyName: request.company_name,
    })

    // Use Python engine URL directly for streaming
    const pythonEngineUrl =
      process.env.NEXT_PUBLIC_PYTHON_ENGINE_URL || 'https://api.valuations.upswitch.app'

    const streamUrl = `${pythonEngineUrl}/api/v1/valuation/calculate/stream`

    // For POST requests with SSE, we need to use fetch with ReadableStream
    // EventSource only supports GET requests
    const abortController = new AbortController()
    this.activeStreams.set(streamId, { controller: abortController })

    // Set up timeout
    const timeoutId = setTimeout(() => {
      apiLogger.warn('Stream timeout', { streamId, timeout })
      abortController.abort()
      callbacks.onError?.('Stream timeout - calculation took too long', 'TimeoutError')
      this.closeStream(streamId)
    }, timeout)

    this.streamTimeouts.set(streamId, timeoutId)

    try {
      const response = await fetch(streamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(request),
        signal: abortController.signal,
      })

      if (!response.ok) {
        throw new Error(`Stream failed: ${response.status} ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('Response body is not readable')
      }

      // Store reader for cleanup
      const streamEntry = this.activeStreams.get(streamId)
      if (streamEntry) {
        streamEntry.reader = reader
      }

      // Process stream asynchronously
      this.processStream(reader, decoder, callbacks, streamId, abortController).finally(() => {
        // Cleanup timeout on completion
        const timeout = this.streamTimeouts.get(streamId)
        if (timeout) {
          clearTimeout(timeout)
          this.streamTimeouts.delete(streamId)
        }
      })

      // Return a mock EventSource-like object for compatibility
      return createMockEventSource(streamUrl, EventSource.CONNECTING, () => {
        this.closeStream(streamId)
      })
    } catch (error) {
      // Cleanup on error
      this.closeStream(streamId)

      // Handle abort errors gracefully
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'AbortedError')
      ) {
        apiLogger.info('Stream cancelled by user', { streamId })
        callbacks.onError?.('Stream cancelled', 'AbortError')
        return createMockEventSource(streamUrl, EventSource.CLOSED, () => undefined)
      }

      apiLogger.error('Failed to start manual valuation stream', {
        requestId: streamId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      callbacks.onError?.(
        error instanceof Error ? error.message : 'Failed to start stream',
        error instanceof Error ? error.constructor.name : 'UnknownError'
      )

      throw error
    }
  }

  private async processStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    decoder: TextDecoder,
    callbacks: StreamCallbacks,
    streamId: string,
    _abortController: AbortController
  ): Promise<void> {
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          apiLogger.info('Manual valuation stream completed', { requestId: streamId })
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.substring(6) // Remove 'data: ' prefix
              const event: StreamEvent = JSON.parse(jsonStr)

              this.handleStreamEvent(event, callbacks, streamId)
            } catch (parseError) {
              apiLogger.warn('Failed to parse SSE event', {
                requestId: streamId,
                error: parseError instanceof Error ? parseError.message : 'Unknown error',
                line: line.substring(0, 100), // Log first 100 chars
              })
            }
          } else if (line.startsWith('event: ')) {
            // Handle event type if needed
            const eventType = line.substring(7)
            apiLogger.debug('SSE event type', { requestId: streamId, eventType })
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        apiLogger.info('Manual valuation stream aborted', { requestId: streamId })
      } else {
        apiLogger.error('Error processing manual valuation stream', {
          requestId: streamId,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        callbacks.onError?.(
          error instanceof Error ? error.message : 'Stream processing error',
          error instanceof Error ? error.constructor.name : 'UnknownError'
        )
      }
    } finally {
      reader.releaseLock()
      this.activeStreams.delete(streamId)
      this.completedStreams.delete(streamId)
    }
  }

  private callbacksWithSingleCompletion(
    callbacks: StreamCallbacks,
    streamId: string
  ): StreamCallbacks {
    return {
      ...callbacks,
      onComplete: (htmlReport, valuationId, fullResponse) => {
        if (this.completedStreams.has(streamId)) {
          apiLogger.debug('[STREAM-FRONTEND] Duplicate completion ignored', {
            requestId: streamId,
            valuationId,
          })
          return
        }

        this.completedStreams.add(streamId)
        callbacks.onComplete?.(htmlReport, valuationId, fullResponse)
      },
      onError: (error, errorType) => {
        if (this.completedStreams.has(streamId) && errorType === 'ReportHtmlUnavailable') {
          apiLogger.debug('[STREAM-FRONTEND] Post-completion report HTML error ignored', {
            requestId: streamId,
            errorType,
          })
          return
        }

        callbacks.onError?.(error, errorType)
      },
    }
  }

  private handleStreamEvent(
    event: StreamEvent,
    callbacks: StreamCallbacks,
    streamId: string
  ): void {
    handleManualValuationStreamEvent(
      event,
      this.callbacksWithSingleCompletion(callbacks, streamId),
      streamId
    )
  }

  /**
   * Close a specific stream
   */
  closeStream(streamId: string): void {
    const stream = this.activeStreams.get(streamId)
    if (stream) {
      stream.controller.abort()
      if (stream.reader) {
        stream.reader.cancel().catch(() => {
          // Ignore cancellation errors
        })
      }
      this.activeStreams.delete(streamId)
      this.completedStreams.delete(streamId)

      const timeout = this.streamTimeouts.get(streamId)
      if (timeout) {
        clearTimeout(timeout)
        this.streamTimeouts.delete(streamId)
      }

      apiLogger.info('Manual valuation stream closed', { requestId: streamId })
    }
  }

  /**
   * Close all active streams
   */
  closeAllStreams(): void {
    for (const [streamId, stream] of this.activeStreams.entries()) {
      stream.controller.abort()
      if (stream.reader) {
        stream.reader.cancel().catch(() => {
          // Ignore cancellation errors
        })
      }

      const timeout = this.streamTimeouts.get(streamId)
      if (timeout) {
        clearTimeout(timeout)
      }

      apiLogger.info('Manual valuation stream closed', { requestId: streamId })
    }
    this.activeStreams.clear()
    this.streamTimeouts.clear()
    this.completedStreams.clear()
  }
}

// Export singleton instance
export const manualValuationStreamService = new ManualValuationStreamService()
export type { StreamCallbacks, StreamEvent }
