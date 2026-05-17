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
  type BuyerProfilePreview,
  type ClientDataReadinessPreview,
  dispatchAIChatChunk,
  type ListingPreview,
  type MethodReadinessPreview,
  makeChunkDispatchState,
  parseAIChatToolResults,
  type RegistrySearchResults,
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
  ai_credits_remaining?: number
  ai_credits_limit?: number
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
  /**
   * Pending valuation-run proposals from the AI. Each entry surfaces an inline
   * "Run valuation now" action card; calculation only fires after the user
   * approves (consumes 1 credit via the existing /api/v2/valuations/calculate
   * saga). Status `blocked` means the AI tried to propose but required inputs
   * are missing — render as a hint, not an action.
   */
  valuationRunRequests?: Array<{
    status: 'pending_approval' | 'blocked'
    reportId?: string
    methods?: string[] | null
    estimatedCredits?: number
    inputsSummary?: {
      business_name: string | null
      business_type: string | null
      industry: string | null
      revenue: string | null
      ebitda: string | null
      ebitda_normalized: string | null
      pending_normalizations: number
      applied_normalizations: number
    }
    note?: string | null
    reason?: string
    missing?: string[]
    message?: string
  }>
  /**
   * Pending PDF-report generation proposals from the AI. Each entry surfaces an
   * inline "Generate PDF" action card; generation only fires after the user
   * approves and reuses the existing valuation (no extra credit). Status
   * `blocked` with reason `no_valuation_yet` means the AI tried to propose
   * before run_valuation produced results — render as a hint to compute first.
   */
  reportGenerationRequests?: Array<{
    status: 'pending_approval' | 'blocked'
    reportId?: string
    estimatedCredits?: number
    resultSummary?: {
      business_name: string | null
      business_type: string | null
      valuation_method: string | null
      currency: string
      midpoint: number | null
      min: number | null
      max: number | null
      confidence_score: number | null
      calculated_at: string | null
    }
    note?: string | null
    reason?: string
    message?: string
  }>
  /**
   * Pending Sellability-compute proposals from the AI. Each entry surfaces an
   * inline "Compute now" action card; the compute fires via the Venus proxy at
   * `/api/sellability/score` (which forwards to Titan's
   * `/api/v2/sellability/score`). Free (no credit). Status `blocked` with
   * reason `profile_incomplete` means Q1/Q2/Q3 must be filled in the owner
   * profile first — render as a hint, not an action.
   */
  sellabilityRunRequests?: Array<{
    status: 'pending_approval' | 'blocked'
    estimatedCredits?: number
    answers?: {
      q1_top3_concentration_pct: number | null
      q2_contracted_share: string | null
      q3_books_cleanliness: string | null
    }
    currentScore?: {
      score: number
      band: string
      computed_at: string | Date
    } | null
    note?: string | null
    reason?: string
    missing?: string[]
    message?: string
  }>
  /** Read-only Belgian KBO/NBB/CBSO public-data bootstrap cards. */
  belgianCompanyBootstraps?: BelgianCompanyBootstrap[]
  /** Read-only advisor-client readiness before entering Mercury/Venus valuation. */
  clientDataReadinessPreviews?: ClientDataReadinessPreview[]
  /** Read-only valuation-method readiness before a paid ValuationIQ run. */
  methodReadinessPreviews?: MethodReadinessPreview[]
  /** Read-only anonymized marketplace-listing drafts from get_listing_preview. */
  listingPreviews?: ListingPreview[]
  /**
   * Pending marketplace-listing proposals from Titan's advisor-scoped
   * create_listing tool. Approve navigates back to Mercury's publish wizard;
   * the tool itself never writes a listing row.
   */
  listingCreateRequests?: Array<{
    status: 'pending_approval' | 'auto_approved' | 'blocked'
    reportId?: string
    accountantCustomerId?: string | null
    visibility?: 'public' | 'private'
    valuationSummary?: {
      business_name?: string | null
      business_type?: string | null
      industry?: string | null
      currency?: string
      midpoint?: string | null
      min?: string | null
      max?: string | null
    }
    note?: string | null
    reason?: string
    message?: string
  }>
  buyerProfilePreviews?: BuyerProfilePreview[]
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
          history: request.history,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))

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
            error: errorData.message || 'AI credit limit reached. Upgrade your plan to continue.',
          }
        }

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

      // Extract tool results — pure-function parser tested in
      // tool-results-parser.test.ts. Locks the Venus-rendered envelope
      // contract + defensive drops for malformed payloads.
      if (data.toolResults) {
        const parsed = parseAIChatToolResults(data.toolResults)
        if (parsed.normalisationSuggestions.length > 0) {
          aiResponse.normalisationSuggestions = parsed.normalisationSuggestions
        }
        if (parsed.fieldUpdates.length > 0) {
          aiResponse.fieldUpdates = parsed.fieldUpdates as any
        }
        if (parsed.valuationRunRequests.length > 0) {
          aiResponse.valuationRunRequests = parsed.valuationRunRequests as any
        }
        if (parsed.reportGenerationRequests.length > 0) {
          aiResponse.reportGenerationRequests = parsed.reportGenerationRequests as any
        }
        if (parsed.sellabilityRunRequests.length > 0) {
          aiResponse.sellabilityRunRequests = parsed.sellabilityRunRequests as any
        }
        if (parsed.belgianCompanyBootstraps.length > 0) {
          aiResponse.belgianCompanyBootstraps = parsed.belgianCompanyBootstraps
        }
        if (parsed.clientDataReadinessPreviews.length > 0) {
          aiResponse.clientDataReadinessPreviews = parsed.clientDataReadinessPreviews
        }
        if (parsed.methodReadinessPreviews.length > 0) {
          aiResponse.methodReadinessPreviews = parsed.methodReadinessPreviews
        }
        if (parsed.listingPreviews.length > 0) {
          aiResponse.listingPreviews = parsed.listingPreviews
        }
        if (parsed.listingCreateRequests.length > 0) {
          aiResponse.listingCreateRequests = parsed.listingCreateRequests as any
        }
        if (parsed.buyerProfilePreviews.length > 0) {
          aiResponse.buyerProfilePreviews = parsed.buyerProfilePreviews
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
            history: request.history,
          }),
          signal: controller.signal,
        })

        if (!response.ok || !response.body) {
          // 402: quota exhausted — call onQuotaExhausted if wired, otherwise
          // fall through to onError so existing callers aren't broken.
          if (response.status === 402) {
            const errorData = await response.json().catch(() => ({}))
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
              (errorData as any).message ||
                'AI credit limit reached. Upgrade your plan to continue.'
            )
            return
          }
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
              dispatchAIChatChunk(chunk, state, callbacks)
            } catch {
              // Skip malformed JSON chunks
            }
          }
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
      value?: any
      locale?: 'en' | 'nl'
    }
  ): Promise<AIChatResponse> {
    const locale = context.locale || 'nl'
    const helpMsg = locale === 'en' ? `Help me with ${label}` : `Help me met ${label}`
    try {
      const response = await fetch('/api/ai/suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
