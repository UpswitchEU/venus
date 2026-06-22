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

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type BusinessTypeFullMetadata,
  businessTypesApiService,
} from '../services/businessTypesApi'
import { normalizeBusinessTypeId } from '../utils/businessTypeIdAliases'
import { generalLogger } from '../utils/logger'

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
  const mountedRef = useRef(true)
  const requestTokenRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestTokenRef.current += 1
    }
  }, [])

  const fetchBusinessTypeFull = useCallback(async () => {
    const requestToken = requestTokenRef.current + 1
    requestTokenRef.current = requestToken
    const canonicalBusinessTypeId = normalizeBusinessTypeId(businessTypeId)
    if (!canonicalBusinessTypeId) {
      if (mountedRef.current) {
        setBusinessType(null)
        setLoading(false)
        setError(null)
      }
      return
    }

    try {
      setLoading(true)
      setError(null)

      generalLogger.debug('[useBusinessTypeFull] Fetching full metadata', {
        businessTypeId: canonicalBusinessTypeId,
      })

      const result = await businessTypesApiService.getBusinessTypeFull(canonicalBusinessTypeId)

      if (!mountedRef.current || requestTokenRef.current !== requestToken) return

      if (result) {
        setBusinessType(result)
        generalLogger.info('[useBusinessTypeFull] Loaded successfully', {
          businessTypeId: canonicalBusinessTypeId,
          questionsCount: result.questions?.length || 0,
          validationsCount: result.validations?.length || 0,
          benchmarksCount: result.benchmarks?.length || 0,
        })
      } else {
        setBusinessType(null)
        setError('Business type not found')
        generalLogger.error('[useBusinessTypeFull] Not found', {
          businessTypeId: canonicalBusinessTypeId,
        })
      }
    } catch (err) {
      if (!mountedRef.current || requestTokenRef.current !== requestToken) return
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch business type'
      setError(errorMessage)
      generalLogger.error('[useBusinessTypeFull] Error:', {
        businessTypeId: canonicalBusinessTypeId,
        error: errorMessage,
      })
    } finally {
      if (mountedRef.current && requestTokenRef.current === requestToken) {
        setLoading(false)
      }
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
