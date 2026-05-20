/**
 * Business Type Suggestion API Service
 *
 * Allows users to suggest new business types when they can't find theirs in the list.
 * Submissions are logged and can be reviewed by admin team.
 */

import axios, { type AxiosInstance } from 'axios'
import { getApiUrl } from '../utils/getMercuryUrl'
import { generalLogger } from '../utils/logger'

const STORAGE_KEY = 'business_type_suggestions'
const MAX_LOCAL_SUGGESTIONS = 50

export interface BusinessTypeSuggestion {
  suggestion: string
  user_id?: string
  context?: {
    industry?: string
    similar_to?: string
    description?: string
    search_query?: string
  }
}

export interface StoredBusinessTypeSuggestion extends BusinessTypeSuggestion {
  timestamp: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function normalizeContext(value: unknown): BusinessTypeSuggestion['context'] {
  if (!isRecord(value)) return undefined

  const context: NonNullable<BusinessTypeSuggestion['context']> = {}
  const industry = optionalString(value.industry)
  const similarTo = optionalString(value.similar_to)
  const description = optionalString(value.description)
  const searchQuery = optionalString(value.search_query)

  if (industry) context.industry = industry
  if (similarTo) context.similar_to = similarTo
  if (description) context.description = description
  if (searchQuery) context.search_query = searchQuery

  return Object.keys(context).length > 0 ? context : undefined
}

function normalizeSuggestion(value: unknown): BusinessTypeSuggestion | null {
  if (!isRecord(value)) return null

  const suggestion = optionalString(value.suggestion)
  if (!suggestion) return null

  const normalized: BusinessTypeSuggestion = {
    suggestion,
  }
  const userId = optionalString(value.user_id)
  const context = normalizeContext(value.context)

  if (userId) normalized.user_id = userId
  if (context) normalized.context = context

  return normalized
}

function normalizeStoredSuggestion(value: unknown): StoredBusinessTypeSuggestion | null {
  if (!isRecord(value)) return null

  const suggestion = normalizeSuggestion(value)
  const timestamp = optionalString(value.timestamp)
  if (!suggestion || !timestamp) return null

  return {
    ...suggestion,
    timestamp,
  }
}

function suggestionLogSummary(suggestion: BusinessTypeSuggestion) {
  return {
    suggestionLength: suggestion.suggestion.length,
    hasUserId: Boolean(suggestion.user_id),
    contextKeys: Object.keys(suggestion.context ?? {}),
  }
}

class BusinessTypeSuggestionService {
  private api: AxiosInstance
  private baseUrl: string

  constructor() {
    // Use the main backend API (Titan) - follow Mercury pattern
    const apiBaseUrl = getApiUrl()

    // Normalize URL: remove /api suffix if present
    this.baseUrl = apiBaseUrl.replace(/\/api\/?$/, '')

    // Use correct Titan endpoint: /api/v2/business-types
    this.api = axios.create({
      baseURL: `${this.baseUrl}/api/v2/business-types`,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  /**
   * Submit a suggestion for a new business type
   */
  async submitSuggestion(suggestion: BusinessTypeSuggestion): Promise<void> {
    const normalized = normalizeSuggestion(suggestion)
    if (!normalized) {
      generalLogger.warn('[BusinessTypeSuggestion] Ignoring empty suggestion')
      return
    }

    try {
      generalLogger.debug('[BusinessTypeSuggestion] Submitting', {
        suggestion: suggestionLogSummary(normalized),
      })

      // Try to submit to backend
      await this.api.post('/suggest', normalized)

      generalLogger.info('[BusinessTypeSuggestion] Successfully submitted')
    } catch (error) {
      generalLogger.error('[BusinessTypeSuggestion] Failed to submit', {
        error,
        suggestion: suggestionLogSummary(normalized),
      })

      // Fail silently - don't block user
      // Log to console for debugging
      generalLogger.debug('[BusinessTypeSuggestion] Fallback: Logging suggestion locally', {
        suggestion: suggestionLogSummary(normalized),
      })

      // Store in localStorage as fallback
      this.logSuggestionLocally(normalized)
    }
  }

  /**
   * Log suggestion to localStorage as fallback
   */
  private logSuggestionLocally(suggestion: BusinessTypeSuggestion): void {
    if (typeof localStorage === 'undefined') return

    try {
      const suggestions = this.getLocalSuggestions()

      const nextSuggestions = [
        ...suggestions,
        {
          ...suggestion,
          timestamp: new Date().toISOString(),
        },
      ].slice(-MAX_LOCAL_SUGGESTIONS)

      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSuggestions))
    } catch (error) {
      generalLogger.error('[BusinessTypeSuggestion] Failed to log locally', {
        error,
        suggestion: suggestionLogSummary(suggestion),
      })
    }
  }

  /**
   * Get locally logged suggestions (for debugging/admin)
   */
  getLocalSuggestions(): StoredBusinessTypeSuggestion[] {
    if (typeof localStorage === 'undefined') return []

    try {
      const existing = localStorage.getItem(STORAGE_KEY)
      if (!existing) return []

      const parsed: unknown = JSON.parse(existing)
      if (!Array.isArray(parsed)) return []

      return parsed.flatMap((item) => {
        const normalized = normalizeStoredSuggestion(item)
        return normalized ? [normalized] : []
      })
    } catch (error) {
      generalLogger.error('[BusinessTypeSuggestion] Failed to retrieve local suggestions', {
        error,
      })
      return []
    }
  }
}

// Export singleton instance
export const suggestionService = new BusinessTypeSuggestionService()
