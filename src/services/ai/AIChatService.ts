/**
 * AI Chat Service
 *
 * Client-side service for communicating with Titan's Claude-powered AI.
 * Supports streaming with tool use events (tool_start, tool_result).
 * Conversation history is managed server-side; only the latest message is sent.
 *
 * Architecture:
 * Venus Client → Next.js Proxy (/api/ai/chat) → Titan (/api/v2/ai/stream) → Claude + Tools
 *
 * When accountant is in client view, adds X-Client-User-Id, X-Accountant-User-Id,
 * X-Relationship-Id so Titan resolves session/report for the client.
 */

import { createContextLogger } from '../../utils/logger'
import { buildAIChatRequestPayload, getAIChatRequestHeaders } from './AIChatRequestPayload'
import type { AIChatResponse, StreamCallbacks } from './AIChatResponseTypes'
import type { AIChatRequest, AssistantIntent } from './AIChatTypes'
import { generateContextAwareLocalResponse } from './local-chat-fallback'
import {
  dispatchAIChatChunk,
  makeChunkDispatchState,
  parseAIChatToolResults,
} from './tool-results-parser'

const logger = createContextLogger('AIChatService')

export type { AssistantIntent }
export type { AIChatResponse, StreamCallbacks } from './AIChatResponseTypes'
export type { AIChatRequest } from './AIChatTypes'

