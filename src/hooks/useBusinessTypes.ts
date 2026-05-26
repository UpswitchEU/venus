/**
 * Business Types Hook for Valuation Tester
 *
 * React hook for fetching business types from API with caching.
 *
 * @author UpSwitch CTO Team
 * @version 1.0.0
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useIsMountedRef } from '../features/manual/hooks/useNavigationCancellation'
import {
  BusinessType,
  BusinessTypeOption,
  businessTypesApiService,
  businessTypesToOptions,
} from '../services/businessTypesApi'
import { createContextLogger } from '../utils/logger'

const logger = createContextLogger('business-types')

// ============================================================================
// TYPES
// ============================================================================

export interface UseBusinessTypesState {
  businessTypes: BusinessType[]
  businessTypeOptions: BusinessTypeOption[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

// ============================================================================
// HOOK
// ============================================================================

function isAbortLike(err: unknown): boolean {
  if (err instanceof Error && err.name === 'AbortError') return true
  const code = (err as { code?: string })?.code
  if (code === 'ERR_CANCELED') return true
  return false
}

export function useBusinessTypes(): UseBusinessTypesState {
  const [businessTypes, setBusinessTypes] = useState<BusinessType[]>([])
  const [businessTypeOptions, setBusinessTypeOptions] = useState<BusinessTypeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useIsMountedRef()
  const inFlightRef = useRef<AbortController | null>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: mountedRef.current is read lazily, not reactive
  const fetchBusinessTypes = useCallback(async () => {
    inFlightRef.current?.abort()
    const controller = new AbortController()
    inFlightRef.current = controller

    let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined
    try {
      setLoading(true)
      setError(null)

      timeoutId = setTimeout(() => controller.abort(), 6000)

      const types = await businessTypesApiService.getBusinessTypes(controller.signal)
      if (timeoutId) clearTimeout(timeoutId)

      if (!mountedRef.current || controller.signal.aborted) return

      const options = businessTypesToOptions(types)

      logger.debug('Loaded business types', {
        typesCount: types.length,
        optionsCount: options.length,
      })

      setBusinessTypes(types)
      setBusinessTypeOptions(options)
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId)
      if (isAbortLike(err)) return
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Bedrijfstypes laden mislukt. Probeer het later opnieuw.'
      if (mountedRef.current) {
        setError(errorMessage)
      }
      logger.error('Failed to fetch business types', { error: errorMessage })
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
    // `mountedRef` is a ref; reading `.current` here would not invalidate the
    // memo (refs don't notify React on change) and including it tripped the
    // exhaustive-deps lint. The fetch reads `mountedRef.current` lazily inside
    // the body, which is the intended pattern.
  }, [])

  const refetch = useCallback(async () => {
    await fetchBusinessTypes()
  }, [fetchBusinessTypes])

  // Mount tracking owned by useIsMountedRef above; this effect handles the
  // fetch kickoff and in-flight abort.
  useEffect(() => {
    fetchBusinessTypes()
    return () => {
      inFlightRef.current?.abort()
    }
  }, [fetchBusinessTypes])

  return {
    businessTypes,
    businessTypeOptions,
    loading,
    error,
    refetch,
  }
}

export default useBusinessTypes
