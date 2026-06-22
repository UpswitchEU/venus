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
import { generalLogger } from '../utils/logger'

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
  const mountedRef = useRef(true)
  const validationTokenRef = useRef(0)

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
      const validationToken = validationTokenRef.current + 1
      validationTokenRef.current = validationToken

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

          if (!mountedRef.current || validationTokenRef.current !== validationToken) return

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
          if (!mountedRef.current || validationTokenRef.current !== validationToken) return
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
          if (mountedRef.current && validationTokenRef.current === validationToken) {
            setValidating(false)
            abortControllerRef.current = null
          }
        }
      }, debounceMs)
    },
    [businessTypeId, debounceMs]
  )

  const clearValidation = useCallback(() => {
    validationTokenRef.current += 1
    setValidation(null)
    setError(null)
    setValidating(false)

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      validationTokenRef.current += 1
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
