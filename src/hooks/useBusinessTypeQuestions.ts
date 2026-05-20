/**
 * useBusinessTypeQuestions Hook
 *
 * Fetches and manages dynamic questions for a business type.
 * Handles conditional logic and question filtering.
 *
 * @author UpSwitch CTO Team
 * @version 2.0.0
 */

import { useCallback, useEffect, useState } from 'react'
import {
  businessTypesApiService,
  type BusinessTypeQuestionsOptions,
} from '../services/businessTypesApi'
import { generalLogger } from '../utils/logger'

// ============================================================================
// TYPES
// ============================================================================

export interface BusinessTypeQuestion {
  id: string
  business_type_id: string
  question_id: string
  question_text: string
  question_text_short?: string
  help_text?: string
  placeholder?: string
  question_type: string
  input_type?: string
  options?: any[]
  priority: number
  phase: string
  required: boolean
  conditional_logic?: any
  validation_rules?: any
  impacts_valuation: boolean
  valuation_impact?: any
  tags?: string[]
  data_type?: string
  unit?: string
  status: string
}

export interface QuestionsMetadata {
  questions: BusinessTypeQuestion[]
  total_required: number
  estimated_time: string
}

export type UseBusinessTypeQuestionsOptions = BusinessTypeQuestionsOptions

export interface UseBusinessTypeQuestionsState {
  questions: BusinessTypeQuestion[]
  metadata: QuestionsMetadata | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  getQuestionsByPhase: (phase: string) => BusinessTypeQuestion[]
  getRequiredQuestions: () => BusinessTypeQuestion[]
}

// ============================================================================
// HOOK
// ============================================================================

export function useBusinessTypeQuestions(
  businessTypeId: string | null | undefined,
  options?: UseBusinessTypeQuestionsOptions
): UseBusinessTypeQuestionsState {
  const [metadata, setMetadata] = useState<QuestionsMetadata | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchQuestions = useCallback(async () => {
    if (!businessTypeId) {
      setMetadata(null)
      setLoading(false)
      setError(null)
      return
    }

    try {
      setLoading(true)
      setError(null)

      generalLogger.debug('[useBusinessTypeQuestions] Fetching questions', {
        businessTypeId,
        options,
      })

      const result = await businessTypesApiService.getBusinessTypeQuestions(businessTypeId, options)

      if (result) {
        // Ensure questions array exists and matches expected type
        const metadata: QuestionsMetadata = {
          questions:
            result.questions?.map((q) => ({
              id: q.id,
              business_type_id: businessTypeId,
              question_id: q.id,
              question_text: q.text,
              question_type: 'text',
              priority: 0,
              phase: result.phase,
              required: q.required,
              impacts_valuation: false,
              status: 'active',
            })) || [],
          total_required: result.total_required,
          estimated_time: result.estimated_time.toString(),
        }
        setMetadata(metadata)
        generalLogger.info('[useBusinessTypeQuestions] Questions loaded', {
          businessTypeId,
          totalQuestions: result.questions.length,
          requiredQuestions: result.total_required,
          estimatedTime: result.estimated_time,
        })
      } else {
        setError('No questions found')
        generalLogger.error('[useBusinessTypeQuestions] No questions found', {
          businessTypeId,
        })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch questions'
      setError(errorMessage)
      generalLogger.error('[useBusinessTypeQuestions] Error:', {
        businessTypeId,
        error: errorMessage,
      })
    } finally {
      setLoading(false)
    }
  }, [businessTypeId, options?.flow_type, options?.phase, options?.existing_data, options])

  const refetch = useCallback(async () => {
    await fetchQuestions()
  }, [fetchQuestions])

  // Get questions by phase
  const getQuestionsByPhase = useCallback(
    (phase: string): BusinessTypeQuestion[] => {
      if (!metadata?.questions) return []
      return metadata.questions.filter((q) => q.phase === phase)
    },
    [metadata]
  )

  // Get required questions
  const getRequiredQuestions = useCallback((): BusinessTypeQuestion[] => {
    if (!metadata?.questions) return []
    return metadata.questions.filter((q) => q.required)
  }, [metadata])

  useEffect(() => {
    fetchQuestions()
  }, [fetchQuestions])

  return {
    questions: metadata?.questions || [],
    metadata,
    loading,
    error,
    refetch,
    getQuestionsByPhase,
    getRequiredQuestions,
  }
}

export default useBusinessTypeQuestions
