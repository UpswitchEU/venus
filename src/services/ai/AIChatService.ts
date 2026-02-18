/**
 * AI Chat Service
 *
 * Client-side service for communicating with Titan's Claude-powered AI.
 * Supports streaming with tool use events (tool_start, tool_result).
 * Conversation history is managed server-side; only the latest message is sent.
 *
 * Architecture:
 * Venus Client → Next.js Proxy (/api/ai/chat) → Titan (/api/v2/ai/stream) → Claude + Tools
 */

import { createContextLogger } from '../../utils/logger'

const logger = createContextLogger('AIChatService')

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface AIChatRequest {
  message: string
  sessionId?: string
  reportId?: string
  companyName?: string
  conversationId?: string
  fieldContext?: {
    field: string
    label: string
    value?: any
    hint?: string
  }
  normalizations?: any[]
  formData?: any
  stream?: boolean
  /** Previous messages for conversation context (used as fallback if server history unavailable) */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface AIChatResponse {
  success: boolean
  content: string
  conversationId?: string
  fieldUpdates?: Array<{
    field: string
    value: number
    label: string
    grootboekCode?: string
    source?: 'ai' | 'manual' | 'yuki' | 'exact' | 'kbo'
    confidence?: 'high' | 'medium' | 'low'
    impact?: {
      ebitdaDelta: number
      valuationDelta: number
      multiple?: number
    }
  }>
  normalisationSuggestions?: any[]
  fallback?: boolean
  error?: string
}

export interface StreamCallbacks {
  onText?: (text: string) => void
  onToolStart?: (toolName: string) => void
  onToolResult?: (toolName: string, result: unknown) => void
  onDone?: (conversationId?: string) => void
  onError?: (error: string) => void
}

// ─────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────

class AIChatServiceImpl {
  private static instance: AIChatServiceImpl

  static getInstance(): AIChatServiceImpl {
    if (!AIChatServiceImpl.instance) {
      AIChatServiceImpl.instance = new AIChatServiceImpl()
    }
    return AIChatServiceImpl.instance
  }

  /**
   * Send a chat message with streaming support.
   * Parses SSE events for text, tool_start, tool_result, done, and error.
   */
  async sendMessage(request: AIChatRequest): Promise<AIChatResponse> {
    try {
      logger.info('[AIChatService] Sending message to AI', {
        hasSessionId: !!request.sessionId,
        hasFieldContext: !!request.fieldContext,
        messageLength: request.message.length,
      })

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: request.message,
          sessionId: request.sessionId,
          reportId: request.reportId || request.sessionId,
          companyName: request.companyName,
          conversationId: request.conversationId,
          fieldContext: request.fieldContext,
          normalizations: request.normalizations,
          formData: request.formData,
          stream: request.stream === true ? true : false,
          history: request.history,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))

        if (errorData.fallback || response.status === 503) {
          logger.info('[AIChatService] AI unavailable, using local fallback')
          return this.generateLocalResponse(request)
        }

        throw new Error(errorData.error || `AI request failed: ${response.status}`)
      }

      const data = await response.json()

      const aiResponse: AIChatResponse = {
        success: true,
        content: data.response || data.content || data.message || '',
        conversationId: data.conversationId,
        fallback: false,
      }

      // Extract tool results for normalization suggestions and field updates
      if (data.toolResults) {
        for (const tr of data.toolResults) {
          if (tr.type === 'normalization_suggestion') {
            if (!aiResponse.normalisationSuggestions) aiResponse.normalisationSuggestions = []
            aiResponse.normalisationSuggestions.push(tr.data)
          }
          if (tr.type === 'field_update') {
            if (!aiResponse.fieldUpdates) aiResponse.fieldUpdates = []
            const update = (tr.data as any)?.update
            if (update) {
              aiResponse.fieldUpdates.push({
                field: update.field,
                value: update.value,
                label: update.label,
                source: 'ai',
                confidence: update.confidence,
              })
            }
          }
        }
      }

      // Legacy format support
      if (data.fieldUpdates) aiResponse.fieldUpdates = data.fieldUpdates
      if (data.normalisationSuggestions)
        aiResponse.normalisationSuggestions = data.normalisationSuggestions

      return aiResponse
    } catch (error) {
      logger.warn('[AIChatService] AI request failed, falling back to local', {
        error: error instanceof Error ? error.message : String(error),
      })
      return this.generateLocalResponse(request)
    }
  }

  /**
   * Stream a chat message with real-time SSE events.
   * Returns a cleanup function to abort the stream.
   */
  streamMessage(request: AIChatRequest, callbacks: StreamCallbacks): () => void {
    const controller = new AbortController()

    ;(async () => {
      try {
        const response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            message: request.message,
            sessionId: request.sessionId,
            reportId: request.reportId || request.sessionId,
            companyName: request.companyName,
            conversationId: request.conversationId,
            fieldContext: request.fieldContext,
            normalizations: request.normalizations,
            formData: request.formData,
            stream: true,
            history: request.history,
          }),
          signal: controller.signal,
        })

        if (!response.ok || !response.body) {
          callbacks.onError?.('AI service unavailable')
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let doneReceived = false
        let resolvedConversationId = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const dataStr = line.slice(5).trim()
            if (!dataStr || dataStr === '[DONE]') continue

            try {
              const chunk = JSON.parse(dataStr)

              switch (chunk.type) {
                case 'text':
                  if (chunk.conversationId) resolvedConversationId = chunk.conversationId
                  if (chunk.content) callbacks.onText?.(chunk.content)
                  break
                case 'tool_start':
                  callbacks.onToolStart?.(chunk.toolName)
                  break
                case 'tool_result':
                  callbacks.onToolResult?.(chunk.toolName, chunk.toolResult)
                  break
                case 'done':
                  doneReceived = true
                  callbacks.onDone?.(chunk.conversationId || resolvedConversationId)
                  break
                case 'error':
                  doneReceived = true
                  callbacks.onError?.(chunk.error || 'Unknown error')
                  break
              }
            } catch {
              // Skip malformed JSON chunks
            }
          }
        }

        if (!doneReceived) callbacks.onDone?.(resolvedConversationId || undefined)
      } catch (error) {
        if (controller.signal.aborted) return
        callbacks.onError?.(error instanceof Error ? error.message : 'Stream failed')
      }
    })()

    return () => controller.abort()
  }

  /**
   * Load conversation history from the server.
   */
  async loadHistory(
    reportId: string,
  ): Promise<{
    conversationId: string | null
    messages: Array<{
      id: string
      role: string
      content: string
      tool_name?: string
      tool_result?: unknown
      created_at: string
    }>
  }> {
    try {
      const response = await fetch(`/api/ai/history?reportId=${encodeURIComponent(reportId)}`, {
        credentials: 'include',
      })

      if (!response.ok) {
        return { conversationId: null, messages: [] }
      }

      const data = await response.json()
      return {
        conversationId: data.conversationId || null,
        messages: data.messages || [],
      }
    } catch {
      return { conversationId: null, messages: [] }
    }
  }

  /**
   * Get AI-powered suggestion for a specific field.
   */
  async getFieldSuggestion(
    field: string,
    label: string,
    context: {
      companyName?: string
      industry?: string
      revenue?: number
      value?: any
    },
  ): Promise<AIChatResponse> {
    try {
      const response = await fetch('/api/ai/suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ field, label, ...context }),
      })

      if (!response.ok) {
        return this.generateLocalResponse({
          message: `Help me met ${label}`,
          fieldContext: { field, label, value: context.value },
        })
      }

      const data = await response.json()
      return {
        success: true,
        content: data.suggestion || data.response || '',
        fallback: false,
      }
    } catch {
      return this.generateLocalResponse({
        message: `Help me met ${label}`,
        fieldContext: { field, label, value: context.value },
      })
    }
  }

  // ─────────────────────────────────────────
  // LOCAL FALLBACK (when Claude is unavailable)
  // ─────────────────────────────────────────

  private generateLocalResponse(request: AIChatRequest): AIChatResponse {
    const content = request.message.toLowerCase()
    const calcImpact = (ebitdaDelta: number, m = 5.2) => ({
      ebitdaDelta,
      valuationDelta: Math.round(ebitdaDelta * m),
      multiple: m,
    })

    if (content.includes('eigenaarssalaris') || content.includes('salaris')) {
      return {
        success: true,
        content: `Op basis van sectordata is een marktconform eigenaarssalaris tussen €100.000 en €140.000.\n\nIk stel €120.000 als normalisatiebasis voor.`,
        fieldUpdates: [
          {
            field: 'ownerSalary',
            value: 120000,
            label: 'Eigenaarssalaris',
            grootboekCode: '620',
            source: 'ai',
            confidence: 'high',
            impact: calcImpact(60000),
          },
        ],
        fallback: true,
      }
    }

    if (content.includes('huur') || content.includes('kantoor')) {
      return {
        success: true,
        content: `Gemiddelde kantoorhuur in België: €80-150/m² per jaar.\nIndustriële ruimte: €40-80/m² per jaar.`,
        fieldUpdates: [
          {
            field: 'rent',
            value: 48000,
            label: 'Huurkosten',
            grootboekCode: '613',
            source: 'ai',
            confidence: 'medium',
            impact: calcImpact(24000),
          },
        ],
        fallback: true,
      }
    }

    if (content.includes('normalis')) {
      return {
        success: true,
        content: `Relevante normalisaties:\n\n1. **Eigenaarssalaris** - Marktconform niveau\n2. **Huurkosten** - Marktwaarde\n3. **Autokosten** - Privégebruik\n4. **Eenmalige kosten** - Juridisch etc.\n\n**Snelle commando's:**\n- *"Normaliseer eigenaarssalaris naar €60k"*\n- *"Zet huurkosten op €24k"*`,
        fallback: true,
      }
    }

    return {
      success: true,
      content: `Bedankt voor je vraag over ${request.companyName || 'dit bedrijf'}.\n\n**Snelle normalisatie commando's:**\n• *"Normaliseer eigenaarssalaris naar €60k"*\n• *"Zet huurkosten op €24k"*\n• *"Pas autokosten aan naar €18k"*`,
      fallback: true,
    }
  }
}

export const aiChatService = AIChatServiceImpl.getInstance()
