/**
 * StreamEventHandler - Handles all SSE events from the streaming conversation
 *
 * Extracted from StreamingChat.tsx to reduce component complexity and improve maintainability.
 * Centralizes all event handling logic in a single, testable class.
 */

import { BUSINESS_TYPES_FALLBACK, BusinessTypeOption } from '../../config/businessTypes'
import { useConversationalResultsStore } from '../../store/conversational'
import { useConversationStore } from '../../store/useConversationStore'
import { useSessionStore } from '../../store/useSessionStore'
import type { Message, MessageMetadata } from '../../types/message'
import { chatLogger } from '../../utils/logger'
import { ReportHandlers, UIHandlers, ValuationHandlers } from './handlers'
import type { StreamEvent } from './streamingChatService'

const normalizeText = (value: string) => value.trim().toLowerCase()

const simpleSimilarity = (a: string, b: string): number => {
  // Lightweight similarity: longest common substring ratio
  const s1 = normalizeText(a)
  const s2 = normalizeText(b)
  if (!s1 || !s2) return 0
  let longest = 0
  for (let i = 0; i < s1.length; i++) {
    for (let j = i + 1; j <= s1.length; j++) {
      const substr = s1.slice(i, j)
      if (s2.includes(substr) && substr.length > longest) {
        longest = substr.length
      }
    }
  }
  return longest / Math.max(s1.length, s2.length)
}

const _getFallbackBusinessTypeSuggestions = (query: string, limit = 5) => {
  const normalized = normalizeText(query)
  const scored = BUSINESS_TYPES_FALLBACK.map((bt: BusinessTypeOption) => ({
    text: bt.label?.replace(/^[^\s]+\s/, '') || bt.label || bt.value,
    confidence: simpleSimilarity(normalized, bt.label || bt.value),
    reason: bt.category || 'Similar business type',
  }))
    .filter((s) => s.confidence > 0.2) // discard very weak matches
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))

  // If still nothing, offer a single cleaned-up guess
  if (scored.length === 0) {
    return [
      {
        text: query,
        confidence: 0.3,
        reason: 'Closest guess',
      },
    ]
  }

  return scored.slice(0, limit)
}

// Re-export types for convenience
export interface ModelPerformanceMetrics {
  model_name: string
  model_version: string
  time_to_first_token_ms: number
  total_response_time_ms: number
  tokens_per_second: number
  response_coherence_score?: number
  response_relevance_score?: number
  hallucination_detected: boolean
  input_tokens: number
  output_tokens: number
  estimated_cost_usd: number
  error_occurred: boolean
  error_type?: string
  retry_count: number
}

export interface StreamEventHandlerCallbacks {
  updateStreamingMessage: (content: string, isComplete?: boolean, metadata?: any) => void
  setIsStreaming: (streaming: boolean) => void
  setIsTyping?: (typing: boolean) => void
  setIsThinking?: (thinking: boolean) => void
  setTypingContext?: (context?: string) => void
  setCollectedData: React.Dispatch<React.SetStateAction<Record<string, any>>>
  setValuationPreview: React.Dispatch<React.SetStateAction<any>>
  setCalculateOption: React.Dispatch<React.SetStateAction<any>>
  addMessage: (message: Omit<Message, 'id' | 'timestamp'>) => {
    updatedMessages: Message[]
    newMessage: Message
  }
  trackModelPerformance: (metrics: ModelPerformanceMetrics) => void
  trackConversationCompletion: (success: boolean, hasValuation: boolean) => void
  onValuationComplete?: (result: any) => void
  onReportUpdate?: (html: string, progress: number) => void
  onSectionLoading?: (section: string, html: string, phase: number, data?: any) => void
  onSectionComplete?: (event: {
    sectionId: string
    sectionName: string
    html: string
    progress: number
    phase?: number
  }) => void
  onReportSectionUpdate?: (
    section: string,
    html: string,
    phase: number,
    progress: number,
    is_fallback?: boolean,
    is_error?: boolean,
    error_message?: string
  ) => void
  onReportComplete?: (html: string, valuationId: string) => void
  onDataCollected?: (data: any) => void
  onValuationPreview?: (data: any) => void
  onCalculateOptionAvailable?: (data: any) => void
  onProgressUpdate?: (data: any) => void
  onHtmlPreviewUpdate?: (html: string, previewType: string) => void
  onStreamStart?: () => void // CRITICAL FIX: Callback to reset event handler state when new stream starts
}

