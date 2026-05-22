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

import { useClientContext } from '../../stores/clientContext'
import { createContextLogger } from '../../utils/logger'
import {
  type BelgianCompanyBootstrap,
  type BusinessTypeSearchResults,
  type BuyerProfilePreview,
  type BuyerReadyToolCard,
  type ClientCreateRequest,
  type ClientDataReadinessPreview,
  type CsvUploadRequest,
  dispatchAIChatChunk,
  type FieldUpdateParsed,
  type ImportReviewRequest,
  type IntegrationConnectRequest,
  type ListingCreateRequest,
  type ListingPreview,
  type MethodReadinessPreview,
  type MultiSelectRequest,
  makeChunkDispatchState,
  type OwnerProfileAnswerRequest,
  parseAIChatToolResults,
  type RegistrySearchResults,
  type ReportGenerationRequest,
  type SecureCredentialRequest,
  type SellabilityRunRequest,
  type SingleSelectRequest,
  type ValuationRunRequest,
  type ValuationSessionRequest,
} from './tool-results-parser'

const logger = createContextLogger('AIChatService')

function getRequestHeaders(includeContentType = true): Record<string, string> {
  const headers: Record<string, string> = {}
  if (includeContentType) headers['Content-Type'] = 'application/json'
  const contextHeaders = useClientContext.getState().getContextHeaders()
  if (Object.keys(contextHeaders).length > 0) {
    Object.assign(headers, contextHeaders)
  }
  return headers
}

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
    value?: unknown
    hint?: string
  }
  normalizations?: unknown[]
  formData?: unknown
  stream?: boolean
  /** Titan tool-scope claim. Venus defaults to owner-scope in the BFF. */
  audience?: 'advisor' | 'owner'
  /** Locale for fallback responses when AI is unavailable (en | nl) */
  locale?: 'en' | 'nl'
  /** Previous messages for conversation context (used as fallback if server history unavailable) */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface AIChatResponse {
  success: boolean
  content: string
  conversationId?: string
  /** Set when the server returned 402 (quota exhausted). */
  requires_upgrade?: boolean
  /** Set when Titan returned 412 because AI-processing consent is missing. */
  requires_consent?: boolean
  /** Set when the BFF cannot authenticate the browser session. */
  requires_auth?: boolean
  code?: string
  currentPolicyVersion?: string
  hasHistoricConsent?: boolean
  ai_credits_remaining?: number
  ai_credits_limit?: number
  fieldUpdates?: Array<{
    field: string
    value: FieldUpdateParsed['value']
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
  normalisationSuggestions?: unknown[]
  /**
   * Pending valuation-run proposals from the AI. Each entry surfaces an inline
   * "Run valuation now" action card; calculation only fires after the user
   * approves (consumes 5 credits via the existing /api/v2/valuations/calculate
   * saga). Status `blocked` means the AI tried to propose but required inputs
   * are missing — render as a hint, not an action.
   */
  valuationRunRequests?: ValuationRunRequest[]
  /**
   * Pending PDF-report generation proposals from the AI. Each entry surfaces an
   * inline "Generate PDF" action card; generation only fires after the user
   * approves and reuses the existing valuation (no extra credit). Status
   * `blocked` with reason `no_valuation_yet` means the AI tried to propose
   * before run_valuation produced results — render as a hint to compute first.
   */
  reportGenerationRequests?: ReportGenerationRequest[]
  /**
   * Pending Sellability-compute proposals from the AI. Each entry surfaces an
   * inline "Compute now" action card; the compute fires via the Venus proxy at
   * `/api/sellability/score` (which forwards to Titan's
   * `/api/v2/sellability/score`). Free (no credit). Status `blocked` with
   * reason `profile_incomplete` means Q1/Q2/Q3 must be filled in the owner
   * profile first — render as a hint, not an action.
   */
  sellabilityRunRequests?: SellabilityRunRequest[]
  /** Owner-profile answer proposals from Titan's owner onboarding flow. */
  ownerProfileAnswerRequests?: OwnerProfileAnswerRequest[]
  /** Accounting integration connection proposals. */
  integrationConnectRequests?: IntegrationConnectRequest[]
  /** Secure credential form proposals. Credentials must never be sent through chat text. */
  secureCredentialRequests?: SecureCredentialRequest[]
  /** CSV upload proposals for trial-balance or bulk-client import. */
  csvUploadRequests?: CsvUploadRequest[]
  /** Generic multi-choice agent forms. */
  multiSelectRequests?: MultiSelectRequest[]
  /** Generic single-choice agent forms. */
  singleSelectRequests?: SingleSelectRequest[]
  /** Advisor client creation proposals. */
  clientCreateRequests?: ClientCreateRequest[]
  /** Read-only Belgian KBO/NBB/CBSO public-data bootstrap cards. */
  belgianCompanyBootstraps?: BelgianCompanyBootstrap[]
  /** Advisor handoff proposals to open a client valuation session. */
  valuationSessionRequests?: ValuationSessionRequest[]
  /** Read-only advisor-client readiness before entering Mercury/Venus valuation. */
  clientDataReadinessPreviews?: ClientDataReadinessPreview[]
  /** Advisor handoff proposals to open Hermes import review. */
  importReviewRequests?: ImportReviewRequest[]
  /** Read-only valuation-method readiness before a paid ValuationIQ run. */
  methodReadinessPreviews?: MethodReadinessPreview[]
  /** Read-only anonymized marketplace-listing drafts from get_listing_preview. */
  listingPreviews?: ListingPreview[]
  /**
   * Pending marketplace-listing proposals from Titan's advisor-scoped
   * create_listing tool. Approve navigates back to Mercury's publish wizard;
   * the tool itself never writes a listing row.
   */
  listingCreateRequests?: ListingCreateRequest[]
  buyerProfilePreviews?: BuyerProfilePreview[]
  /** Buyer-ready/IM/legal/data-room workflow cards parsed from Titan tool envelopes. */
  buyerReadyCards?: BuyerReadyToolCard[]
  /** Read-only business-type discovery shortlist from search_business_types. */
  businessTypeSearchResults?: BusinessTypeSearchResults[]
  /**
   * Read-only registry-search picker results from `search_kbo_registry`
   * (BE) or `search_kvk_registry` (NL). The drawer renders these as a
   * clickable hit list mirroring the Mercury card. Click a row to send
   * a follow-up "Use {name} ({registry} {number})" message and let
   * the agent chain to the next step.
   */
  registrySearchResults?: RegistrySearchResults[]
  fallback?: boolean
  error?: string
}

export interface StreamCallbacks {
  onText?: (text: string) => void
  onToolStart?: (toolName: string) => void
  onToolResult?: (toolName: string, result: unknown) => void
  onDone?: (conversationId?: string) => void
  onError?: (error: string) => void
  /** Called instead of onError when the server returns 402 (quota exhausted). */
  onQuotaExhausted?: (credits: { remaining: number; limit: number }) => void
  /** Called instead of onError when Titan requires AI-processing consent. */
  onConsentRequired?: (payload: {
    message: string
    currentPolicyVersion?: string
    hasHistoricConsent?: boolean
  }) => void
  /** Called instead of onError when the BFF returns 401. */
  onAuthRequired?: (payload: { message: string }) => void
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
        headers: getRequestHeaders(),
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
          audience: request.audience,
          locale: request.locale,
          history: request.history,
        }),
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
          return this.generateLocalResponse(request)
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
        fallback: false,
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
          headers: getRequestHeaders(),
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
            audience: request.audience,
            locale: request.locale,
            history: request.history,
          }),
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

        if (!state.doneReceived) callbacks.onDone?.(state.resolvedConversationId || undefined)
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
        headers: getRequestHeaders(false),
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
      locale?: 'en' | 'nl'
    }
  ): Promise<AIChatResponse> {
    const locale = context.locale || 'nl'
    const helpMsg = locale === 'en' ? `Help me with ${label}` : `Help me met ${label}`
    try {
      const response = await fetch('/api/ai/suggestion', {
        method: 'POST',
        headers: getRequestHeaders(),
        credentials: 'include',
        body: JSON.stringify({ field, label, ...context }),
      })

      if (!response.ok) {
        return this.generateLocalResponse({
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
      return this.generateLocalResponse({
        message: helpMsg,
        fieldContext: { field, label, value: context.value },
        locale,
      })
    }
  }

  // ─────────────────────────────────────────
  // LOCAL FALLBACK (when Claude is unavailable)
  // ─────────────────────────────────────────

  private generateLocalResponse(request: AIChatRequest): AIChatResponse {
    const locale = request.locale === 'en' ? 'en' : 'nl'
    const content = request.message.toLowerCase()
    const calcImpact = (ebitdaDelta: number, m = 5.2) => ({
      ebitdaDelta,
      valuationDelta: Math.round(ebitdaDelta * m),
      multiple: m,
    })

    const F =
      locale === 'en'
        ? {
            ownerSalary: 'Owner salary',
            rent: 'Rent costs',
            salaryContent:
              'Based on sector data, a market-rate owner salary is between €100,000 and €140,000.\n\nI suggest €120,000 as the normalization basis.',
            rentContent:
              'Average office rent in Belgium: €80-150/m² per year.\nIndustrial space: €40-80/m² per year.',
            normsContent:
              'Relevant normalizations:\n\n1. **Owner salary** - Market rate\n2. **Rent costs** - Market value\n3. **Vehicle costs** - Private use\n4. **One-time costs** - Legal etc.\n\n**Quick commands:**\n- *"Normalize owner salary to €60k"*\n- *"Set rent costs to €24k"*',
            defaultContent: (name: string) =>
              `Thanks for your question about ${name}.\n\n**Quick normalization commands:**\n• *"Normalize owner salary to €60k"*\n• *"Set rent costs to €24k"*\n• *"Adjust vehicle costs to €18k"*`,
          }
        : {
            ownerSalary: 'Eigenaarssalaris',
            rent: 'Huurkosten',
            salaryContent:
              'Op basis van sectordata is een marktconform eigenaarssalaris tussen €100.000 en €140.000.\n\nIk stel €120.000 als normalisatiebasis voor.',
            rentContent:
              'Gemiddelde kantoorhuur in België: €80-150/m² per jaar.\nIndustriële ruimte: €40-80/m² per jaar.',
            normsContent:
              'Relevante normalisaties:\n\n1. **Eigenaarssalaris** - Marktconform niveau\n2. **Huurkosten** - Marktwaarde\n3. **Autokosten** - Privégebruik\n4. **Eenmalige kosten** - Juridisch etc.\n\n**Snelle commando\'s:**\n- *"Normaliseer eigenaarssalaris naar €60k"*\n- *"Zet huurkosten op €24k"*',
            defaultContent: (name: string) =>
              `Bedankt voor je vraag over ${name}.\n\n**Snelle normalisatie commando's:**\n• *"Normaliseer eigenaarssalaris naar €60k"*\n• *"Zet huurkosten op €24k"*\n• *"Pas autokosten aan naar €18k"*`,
          }

    if (
      content.includes('eigenaarssalaris') ||
      content.includes('salaris') ||
      (content.includes('owner') && content.includes('salary'))
    ) {
      return {
        success: true,
        content: F.salaryContent,
        fieldUpdates: [
          {
            field: 'ownerSalary',
            value: 120000,
            label: F.ownerSalary,
            grootboekCode: '620',
            source: 'ai',
            confidence: 'high',
            impact: calcImpact(60000),
          },
        ],
        fallback: true,
      }
    }

    if (content.includes('huur') || content.includes('kantoor') || content.includes('rent')) {
      return {
        success: true,
        content: F.rentContent,
        fieldUpdates: [
          {
            field: 'rent',
            value: 48000,
            label: F.rent,
            grootboekCode: '610',
            source: 'ai',
            confidence: 'medium',
            impact: calcImpact(24000),
          },
        ],
        fallback: true,
      }
    }

    if (content.includes('normalis') || content.includes('normalize')) {
      return {
        success: true,
        content: F.normsContent,
        fallback: true,
      }
    }

    const companyName = request.companyName || (locale === 'en' ? 'this company' : 'dit bedrijf')
    return {
      success: true,
      content: F.defaultContent(companyName),
      fallback: true,
    }
  }
}

export const aiChatService = AIChatServiceImpl.getInstance()
