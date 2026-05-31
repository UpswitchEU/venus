/**
 * useBusinessTypeFull Hook
 *
 * Fetches complete business type metadata including:
 * - Questions (dynamic question templates)
 * - Validations (business-type-specific rules)
 * - Benchmarks (industry data)
 * - Extended metadata
 *
 * @author UpSwitch CTO Team
 * @version 2.0.0
 */

import { useCallback, useEffect, useState } from 'react'
import {
  type BusinessTypeFullMetadata,
  businessTypesApiService,
} from '../services/businessTypesApi'
import { normalizeBusinessTypeId } from '../utils/businessTypeIdAliases'
import { logger as generalLogger } from '../utils/loggers'

// ============================================================================
// TYPES
// ============================================================================

export type BusinessTypeFull = BusinessTypeFullMetadata

export interface UseBusinessTypeFullState {
  businessType: BusinessTypeFull | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

// ============================================================================
// HOOK
// ============================================================================

export function useBusinessTypeFull(
  businessTypeId: string | null | undefined
): UseBusinessTypeFullState {
  const [businessType, setBusinessType] = useState<BusinessTypeFull | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBusinessTypeFull = useCallback(async () => {
    const canonicalBusinessTypeId = normalizeBusinessTypeId(businessTypeId)
    if (!canonicalBusinessTypeId) {
      setBusinessType(null)
      setLoading(false)
      setError(null)
      return
    }

    try {
      setLoading(true)
      setError(null)

      generalLogger.debug('[useBusinessTypeFull] Fetching full metadata', {
        businessTypeId: canonicalBusinessTypeId,
      })

      const result = await businessTypesApiService.getBusinessTypeFull(canonicalBusinessTypeId)

      if (result) {
        setBusinessType(result)
        generalLogger.info('[useBusinessTypeFull] Loaded successfully', {
          businessTypeId: canonicalBusinessTypeId,
          questionsCount: result.questions?.length || 0,
          validationsCount: result.validations?.length || 0,
          benchmarksCount: result.benchmarks?.length || 0,
        })
      } else {
        setError('Business type not found')
        generalLogger.error('[useBusinessTypeFull] Not found', {
          businessTypeId: canonicalBusinessTypeId,
        })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch business type'
      setError(errorMessage)
      generalLogger.error('[useBusinessTypeFull] Error:', {
        businessTypeId: canonicalBusinessTypeId,
        error: errorMessage,
      })
    } finally {
      setLoading(false)
    }
  }, [businessTypeId])

  const refetch = useCallback(async () => {
    await fetchBusinessTypeFull()
  }, [fetchBusinessTypeFull])

  useEffect(() => {
    fetchBusinessTypeFull()
  }, [fetchBusinessTypeFull])

  return {
    businessType,
    loading,
    error,
    refetch,
  }
}

export default useBusinessTypeFull
