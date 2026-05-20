/**
 * useRealTimeValidation Hook
 *
 * Provides real-time validation for business-type-specific data.
 * Debounces API calls to avoid excessive requests.
 *
 * @author UpSwitch CTO Team
 * @version 2.0.0
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type BusinessTypeValidationError,
  type BusinessTypeValidationResult,
  type BusinessTypeValidationSuggestion,
  type BusinessTypeValidationWarning,
  businessTypesApiService,
} from '../services/businessTypesApi'
import { logger as generalLogger } from '../utils/loggers'

// ============================================================================
// TYPES
// ============================================================================

export type ValidationError = BusinessTypeValidationError

export type ValidationWarning = BusinessTypeValidationWarning

export type ValidationSuggestion = BusinessTypeValidationSuggestion

export type ValidationResult = Pick<
  BusinessTypeValidationResult,
  'valid' | 'errors' | 'warnings' | 'suggestions'
>

export interface UseRealTimeValidationState {
  validation: ValidationResult | null
  validating: boolean
  error: string | null
  validate: (data: Record<string, unknown>) => Promise<void>
  clearValidation: () => void
}

// ============================================================================
// HOOK
// ============================================================================

export function useRealTimeValidation(
  businessTypeId: string | null | undefined,
  debounceMs: number = 500
): UseRealTimeValidationState {
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const validate = useCallback(
    async (data: Record<string, unknown>) => {
      if (!businessTypeId) {
        return
      }

      // Clear any pending validation
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      // Abort any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      // Debounce validation
      timeoutRef.current = setTimeout(async () => {
        try {
          setValidating(true)
          setError(null)

          abortControllerRef.current = new AbortController()

          generalLogger.debug('[useRealTimeValidation] Validating', {
            businessTypeId,
            dataKeys: Object.keys(data),
          })

          const result = await businessTypesApiService.validateBusinessTypeData(
            businessTypeId,
            data
          )

          if (result) {
            setValidation(result)

            generalLogger.info('[useRealTimeValidation] Validation complete', {
              businessTypeId,
              valid: result.valid,
              errorsCount: result.errors?.length || 0,
              warningsCount: result.warnings?.length || 0,
              suggestionsCount: result.suggestions?.length || 0,
            })
          }
        } catch (err) {
          // Ignore abort errors
          if (err instanceof Error && err.name === 'AbortError') {
            return
          }

          const errorMessage = err instanceof Error ? err.message : 'Validation failed'
          setError(errorMessage)
          generalLogger.error('[useRealTimeValidation] Error:', {
            businessTypeId,
            error: errorMessage,
          })
        } finally {
          setValidating(false)
        }
      }, debounceMs)
    },
    [businessTypeId, debounceMs]
  )

  const clearValidation = useCallback(() => {
    setValidation(null)
    setError(null)

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  return {
    validation,
    validating,
    error,
    validate,
    clearValidation,
  }
}

export default useRealTimeValidation
