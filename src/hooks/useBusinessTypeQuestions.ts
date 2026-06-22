/**
 * useBusinessTypeQuestions Hook
 *
 * Fetches and manages dynamic questions for a business type.
 * Handles conditional logic and question filtering.
 *
 * @author UpSwitch CTO Team
 * @version 2.0.0
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type BusinessTypeQuestionsOptions,
  type BusinessTypeQuestionsResponse,
  businessTypesApiService,
} from '../services/businessTypesApi'
import { normalizeBusinessTypeId } from '../utils/businessTypeIdAliases'
import { generalLogger } from '../utils/logger'

// ============================================================================
// TYPES
// ============================================================================

export type BusinessTypeQuestionOption =
  | string
  | number
  | boolean
  | {
      label?: string
      value?: string | number | boolean
      [key: string]: unknown
    }

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
  options?: BusinessTypeQuestionOption[]
  priority: number
  phase: string
  required: boolean
  conditional_logic?: Record<string, unknown>
  validation_rules?: Record<string, unknown>
  impacts_valuation: boolean
  valuation_impact?: Record<string, unknown>
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

function toQuestionsMetadata(
  result: BusinessTypeQuestionsResponse,
  canonicalBusinessTypeId: string
): QuestionsMetadata {
  return {
    questions:
      result.questions?.map((q) => ({
        id: q.id,
        business_type_id: canonicalBusinessTypeId,
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
  const mountedRef = useRef(true)
  const requestTokenRef = useRef(0)
  const flowType = options?.flow_type
  const phase = options?.phase
  const existingData = options?.existing_data

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestTokenRef.current += 1
    }
  }, [])

  const fetchQuestions = useCallback(async () => {
    const requestToken = requestTokenRef.current + 1
    requestTokenRef.current = requestToken
    const canonicalBusinessTypeId = normalizeBusinessTypeId(businessTypeId)
    if (!canonicalBusinessTypeId) {
      if (mountedRef.current) {
        setMetadata(null)
        setLoading(false)
        setError(null)
      }
      return
    }
    const requestOptions =
      flowType || phase || existingData
        ? {
            existing_data: existingData,
            flow_type: flowType,
            phase,
          }
        : undefined

    try {
      setLoading(true)
      setError(null)

      generalLogger.debug('[useBusinessTypeQuestions] Fetching questions', {
        businessTypeId: canonicalBusinessTypeId,
        options: requestOptions,
      })

      const result = await businessTypesApiService.getBusinessTypeQuestions(
        canonicalBusinessTypeId,
        requestOptions
      )

      if (!mountedRef.current || requestTokenRef.current !== requestToken) return

      if (result) {
        const metadata = toQuestionsMetadata(result, canonicalBusinessTypeId)
        setMetadata(metadata)
        generalLogger.info('[useBusinessTypeQuestions] Questions loaded', {
          businessTypeId: canonicalBusinessTypeId,
          totalQuestions: result.questions.length,
          requiredQuestions: result.total_required,
          estimatedTime: result.estimated_time,
        })
      } else {
        setMetadata(null)
        setError('No questions found')
        generalLogger.error('[useBusinessTypeQuestions] No questions found', {
          businessTypeId: canonicalBusinessTypeId,
        })
      }
    } catch (err) {
      if (!mountedRef.current || requestTokenRef.current !== requestToken) return
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch questions'
      setError(errorMessage)
      generalLogger.error('[useBusinessTypeQuestions] Error:', {
        businessTypeId: canonicalBusinessTypeId,
        error: errorMessage,
      })
    } finally {
      if (mountedRef.current && requestTokenRef.current === requestToken) {
        setLoading(false)
      }
    }
  }, [businessTypeId, flowType, phase, existingData])

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
