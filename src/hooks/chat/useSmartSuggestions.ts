/**
 * useSmartSuggestions - Extracted smart suggestions logic from StreamingChat
 *
 * Handles intelligent follow-up suggestions based on conversation context.
 * Follows Single Responsibility Principle by focusing only on suggestion logic.
 */

import { useMemo } from 'react'
import type { Message } from '../../types/message'

export interface UseSmartSuggestionsOptions {
  messages: Message[]
}

export interface UseSmartSuggestionsReturn {
  suggestions: string[]
  getSuggestionsForField: (field: string) => string[]
}

/**
 * Smart suggestions based on last AI message context
 *
 * Analyzes the conversation to provide contextual follow-up suggestions
 * for better user experience and conversation flow.
 */
export function useSmartSuggestions({
  messages,
}: UseSmartSuggestionsOptions): UseSmartSuggestionsReturn {
  // Get suggestions based on the last collected field
  const getSuggestionsForField = (field: string): string[] => {
    switch (field) {
      case 'business_type':
        return ['SaaS Platform', 'E-commerce Store', 'Consulting Firm', 'Digital Agency']
      case 'revenue':
        return ['$1M - $5M ARR', '$5M - $10M ARR', '$10M - $50M ARR', '$50M+ ARR']
      case 'employee_count':
        return ['1-10 team', '11-50 team', '51-200 team', '200+ team']
      case 'industry':
        return ['Technology', 'Healthcare', 'Finance', 'Retail', 'Manufacturing']
      case 'country_code':
        return ['United States', 'United Kingdom', 'Germany', 'France', 'Canada']
      default:
        return []
    }
  }

  // Calculate suggestions based on last AI message
  const suggestions = useMemo(() => {
    if (messages.length === 0) return []

    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.type === 'ai' && lastMessage.metadata) {
      const metadata = lastMessage.metadata as any
      const field = metadata.collected_field || metadata.clarification_field || metadata.field

      if (field) {
        return getSuggestionsForField(field)
      }
    }

    return []
  }, [messages, getSuggestionsForField])

  return {
    suggestions,
    getSuggestionsForField,
  }
}