function getEnvelopeString(envelope: Record<string, unknown>, key: string): string | null {
  const value = envelope[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function getEnvelopeBoolean(envelope: Record<string, unknown>, key: string): boolean | undefined {
  const value = envelope[key]
  return typeof value === 'boolean' ? value : undefined
}

function isConsentRequiredEnvelope(status: number, envelope: Record<string, unknown>): boolean {
  return status === 412 && envelope.code === 'AI_CONSENT_REQUIRED'
}

function isBackendFailureEnvelope(envelope: Record<string, unknown>): boolean {
  return envelope.code === 'AI_BACKEND_UNREACHABLE' || envelope.code === 'AI_BACKEND_TIMEOUT'
}

function readNextSseFrame(buffer: string): { frame: string; rest: string } | null {
  const match = /\r?\n\r?\n/.exec(buffer)
  if (!match || match.index === undefined) return null
  return {
    frame: buffer.slice(0, match.index),
    rest: buffer.slice(match.index + match[0].length),
  }
}

function extractSseData(frame: string): string | null {
  const dataLines: string[] = []

  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith(':') || !line.startsWith('data:')) continue
    const value = line.slice(5)
    dataLines.push(value.startsWith(' ') ? value.slice(1) : value)
  }

  if (dataLines.length === 0) return null
  const data = dataLines.join('\n').trim()
  return data.length > 0 ? data : null
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
        headers: getAIChatRequestHeaders(),
        credentials: 'include',
        body: JSON.stringify(
          buildAIChatRequestPayload(request, { stream: request.stream === true })
        ),
      })

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>

        // 402: quota exhausted — never fall back to fake local content.
        // Return a structured response so callers can show the upgrade CTA.
        if (response.status === 402 && errorData.requires_upgrade) {
          logger.info('[AIChatService] AI quota exhausted (402), returning upgrade signal')
          return {
            success: false,
            content: '',
            requires_upgrade: true,
            ai_credits_remaining:
              typeof errorData.ai_credits_remaining === 'number'
                ? errorData.ai_credits_remaining
                : 0,
            ai_credits_limit:
              typeof errorData.ai_credits_limit === 'number' ? errorData.ai_credits_limit : 0,
            error:
              getEnvelopeString(errorData, 'message') ||
              'AI credit limit reached. Upgrade your plan to continue.',
          }
        }

        if (isConsentRequiredEnvelope(response.status, errorData)) {
          const message =
            getEnvelopeString(errorData, 'message') ||
            'AI processing consent is required before this assistant can process your inputs.'
          logger.info('[AIChatService] AI consent required (412), returning consent signal')
          return {
            success: false,
            content: '',
            requires_consent: true,
            code: 'AI_CONSENT_REQUIRED',
            currentPolicyVersion: getEnvelopeString(errorData, 'currentPolicyVersion') || undefined,
            hasHistoricConsent: getEnvelopeBoolean(errorData, 'hasHistoricConsent'),
            error: message,
          }
        }

        if (response.status === 401) {
          const message =
            getEnvelopeString(errorData, 'message') ||
            getEnvelopeString(errorData, 'error') ||
            'Authentication is required before this assistant can process your inputs.'
          logger.info('[AIChatService] AI auth required (401), returning auth signal')
          return {
            success: false,
            content: '',
            requires_auth: true,
            code: 'AUTH_REQUIRED',
            error: message,
          }
        }

        if (isBackendFailureEnvelope(errorData)) {
          const message =
            getEnvelopeString(errorData, 'error') ||
            getEnvelopeString(errorData, 'message') ||
            'AI service unavailable'
          logger.info('[AIChatService] AI backend unavailable, returning actionable error')
          return {
            success: false,
            content: '',
            code: getEnvelopeString(errorData, 'code') || 'AI_BACKEND_UNREACHABLE',
            error: message,
          }
        }

        if (errorData.fallback || response.status === 503) {
          logger.info('[AIChatService] AI unavailable, using local fallback')
          return generateContextAwareLocalResponse(request)
        }

        throw new Error(
          getEnvelopeString(errorData, 'error') || `AI request failed: ${response.status}`
        )
      }

      const data = await response.json()

      const aiResponse: AIChatResponse = {
        success: true,
        content: data.response || data.content || data.message || '',
        conversationId: data.conversationId,
        fallback: Boolean(data.fallback),
      }

      // Extract tool results — pure-function parser tested in
      // tool-results-parser.test.ts. Locks the Venus-rendered envelope
      // contract + defensive drops for malformed payloads.
      if (data.toolResults) {
        const parsed = parseAIChatToolResults(data.toolResults)
        if (parsed.normalisationSuggestions.length > 0) {
          aiResponse.normalisationSuggestions = parsed.normalisationSuggestions
        }
        if (parsed.fieldUpdates.length > 0) {
          aiResponse.fieldUpdates = parsed.fieldUpdates
        }
        if (parsed.valuationRunRequests.length > 0) {
          aiResponse.valuationRunRequests = parsed.valuationRunRequests
        }
        if (parsed.reportGenerationRequests.length > 0) {
          aiResponse.reportGenerationRequests = parsed.reportGenerationRequests
        }
        if (parsed.sellabilityRunRequests.length > 0) {
          aiResponse.sellabilityRunRequests = parsed.sellabilityRunRequests
        }
        if (parsed.ownerProfileAnswerRequests.length > 0) {
          aiResponse.ownerProfileAnswerRequests = parsed.ownerProfileAnswerRequests
        }
        if (parsed.integrationConnectRequests.length > 0) {
          aiResponse.integrationConnectRequests = parsed.integrationConnectRequests
        }
        if (parsed.integrationSyncRequests.length > 0) {
          aiResponse.integrationSyncRequests = parsed.integrationSyncRequests
        }
        if (parsed.syncStatusPreviews.length > 0) {
          aiResponse.syncStatusPreviews = parsed.syncStatusPreviews
        }
        if (parsed.ownerInviteAccountantRequests.length > 0) {
          aiResponse.ownerInviteAccountantRequests = parsed.ownerInviteAccountantRequests
        }
        if (parsed.ownerReminderRequests.length > 0) {
          aiResponse.ownerReminderRequests = parsed.ownerReminderRequests
        }
        if (parsed.listingVisibilityRequests.length > 0) {
          aiResponse.listingVisibilityRequests = parsed.listingVisibilityRequests
        }
        if (parsed.shareTokenRequests.length > 0) {
          aiResponse.shareTokenRequests = parsed.shareTokenRequests
        }
        if (parsed.shareTokenRevokeRequests.length > 0) {
          aiResponse.shareTokenRevokeRequests = parsed.shareTokenRevokeRequests
        }
        if (parsed.valuationMethodPreferenceRequests.length > 0) {
          aiResponse.valuationMethodPreferenceRequests = parsed.valuationMethodPreferenceRequests
        }
        if (parsed.acknowledgeWarningRequests.length > 0) {
          aiResponse.acknowledgeWarningRequests = parsed.acknowledgeWarningRequests
        }
        if (parsed.secureCredentialRequests.length > 0) {
          aiResponse.secureCredentialRequests = parsed.secureCredentialRequests
        }
        if (parsed.csvUploadRequests.length > 0) {
          aiResponse.csvUploadRequests = parsed.csvUploadRequests
        }
        if (parsed.multiSelectRequests.length > 0) {
          aiResponse.multiSelectRequests = parsed.multiSelectRequests
        }
        if (parsed.singleSelectRequests.length > 0) {
          aiResponse.singleSelectRequests = parsed.singleSelectRequests
        }
        if (parsed.clientCreateRequests.length > 0) {
          aiResponse.clientCreateRequests = parsed.clientCreateRequests
        }
        if (parsed.belgianCompanyBootstraps.length > 0) {
          aiResponse.belgianCompanyBootstraps = parsed.belgianCompanyBootstraps
        }
        if (parsed.valuationSessionRequests.length > 0) {
          aiResponse.valuationSessionRequests = parsed.valuationSessionRequests
        }
        if (parsed.clientDataReadinessPreviews.length > 0) {
          aiResponse.clientDataReadinessPreviews = parsed.clientDataReadinessPreviews
        }
        if (parsed.importReviewRequests.length > 0) {
          aiResponse.importReviewRequests = parsed.importReviewRequests
        }
        if (parsed.methodReadinessPreviews.length > 0) {
          aiResponse.methodReadinessPreviews = parsed.methodReadinessPreviews
        }
        if (parsed.listingPreviews.length > 0) {
          aiResponse.listingPreviews = parsed.listingPreviews
        }
        if (parsed.listingCreateRequests.length > 0) {
          aiResponse.listingCreateRequests = parsed.listingCreateRequests
        }
        if (parsed.buyerProfilePreviews.length > 0) {
          aiResponse.buyerProfilePreviews = parsed.buyerProfilePreviews
        }
        if (parsed.buyerReadyCards.length > 0) {
          aiResponse.buyerReadyCards = parsed.buyerReadyCards
        }
        if (parsed.businessTypeSearchResults.length > 0) {
          aiResponse.businessTypeSearchResults = parsed.businessTypeSearchResults
        }
        if (parsed.registrySearchResults.length > 0) {
          aiResponse.registrySearchResults = parsed.registrySearchResults
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
      return generateContextAwareLocalResponse(request)
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
          headers: getAIChatRequestHeaders(),
          credentials: 'include',
          body: JSON.stringify(buildAIChatRequestPayload(request, { stream: true })),
          signal: controller.signal,
        })

        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as Record<string, unknown>

          // 402: quota exhausted — call onQuotaExhausted if wired, otherwise
          // fall through to onError so existing callers aren't broken.
          if (response.status === 402) {
            if (errorData.requires_upgrade && callbacks.onQuotaExhausted) {
              callbacks.onQuotaExhausted({
                remaining:
                  typeof errorData.ai_credits_remaining === 'number'
                    ? errorData.ai_credits_remaining
                    : 0,
                limit:
                  typeof errorData.ai_credits_limit === 'number' ? errorData.ai_credits_limit : 0,
              })
              return
            }
            callbacks.onError?.(
              getEnvelopeString(errorData, 'message') ||
                'AI credit limit reached. Upgrade your plan to continue.'
            )
            return
          }

          if (isConsentRequiredEnvelope(response.status, errorData)) {
            callbacks.onConsentRequired?.({
              message:
                getEnvelopeString(errorData, 'message') ||
                'AI processing consent is required before this assistant can process your inputs.',
              currentPolicyVersion:
                getEnvelopeString(errorData, 'currentPolicyVersion') || undefined,
              hasHistoricConsent: getEnvelopeBoolean(errorData, 'hasHistoricConsent'),
            })
            return
          }

          if (response.status === 401) {
            const message =
              getEnvelopeString(errorData, 'message') ||
              getEnvelopeString(errorData, 'error') ||
              'Authentication is required before this assistant can process your inputs.'
            if (callbacks.onAuthRequired) {
              callbacks.onAuthRequired({ message })
            } else {
              callbacks.onError?.(message)
            }
            return
          }

          callbacks.onError?.(
            getEnvelopeString(errorData, 'error') ||
              getEnvelopeString(errorData, 'message') ||
              'AI service unavailable'
          )
          return
        }

        if (!response.body) {
          callbacks.onError?.('AI service unavailable')
          return
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        // State + callback-dispatcher are extracted to `tool-results-parser`
        // so the 5-type chunk routing + conversationId capture + done-flag
        // accounting are pinned by tests rather than inline-untested code.
        const state = makeChunkDispatchState()
        const dispatchSseFrame = (frame: string) => {
          const dataStr = extractSseData(frame)
          if (!dataStr || dataStr === '[DONE]') return

          try {
            const chunk = JSON.parse(dataStr)
            dispatchAIChatChunk(chunk, state, callbacks)
          } catch {
            // Skip malformed JSON chunks
          }
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          let nextFrame = readNextSseFrame(buffer)
          while (nextFrame) {
            dispatchSseFrame(nextFrame.frame)
            buffer = nextFrame.rest
            nextFrame = readNextSseFrame(buffer)
          }
        }

        buffer += decoder.decode()
        if (buffer.trim().length > 0) {
          dispatchSseFrame(buffer)
        }

        if (!state.doneReceived) {
          callbacks.onDone?.(state.resolvedConversationId || undefined, { incomplete: true })
        }
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
  async loadHistory(reportId: string): Promise<{
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
        headers: getAIChatRequestHeaders(false),
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
      value?: unknown
      locale?: 'en' | 'nl' | 'fr'
    }
  ): Promise<AIChatResponse> {
    const locale = context.locale || 'nl'
    const helpMsg =
      locale === 'fr'
        ? `Aidez-moi avec ${label}`
        : locale === 'en'
          ? `Help me with ${label}`
          : `Help me met ${label}`
    try {
      const response = await fetch('/api/ai/suggestion', {
        method: 'POST',
        headers: getAIChatRequestHeaders(),
        credentials: 'include',
        body: JSON.stringify({ field, label, ...context }),
      })

      if (!response.ok) {
        return generateContextAwareLocalResponse({
          message: helpMsg,
          fieldContext: { field, label, value: context.value },
          locale,
        })
      }

      const data = await response.json()
      return {
        success: true,
        content: data.suggestion || data.response || '',
        fallback: false,
      }
    } catch {
      return generateContextAwareLocalResponse({
        message: helpMsg,
        fieldContext: { field, label, value: context.value },
        locale,
      })
    }
  }
}

export const aiChatService = AIChatServiceImpl.getInstance()
