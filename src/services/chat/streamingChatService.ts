import { chatLogger } from '../../utils/logger'
// AUTH-FIRST: guestSessionService removed - authentication is required

/**
 * StreamEvent - Type-safe interface for SSE events from the backend
 *
 * All streaming events follow this structure. The type field determines
 * which handler processes the event.
 */
export interface StreamEvent {
  type:
    | 'message_start'
    | 'message_chunk'
    | 'message_complete'
    | 'report_update'
    | 'error'
    | 'typing'
    | 'data_collected'
    | 'progress_update'
    | 'progress_summary'
    | 'html_preview'
    | 'suggestion_offered'
    | 'clarification_needed'
    | 'registry_data'
    | 'complete'
    | 'section_loading'
    | 'section_complete'
    | 'report_section'
    | 'report_complete'
    | 'valuation_preview'
    | 'calculate_option'
    | 'valuation_ready'
    | 'valuation_confirmed'
    | 'valuation_complete'
    | 'html_report'
    | 'info_tab_html'
    | 'unknown'
  content?: string
  html?: string
  progress?: number
  metadata?: Record<string, unknown>
  session_id?: string
  message?: string
  error_type?: string
  valuation_id?: string
  html_report?: string
  info_tab_html?: string
  [key: string]: unknown // Index signature for additional properties
}

export class StreamingChatService {
  private baseURL: string

  constructor() {
    // FIX: Use Node.js backend (proxy), not Python engine directly
    this.baseURL =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      'https://api.upswitch.app'
  }

  async *streamConversation(
    sessionId: string,
    userInput: string,
    userId?: string,
    abortSignal?: AbortSignal
  ): AsyncGenerator<StreamEvent> {
    const normalizeCurrencyToEuro = (text: string): string => {
      if (!text) return text

      const nonEuroPattern =
        /\b(usd|gbp|pounds?|dollars?|cad|aud|chf|yen|jpy|cny|hkd|sek|nok|dkk|zar)\b|[$£¥]/i
      const euroPattern = /\b(eur|euro|euros)\b|€/i

      // Remove common currency symbols/words, keep digits/.,, and spaces
      const stripCurrencyWords = (value: string) =>
        value
          .replace(/[€]/g, '')
          .replace(/\b(eur|euro|euros)\b/gi, '')
          .replace(/[^\d.,\s-]/g, '')
          .trim()

      const hasNonEuro = nonEuroPattern.test(text) && !euroPattern.test(text)

      // Normalize thousand/decimal separators: support both EU and US
      const normalizeNumberString = (value: string) => {
        // Remove spaces
        let cleaned = value.replace(/\s+/g, '')
        // If looks like EU format (1.234,56), swap separators
        const euLike = /^\d{1,3}(\.\d{3})*(,\d+)?$/
        if (euLike.test(cleaned)) {
          cleaned = cleaned.replace(/\./g, '').replace(',', '.')
        } else {
          // Otherwise remove thousands commas
          cleaned = cleaned.replace(/,/g, '')
        }
        return cleaned
      }

      // Base cleaning
      const base = stripCurrencyWords(text)
      const normalized = normalizeNumberString(base)
      const numericMatch = normalized.match(/^[+-]?\d+(?:\.\d+)?$/)

      if (!numericMatch) {
        return text // fallback to raw input if we can't parse
      }

      // If non-euro currency detected, still accept but explicitly tag as euro for backend
      if (hasNonEuro) {
        return `${normalized} euro`
      }

      // Otherwise treat as euros by default
      return normalized
    }

    const sanitizedInput = normalizeCurrencyToEuro(userInput)

    try {
      chatLogger.info('Stream started', {
        sessionId,
        userInput: userInput.substring(0, 50) + '...',
        userId,
      })

      // AUTH-FIRST: Guest session handling removed - authentication required
      const requestBody = {
        session_id: sessionId,
        user_input: sanitizedInput,
        user_id: userId,
      }

      const url = `${this.baseURL}/api/v1/intelligent-conversation/stream`

      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include', // Send cookies automatically for auth
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: abortSignal, // CRITICAL FIX: Support abort signal for cleanup
      })

