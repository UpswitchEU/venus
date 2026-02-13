/**
 * useConversationMetrics - Handles conversation metrics tracking
 *
 * Extracted from StreamingChat.tsx to reduce component complexity and improve maintainability.
 * Centralizes all metrics tracking including performance monitoring and conversation analytics.
 */

import { useCallback, useState } from 'react'
import type { ConversationMetrics } from '../types/conversationMetrics'
import { chatLogger } from '../utils/logger'

// Re-export types for convenience
export interface ModelPerformanceMetrics {
  model_name: string
  model_version: string
  time_to_first_token_ms: number
  total_response_time_ms: number
  tokens_per_second: number
  response_coherence_score?: number
  response_relevance_score?: number
  hallucination_detected: boolean
  input_tokens: number
  output_tokens: number
  estimated_cost_usd: number
  error_occurred: boolean
  error_type?: string
  retry_count: number
}

/**
 * Custom hook that manages conversation metrics and performance tracking
 *
 * @param sessionId - Unique session identifier
 * @param userId - Optional user identifier
 * @returns Metrics state and tracking functions
 */
export const useConversationMetrics = (sessionId: string, userId?: string) => {
  const [metrics, setMetrics] = useState<ConversationMetrics>({
    session_id: sessionId,
    user_id: userId,
    started_at: new Date(),
    total_turns: 0,
    successful: false,
    ai_response_count: 0,
    user_message_count: 0,
    error_count: 0,
    retry_count: 0,
    avg_response_time_ms: 0,
    valuation_generated: false,
    data_completeness_percent: 0,
    collected_fields: [],
    total_tokens_used: 0,
    estimated_cost_usd: 0,
    feedback_provided: false,
  })

  /**
   * Track model performance metrics
   */
  const trackModelPerformance = useCallback(
    (performanceMetrics: ModelPerformanceMetrics) => {
      chatLogger.info('Model performance tracked', {
        sessionId,
        model: performanceMetrics.model_name,
        responseTime: performanceMetrics.total_response_time_ms,
        tokens: performanceMetrics.output_tokens,
        cost: performanceMetrics.estimated_cost_usd,
      })

      // Update conversation metrics with model performance
      setMetrics((prev) => ({
        ...prev,
        total_tokens_used: prev.total_tokens_used + performanceMetrics.output_tokens,
        estimated_cost_usd: prev.estimated_cost_usd + performanceMetrics.estimated_cost_usd,
        avg_response_time_ms:
          prev.avg_response_time_ms === 0
            ? performanceMetrics.total_response_time_ms
            : (prev.avg_response_time_ms + performanceMetrics.total_response_time_ms) / 2,
      }))

      // Log performance warnings
      if (performanceMetrics.total_response_time_ms > 5000) {
        chatLogger.warn('Slow model response detected', {
          sessionId,
          responseTime: performanceMetrics.total_response_time_ms,
          threshold: 5000,
        })
      }

      if (performanceMetrics.estimated_cost_usd > 0.1) {
        // Alert if cost > $0.10
        chatLogger.warn('High cost response detected', {
          sessionId,
          cost: performanceMetrics.estimated_cost_usd,
          tokens: performanceMetrics.output_tokens,
        })
      }
    },
    [sessionId]
  )

  /**
   * Track conversation completion
   */
  const trackConversationCompletion = useCallback(
    (success: boolean, hasValuation: boolean) => {
      chatLogger.info('Conversation completion tracked', {
        sessionId,
        success,
        hasValuation,
        totalTurns: metrics.total_turns,
      })

      setMetrics((prev) => ({
        ...prev,
        successful: success,
        valuation_generated: hasValuation,
      }))

      // Track completion analytics
      chatLogger.info('conversation_completed', {
        session_id: sessionId,
        user_id: userId,
        success,
        has_valuation: hasValuation,
        total_turns: metrics.total_turns,
        ai_responses: metrics.ai_response_count,
        user_messages: metrics.user_message_count,
        errors: metrics.error_count,
        retries: metrics.retry_count,
        avg_response_time_ms: metrics.avg_response_time_ms,
        total_tokens: metrics.total_tokens_used,
        estimated_cost_usd: metrics.estimated_cost_usd,
        data_completeness_percent: metrics.data_completeness_percent,
        collected_fields: metrics.collected_fields,
      })
    },
    [sessionId, userId, metrics]
  )

  /**
   * Update metrics with partial data
   */
  const updateMetrics = useCallback(
    (updates: Partial<ConversationMetrics>) => {
      setMetrics((prev) => ({ ...prev, ...updates }))

      chatLogger.debug('Metrics updated', {
        sessionId,
        updates: Object.keys(updates),
      })
    },
    [sessionId]
  )

  /**
   * Increment turn count
   */
  const incrementTurn = useCallback(() => {
    setMetrics((prev) => ({
      ...prev,
      total_turns: prev.total_turns + 1,
    }))
  }, [])

  /**
   * Increment AI response count
   */
  const incrementAIResponse = useCallback(() => {
    setMetrics((prev) => ({
      ...prev,
      ai_response_count: prev.ai_response_count + 1,
    }))
  }, [])

  /**
   * Increment user message count
   */
  const incrementUserMessage = useCallback(() => {
    setMetrics((prev) => ({
      ...prev,
      user_message_count: prev.user_message_count + 1,
    }))
  }, [])

  /**
   * Increment error count
   */
  const incrementError = useCallback(() => {
    setMetrics((prev) => ({
      ...prev,
      error_count: prev.error_count + 1,
    }))
  }, [])

  /**
   * Increment retry count
   */
  const incrementRetry = useCallback(() => {
    setMetrics((prev) => ({
      ...prev,
      retry_count: prev.retry_count + 1,
    }))
  }, [])

  /**
   * Update data completeness
   */
  const updateDataCompleteness = useCallback((completeness: number, collectedFields: string[]) => {
    setMetrics((prev) => ({
      ...prev,
      data_completeness_percent: completeness,
      collected_fields: collectedFields,
    }))
  }, [])

  /**
   * Mark feedback as provided
   */
  const markFeedbackProvided = useCallback(() => {
    setMetrics((prev) => ({
      ...prev,
      feedback_provided: true,
    }))
  }, [])

  /**
   * Reset metrics (useful for testing or new conversation)
   */
  const resetMetrics = useCallback(() => {
    setMetrics({
      session_id: sessionId,
      user_id: userId,
      started_at: new Date(),
      total_turns: 0,
      successful: false,
      ai_response_count: 0,
      user_message_count: 0,
      error_count: 0,
      retry_count: 0,
      avg_response_time_ms: 0,
      valuation_generated: false,
      data_completeness_percent: 0,
      collected_fields: [],
      total_tokens_used: 0,
      estimated_cost_usd: 0,
      feedback_provided: false,
    })
  }, [sessionId, userId])

  /**
   * Get metrics summary for logging
   */
  const getMetricsSummary = useCallback(() => {
    return {
      sessionId,
      userId,
      duration: Date.now() - metrics.started_at.getTime(),
      totalTurns: metrics.total_turns,
      success: metrics.successful,
      aiResponses: metrics.ai_response_count,
      userMessages: metrics.user_message_count,
      errors: metrics.error_count,
      retries: metrics.retry_count,
      avgResponseTime: metrics.avg_response_time_ms,
      valuationGenerated: metrics.valuation_generated,
      dataCompleteness: metrics.data_completeness_percent,
      collectedFields: metrics.collected_fields.length,
      totalTokens: metrics.total_tokens_used,
      estimatedCost: metrics.estimated_cost_usd,
      feedbackProvided: metrics.feedback_provided,
    }
  }, [sessionId, userId, metrics])

  return {
    metrics,
    trackModelPerformance,
    trackConversationCompletion,
    updateMetrics,
    incrementTurn,
    incrementAIResponse,
    incrementUserMessage,
    incrementError,
    incrementRetry,
    updateDataCompleteness,
    markFeedbackProvided,
    resetMetrics,
    getMetricsSummary,
  }
}
