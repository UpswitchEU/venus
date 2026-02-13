/**
 * AI Chat Service
 * 
 * Client-side service for communicating with Titan's Claude-powered AI.
 * Handles chat messages, field suggestions, and normalization advice.
 * Falls back to local keyword-based responses when AI is unavailable.
 * 
 * Architecture:
 * Venus Client → Next.js Proxy (/api/ai/chat) → Titan (/api/v2/ai/chat) → Claude
 * 
 * @module services/ai/AIChatService
 */

import { createContextLogger } from '../../utils/logger'

const logger = createContextLogger('AIChatService')

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface AIChatRequest {
  message: string
  sessionId?: string
  companyName?: string
  fieldContext?: {
    field: string
    label: string
    value?: any
    hint?: string
  }
  normalizations?: any[]
  formData?: any
  stream?: boolean
  /** Previous messages for conversation context */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface AIChatResponse {
  success: boolean
  content: string
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
   * Send a chat message to the AI assistant.
   * Falls back to local responses if AI is unavailable.
   */
  async sendMessage(request: AIChatRequest): Promise<AIChatResponse> {
    try {
      logger.info('[AIChatService] Sending message to AI', {
        hasSessionId: !!request.sessionId,
        hasFieldContext: !!request.fieldContext,
        messageLength: request.message.length,
      })

      // Default to non-streaming for structured tool responses (fieldUpdates, normalisationSuggestions).
      // Streaming mode does not support Claude tool_use blocks — only use for real-time text display.
      const useStream = request.stream === true

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: request.message,
          sessionId: request.sessionId,
          companyName: request.companyName,
          fieldContext: request.fieldContext,
          normalizations: request.normalizations,
          formData: request.formData,
          stream: useStream,
          history: request.history,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        
        // If fallback flag is set or service unavailable, use local responses
        if (errorData.fallback || response.status === 503) {
          logger.info('[AIChatService] AI unavailable, using local fallback')
          return this.generateLocalResponse(request)
        }

        throw new Error(errorData.error || `AI request failed: ${response.status}`)
      }

      const data = await response.json()

      // Normalize Titan response to our format
      return {
        success: true,
        content: data.response || data.content || data.message || '',
        fieldUpdates: data.fieldUpdates || data.field_updates || undefined,
        normalisationSuggestions: data.normalisationSuggestions || undefined,
        fallback: false,
      }
    } catch (error) {
      logger.warn('[AIChatService] AI request failed, falling back to local', {
        error: error instanceof Error ? error.message : String(error),
      })
      return this.generateLocalResponse(request)
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
    }
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

    // Salary normalization
    if (content.includes('eigenaarssalaris') || content.includes('salaris')) {
      return {
        success: true,
        content: `Op basis van sectordata is een marktconform eigenaarssalaris tussen €100.000 en €140.000.\n\nIk stel €120.000 als normalisatiebasis voor.`,
        fieldUpdates: [{
          field: 'ownerSalary',
          value: 120000,
          label: 'Eigenaarssalaris',
          grootboekCode: '620',
          source: 'ai',
          confidence: 'high',
          impact: calcImpact(60000),
        }],
        fallback: true,
      }
    }

    // Rent normalization
    if (content.includes('huur') || content.includes('kantoor')) {
      return {
        success: true,
        content: `Gemiddelde kantoorhuur in België: €80-150/m² per jaar.\nIndustriële ruimte: €40-80/m² per jaar.`,
        fieldUpdates: [{
          field: 'rent',
          value: 48000,
          label: 'Huurkosten',
          grootboekCode: '613',
          source: 'ai',
          confidence: 'medium',
          impact: calcImpact(24000),
        }],
        fallback: true,
      }
    }

    // Normalization overview
    if (content.includes('normalis')) {
      return {
        success: true,
        content: `Relevante normalisaties:\n\n1. **Eigenaarssalaris** - Marktconform niveau\n2. **Huurkosten** - Marktwaarde\n3. **Autokosten** - Privégebruik\n4. **Eenmalige kosten** - Juridisch etc.\n\n**Snelle commando's:**\n- *"Normaliseer eigenaarssalaris naar €60k"*\n- *"Zet huurkosten op €24k"*`,
        fallback: true,
      }
    }

    // Default response
    return {
      success: true,
      content: `Bedankt voor je vraag over ${request.companyName || 'dit bedrijf'}.\n\n**Snelle normalisatie commando's:**\n• *"Normaliseer eigenaarssalaris naar €60k"*\n• *"Zet huurkosten op €24k"*\n• *"Pas autokosten aan naar €18k"*`,
      fallback: true,
    }
  }
}

export const aiChatService = AIChatServiceImpl.getInstance()
