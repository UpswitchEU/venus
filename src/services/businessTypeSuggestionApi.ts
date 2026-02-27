/**
 * Business Type Suggestion API Service
 *
 * Allows users to suggest new business types when they can't find theirs in the list.
 * Submissions are logged and can be reviewed by admin team.
 */

import axios, { AxiosInstance } from 'axios'
import { getApiUrl } from '../utils/getMercuryUrl'
import { generalLogger } from '../utils/logger'

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
    try {
      generalLogger.debug('[BusinessTypeSuggestion] Submitting', { suggestion })

      // Try to submit to backend
      await this.api.post('/suggest', suggestion)

      generalLogger.info('[BusinessTypeSuggestion] Successfully submitted')
    } catch (error) {
      generalLogger.error('[BusinessTypeSuggestion] Failed to submit', { error, suggestion })

      // Fail silently - don't block user
      // Log to console for debugging
      generalLogger.debug('[BusinessTypeSuggestion] Fallback: Logging suggestion locally', {
        suggestion,
      })

      // Store in localStorage as fallback
      this.logSuggestionLocally(suggestion)
    }
  }

  /**
   * Log suggestion to localStorage as fallback
   */
  private logSuggestionLocally(suggestion: BusinessTypeSuggestion): void {
    try {
      const key = 'business_type_suggestions'
      const existing = localStorage.getItem(key)
      const suggestions = existing ? JSON.parse(existing) : []

      suggestions.push({
        ...suggestion,
        timestamp: new Date().toISOString(),
      })

      // Keep last 50 suggestions
      if (suggestions.length > 50) {
        suggestions.shift()
      }

      localStorage.setItem(key, JSON.stringify(suggestions))
    } catch (error) {
      generalLogger.error('[BusinessTypeSuggestion] Failed to log locally', { error, suggestion })
    }
  }

  /**
   * Get locally logged suggestions (for debugging/admin)
   */
  getLocalSuggestions(): Array<BusinessTypeSuggestion & { timestamp: string }> {
    try {
      const key = 'business_type_suggestions'
      const existing = localStorage.getItem(key)
      return existing ? JSON.parse(existing) : []
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