      if (!response.ok) {
        const errorText = await response.text()
        chatLogger.error('SSE request failed', { status: response.status, errorText })

        // CRITICAL FIX: Handle rate limit errors specifically
        if (response.status === 429) {
          let retryAfter = 3600 // Default: 1 hour
          try {
            const errorData = JSON.parse(errorText)
            retryAfter = errorData.retry_after || retryAfter
          } catch {
            // If parsing fails, use default
          }

          const { RateLimitError } = await import('../../utils/errors/ApplicationErrors')
          throw new RateLimitError(
            'Too many conversation requests. Please wait before trying again.',
            { retryAfter, status: 429 }
          )
        }

        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`)
      }

      if (!response.body) {
        chatLogger.error('Response body is null')
        throw new Error('Response body is null')
      }

      const reader = response.body.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        // CRITICAL FIX: Check if aborted before reading
        if (abortSignal?.aborted) {
          chatLogger.info('SSE stream aborted', { sessionId })
          reader.cancel()
          break
        }

        const { done, value } = await reader.read()
        if (done) {
          chatLogger.debug('SSE stream completed')
          break
        }

        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          // Handle SSE comment lines (keepalive pings)
          if (line.startsWith(': ')) {
            continue
          }

          // Handle data lines
          if (line.startsWith('data: ') && line.trim().length > 6) {
            const jsonStr = line.slice(6).trim()

            if (jsonStr) {
              try {
                const data = JSON.parse(jsonStr)

                // Handle error events
                if (data.type === 'error') {
                  chatLogger.error('SSE Error received', {
                    message: data.message,
                    sessionId: data.session_id,
                  })
                  yield data
                  return // Stop processing on error
                }

                // Handle ping events (ignore)
                if (data.type === 'ping') {
                  continue
                }

                yield data
              } catch (parseError) {
                chatLogger.error('Failed to parse SSE data', {
                  line,
                  jsonStr,
                  parseError: parseError instanceof Error ? parseError.message : String(parseError),
                })
                // Skip malformed chunks - they'll be completed in next iteration
                continue
              }
            }
          }
        }
      }
    } catch (error) {
      // CRITICAL FIX: Don't yield error if aborted (expected behavior)
      if (error instanceof Error && error.name === 'AbortError') {
        chatLogger.info('SSE stream aborted (expected)', { sessionId })
        return
      }
      // Yield error event instead of throwing for other errors
      yield {
        type: 'error',
        content: error instanceof Error ? error.message : 'Connection failed',
      }
      return
    }
  }

  /**
   * Alternative EventSource-based streaming (fallback method)
   * Uses standard EventSource API instead of async generator
   */
  streamConversationEventSource(
    sessionId: string,
    userInput: string,
    userId?: string,
    onEvent?: (event: StreamEvent) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void
  ): EventSource {
    const url = `${this.baseURL}/api/v1/intelligent-conversation/stream`

    chatLogger.info('Starting EventSource streaming', {
      sessionId,
      userInput: userInput.substring(0, 50) + '...',
      userId,
      url,
    })

    // Create EventSource with POST data (using a different approach)
    const eventSource = new EventSource(
      `${url}?session_id=${sessionId}&user_input=${encodeURIComponent(userInput)}&user_id=${userId || ''}`
    )

    eventSource.onopen = () => {
      chatLogger.info('EventSource connection opened', { sessionId })
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        chatLogger.info('EventSource message received', {
          type: data.type,
          hasContent: !!data.content,
          contentLength: data.content?.length,
        })

        if (onEvent) {
          onEvent(data)
        }
      } catch (parseError) {
        chatLogger.error('Failed to parse EventSource data', {
          data: event.data,
          parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
        })

        if (onError) {
          onError(new Error(`Parse error: ${parseError}`))
        }
      }
    }

    eventSource.onerror = (error) => {
      chatLogger.error('EventSource error', {
        error: error,
        sessionId,
        readyState: eventSource.readyState,
      })

      if (onError) {
        onError(new Error(`EventSource error: ${error}`))
      }
    }

    // Auto-close after 30 seconds to prevent hanging
    setTimeout(() => {
      if (eventSource.readyState !== EventSource.CLOSED) {
        chatLogger.info('EventSource auto-closing after timeout', { sessionId })
        eventSource.close()
        if (onComplete) {
          onComplete()
        }
      }
    }, 30000)

    return eventSource
  }
}

export const streamingChatService = new StreamingChatService()
