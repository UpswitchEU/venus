/**
 * useSmartFollowUps Hook
 *
 * Single Responsibility: Generate smart follow-up suggestions based on conversation context
 * Extracted from StreamingChat.tsx to follow SRP
 *
 * @module hooks/chat/useSmartFollowUps
 */

import { useMemo } from 'react'
import type { Message } from '../../types/message'

/**
 * Hook for generating smart follow-up suggestions
 *
 * Analyzes the last message to provide contextual suggestions
 */
export const useSmartFollowUps = (messages: Message[]): string[] => {
  return useMemo(() => {
    if (messages.length === 0) return []

    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.type === 'ai' && lastMessage.metadata?.collected_field) {
      const field = lastMessage.metadata.collected_field
      switch (field) {
        case 'business_type':
          return ['SaaS Platform', 'E-commerce Store', 'Consulting Firm', 'Digital Agency']
        case 'revenue':
          return ['$1M - $5M ARR', '$5M - $10M ARR', '$10M - $50M ARR', '$50M+ ARR']
        case 'employee_count':
          return ['1-10 team', '11-50 team', '51-200 team', '200+ team']
        default:
          return []
      }
    }

    return []
  }, [messages])
}