/**
 * Centralized event handler for streaming conversation events
 *
 * Handles all SSE events from the backend, including:
 * - Message streaming (typing, chunks, completion)
 * - Report updates (sections, progress, completion)
 * - Data collection events
 * - Valuation results
 * - Error handling
 * - Metrics tracking
 */
export class StreamEventHandler {
  private sessionId: string

  // Modular handler instances - each handles a specific domain
  // MessageHandlers removed - using Zustand store directly
  private reportHandlers: ReportHandlers
  private valuationHandlers: ValuationHandlers
  private uiHandlers: UIHandlers

  constructor(
    sessionId: string,
    private callbacks: StreamEventHandlerCallbacks
  ) {
    this.sessionId = sessionId

    // Initialize modular handlers (message handling now uses store directly)
    this.reportHandlers = new ReportHandlers(callbacks)
    this.valuationHandlers = new ValuationHandlers(callbacks)
    this.uiHandlers = new UIHandlers(callbacks)
  }

  /**
   * Reset event handler state for a new stream
   * Simplified - no complex message handler state to reset
   */
  reset(): void {
    chatLogger.debug('Resetting StreamEventHandler state for new stream', {
      sessionId: this.sessionId,
    })
    // Store handles state, no reset needed
  }

  /**
   * Main event handler - routes events to appropriate handlers
   *
   * @param data - Event data from SSE stream
   */
  handleEvent(data: StreamEvent): void {
    // Defensive parsing: extract event type from multiple possible locations
    const eventType = data?.type || data?.event || 'unknown'

    try {
      switch (eventType) {
        // Message-related events - direct store updates (simple linear flow)
        case 'typing': {
          const store = useConversationStore.getState()
          store.setTyping(true)
          store.setThinking(true)
          // Callbacks for non-message state (collectedData, etc.)
          this.callbacks.setIsTyping?.(true)
          this.callbacks.setIsThinking?.(true)
          return
        }
        case 'message_start': {
          // Simple: Create message immediately in store (optimistic update)
          const store = useConversationStore.getState()
          const messageId = store.addMessage({
            type: 'ai',
            content: data.content || '',
            isStreaming: true,
            isComplete: false,
            metadata: (data.metadata || data.data) as MessageMetadata | undefined,
          })
          store.setStreaming(true)
          store.setTyping(false)
          store.setThinking(false)
          // Callbacks for non-message state only
          this.callbacks.setIsStreaming(true)
          this.callbacks.setIsTyping?.(false)
          this.callbacks.setIsThinking?.(false)
          chatLogger.debug('Message started', { messageId, sessionId: this.sessionId })
          return
        }
        case 'message_chunk': {
          // Simple: Append content to streaming message (store only, no callback)
          const store = useConversationStore.getState()
          let streamingId = store.currentStreamingMessageId

          // CRITICAL FIX: If currentStreamingMessageId is not set (race condition),
          // find the last streaming message as fallback
          if (!streamingId) {
            const lastStreamingMessage = store.messages
              .slice()
              .reverse()
              .find((msg) => msg.isStreaming && !msg.isComplete)
            if (lastStreamingMessage) {
              streamingId = lastStreamingMessage.id
              chatLogger.debug('Found streaming message via fallback search', {
                messageId: streamingId,
                sessionId: this.sessionId,
              })
            }
          }

          if (streamingId && data.content) {
            store.appendToMessage(streamingId, data.content)
          } else if (!streamingId && data.content) {
            // Edge case: Chunk arrived before message_start - create message optimistically
            chatLogger.warn(
              'Message chunk received before message_start - creating message optimistically',
              {
                sessionId: this.sessionId,
                hasContent: !!data.content,
              }
            )
            const messageId = store.addMessage({
              type: 'ai',
              content: data.content,
              isStreaming: true,
              isComplete: false,
              metadata: data.metadata || {},
            })
            store.setStreaming(true)
          } else if (!streamingId) {
            chatLogger.warn(
              'Message chunk received but no streaming message found and no content',
              {
                sessionId: this.sessionId,
                hasContent: !!data.content,
              }
            )
          }
          return
        }
        case 'message_complete': {
          // CRITICAL FIX: Don't replace content - it's already accumulated from chunks
          // Backend sends empty content in message_complete (content sent via chunks)
          const store = useConversationStore.getState()
          let streamingId = store.currentStreamingMessageId

          // CRITICAL FIX: If currentStreamingMessageId is not set (race condition),
          // find the last streaming message as fallback
          if (!streamingId) {
            const lastStreamingMessage = store.messages
              .slice()
              .reverse()
              .find((msg) => msg.isStreaming && !msg.isComplete)
            if (lastStreamingMessage) {
              streamingId = lastStreamingMessage.id
              chatLogger.debug('Found streaming message via fallback search for message_complete', {
                messageId: streamingId,
                sessionId: this.sessionId,
              })
            }
          }

          // CRITICAL FIX: Handle confirmation cards - create message if message_complete arrives
          // with confirmation metadata but no message_start was sent
          const metadata = (data.metadata || data.data || {}) as Record<string, unknown>
          const hasConfirmationMetadata =
            metadata.is_business_type_confirmation === true ||
            metadata.is_company_name_confirmation === true

          if (!streamingId && hasConfirmationMetadata) {
            // Create message optimistically for confirmation cards
            chatLogger.debug('Creating message for confirmation card (no message_start received)', {
              sessionId: this.sessionId,
              hasBusinessTypeConfirmation: metadata.is_business_type_confirmation === true,
              hasCompanyNameConfirmation: metadata.is_company_name_confirmation === true,
            })
            const messageId = store.addMessage({
              type: 'ai',
              content: data.content || '', // May be empty for confirmation cards
              isStreaming: false,
              isComplete: true,
              metadata: metadata,
            })
            store.setStreaming(false)
            this.callbacks.setIsThinking?.(false)
            this.callbacks.setIsTyping?.(false)
            return
          }

          if (streamingId) {
            // Only update completion status and metadata, preserve accumulated content
            const currentMessage = store.messages.find((m) => m.id === streamingId)
            if (currentMessage) {
              const completedMessage = {
                ...currentMessage,
                content: currentMessage.content || data.content || '',
                isComplete: true,
                isStreaming: false,
                metadata: { ...currentMessage.metadata, ...metadata },
              }

              store.updateMessage(streamingId, completedMessage)
              store.setStreaming(false)

              // CRITICAL FIX: Reset thinking state when message completes
              this.callbacks.setIsThinking?.(false)
              this.callbacks.setIsTyping?.(false)

              // Track completion if callback provided
              if (this.callbacks.trackConversationCompletion) {
                this.callbacks.trackConversationCompletion(true, false)
              }

              // Note: onMessageComplete callback is handled by StreamingChat component
              // via useEffect watching for completed messages in the store
            } else {
              chatLogger.warn('Message complete received but message not found in store', {
                messageId: streamingId,
                sessionId: this.sessionId,
              })
            }
          } else {
            chatLogger.warn('Message complete received but no streaming message found', {
              sessionId: this.sessionId,
              hasConfirmationMetadata,
            })
          }
          return
        }

        // Report-related events
        case 'report_update':
          return this.reportHandlers.handleReportUpdate(data)
        case 'section_loading':
          return this.reportHandlers.handleSectionLoading(data)
        case 'section_complete':
          return this.reportHandlers.handleSectionComplete(data)
        case 'report_section':
          return this.reportHandlers.handleReportSection(data)
        case 'report_complete':
          return this.reportHandlers.handleReportComplete(data)

        // Valuation-related events
        case 'valuation_preview':
          return this.valuationHandlers.handleValuationPreview(data)
        case 'calculate_option':
          return this.valuationHandlers.handleCalculateOption(data)
        case 'valuation_ready':
          return this.valuationHandlers.handleValuationReady(data)
        case 'valuation_confirmed':
          return this.valuationHandlers.handleValuationConfirmed(data)
        case 'valuation_complete':
          return this.valuationHandlers.handleValuationComplete(data)

        // HTML Report events (sent separately from Python backend)
        case 'html_report': {
          const htmlReport = data.html_report || data.html || data.content || ''
          const valuationId = data.valuation_id || ''

          chatLogger.info('HTML report event received', {
            valuationId,
            htmlReportLength: htmlReport.length,
            hasValuationId: !!valuationId,
          })

          // Update valuation results store with html_report (Conversational flow)
          const resultsStore = useConversationalResultsStore.getState()
          const currentResult = resultsStore.result

          if (currentResult && valuationId && currentResult.valuation_id === valuationId) {
            // Update existing result
            resultsStore.setResult({
              ...currentResult,
              html_report: htmlReport,
            })
            chatLogger.info('Updated existing result with html_report', {
              valuationId,
              htmlReportLength: htmlReport.length,
            })
          } else if (valuationId) {
            // Create new result with html_report
            resultsStore.setResult({
              valuation_id: valuationId,
              html_report: htmlReport,
            } as any)
            chatLogger.info('Created new result with html_report', {
              valuationId,
              htmlReportLength: htmlReport.length,
            })
          } else {
            chatLogger.warn('html_report event missing valuation_id', {
              hasHtmlReport: !!htmlReport,
              htmlReportLength: htmlReport.length,
            })
          }

          // CRITICAL: Save HTML report to session store for persistence (non-blocking)
          // This ensures HTML reports are saved even if they arrive before valuation_complete
          if (htmlReport && valuationId && this.sessionId) {
            // Use dynamic import in background (non-blocking)
            import('../api/session/SessionAPI')
              .then(({ SessionAPI }) => {
                const sessionAPI = new SessionAPI()
                const session = useSessionStore.getState().session

                if (session?.reportId) {
                  // Get current result to merge with HTML report
                  const resultToSave = resultsStore.result || { valuation_id: valuationId }

                  sessionAPI
                    .saveValuationResult(session.reportId, {
                      valuationResult: {
                        ...resultToSave,
                        html_report: htmlReport,
                      },
                      htmlReport: htmlReport,
                      infoTabHtml:
                        'info_tab_html' in resultToSave ? resultToSave.info_tab_html : undefined,
                    })
                    .then(() => {
                      chatLogger.info('HTML report saved to session store', {
                        reportId: session.reportId,
                        valuationId,
                        htmlReportLength: htmlReport.length,
                      })
                    })
                    .catch((error) => {
                      // Don't block - HTML report is already in results store
                      chatLogger.warn('Failed to save HTML report to session store', {
                        error: error instanceof Error ? error.message : String(error),
                        valuationId,
                      })
                    })
                }
              })
              .catch((error) => {
                chatLogger.warn('Failed to import SessionAPI for HTML report save', {
                  error: error instanceof Error ? error.message : String(error),
                })
              })
          }

          // Also call report update callback if available
          this.callbacks.onReportUpdate?.(htmlReport, 100)
          return
        }

        case 'info_tab_html': {
          const infoTabHtml = data.info_tab_html || data.html || data.content || ''
          const valuationId = data.valuation_id || ''

          chatLogger.info('Info tab HTML event received', {
            valuationId,
            infoTabHtmlLength: infoTabHtml.length,
            hasValuationId: !!valuationId,
          })

          // Update valuation results store with info_tab_html (Conversational flow)
          const resultsStore = useConversationalResultsStore.getState()
          const currentResult = resultsStore.result

          if (currentResult && valuationId && currentResult.valuation_id === valuationId) {
            // Update existing result
            resultsStore.setResult({
              ...currentResult,
              info_tab_html: infoTabHtml,
            })
            chatLogger.info('Updated existing result with info_tab_html', {
              valuationId,
              infoTabHtmlLength: infoTabHtml.length,
            })
          } else if (valuationId) {
            // Create new result with info_tab_html
            resultsStore.setResult({
              valuation_id: valuationId,
              info_tab_html: infoTabHtml,
            } as any)
            chatLogger.info('Created new result with info_tab_html', {
              valuationId,
              infoTabHtmlLength: infoTabHtml.length,
            })
          } else {
            chatLogger.warn('info_tab_html event missing valuation_id', {
              hasInfoTabHtml: !!infoTabHtml,
              infoTabHtmlLength: infoTabHtml.length,
            })
          }

          // CRITICAL: Save info tab HTML to session store for persistence (non-blocking)
          // This ensures info tab HTML is saved even if it arrives before valuation_complete
          if (infoTabHtml && valuationId && this.sessionId) {
            // Use dynamic import in background (non-blocking)
            import('../api/session/SessionAPI')
              .then(({ SessionAPI }) => {
                const sessionAPI = new SessionAPI()
                const session = useSessionStore.getState().session

                if (session?.reportId) {
                  // Get current result to merge with info tab HTML
                  const resultToSave = resultsStore.result || { valuation_id: valuationId }

                  sessionAPI
                    .saveValuationResult(session.reportId, {
                      valuationResult: {
                        ...resultToSave,
                        info_tab_html: infoTabHtml,
                      },
                      htmlReport:
                        'html_report' in resultToSave ? resultToSave.html_report : undefined,
                      infoTabHtml: infoTabHtml,
                    })
                    .then(() => {
                      chatLogger.info('Info tab HTML saved to session store', {
                        reportId: session.reportId,
                        valuationId,
                        infoTabHtmlLength: infoTabHtml.length,
                      })
                    })
                    .catch((error) => {
                      // Don't block - info tab HTML is already in results store
                      chatLogger.warn('Failed to save info tab HTML to session store', {
                        error: error instanceof Error ? error.message : String(error),
                        valuationId,
                      })
                    })
                }
              })
              .catch((error) => {
                chatLogger.warn('Failed to import SessionAPI for info tab HTML save', {
                  error: error instanceof Error ? error.message : String(error),
                })
              })
          }
          return
        }

        // UI and data events
        case 'progress_summary':
          return this.uiHandlers.handleProgressSummary(data)
        case 'progress_update':
          return this.uiHandlers.handleProgressUpdate(data)
        case 'data_collected':
          return this.uiHandlers.handleDataCollected(data)
        case 'suggestion_offered':
          return this.uiHandlers.handleSuggestionOffered(data)
        case 'clarification_needed':
          return this.uiHandlers.handleClarificationNeeded(data)
        case 'html_preview':
          return this.uiHandlers.handleHtmlPreview(data)
        case 'complete': {
          // CRITICAL FIX: Handle complete event silently (no error message)
          // This is a success signal from backend after valuation completes
          // The report has already been loaded via valuation_complete/html_report events
          chatLogger.info('Completion event received (success)', {
            sessionId: this.sessionId,
            message: data.message || 'Valuation calculation complete',
          })
          // Reset streaming state if still active
          const store = useConversationStore.getState()
          store.setStreaming(false)
          this.callbacks.setIsStreaming?.(false)
          this.callbacks.setIsTyping?.(false)
          this.callbacks.setIsThinking?.(false)
          return
        }
        case 'error':
          return this.uiHandlers.handleError(data)

        case 'unknown':
          // Treat unknown events as errors with a readable fallback
          return this.uiHandlers.handleError({
            ...data,
            message: data.message || data.content || 'An unexpected event occurred',
            content: data.content || 'Unknown event type',
          })
        default:
          // Fallback for truly unrecognized event types
          chatLogger.warn('Unrecognized event type, treating as error', { type: eventType })
          return this.uiHandlers.handleError({
            ...data,
            message: `Unrecognized event: ${eventType}`,
            content: data.content || 'An unexpected error occurred',
          })
      }
    } catch (error) {
      chatLogger.error('Error in handleEvent', {
        eventType,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      // Fallback to error handling
      this.uiHandlers.handleError({
        ...data,
        message: `Event processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error_type: 'handler_error',
      })
    }
  }
}
