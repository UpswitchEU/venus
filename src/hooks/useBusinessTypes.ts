/**
 * Business Types Hook for Valuation Tester
 *
 * React hook for fetching business types from API with caching.
 *
 * @author UpSwitch CTO Team
 * @version 1.0.0
 */

import { useCallback, useEffect, useState } from 'react'
import {
  BusinessType,
  BusinessTypeOption,
  businessTypesApiService,
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

export function useBusinessTypes(): UseBusinessTypesState {
  const [businessTypes, setBusinessTypes] = useState<BusinessType[]>([])
  const [businessTypeOptions, setBusinessTypeOptions] = useState<BusinessTypeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBusinessTypes = useCallback(async () => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined
    try {
      setLoading(true)
      setError(null)

      const controller = new AbortController()
      timeoutId = setTimeout(() => controller.abort(), 6000)

      const types = await businessTypesApiService.getBusinessTypes(controller.signal)
      if (timeoutId) clearTimeout(timeoutId)
      const options = await businessTypesApiService.getBusinessTypeOptions()

      logger.debug('Loaded business types', {
        typesCount: types.length,
        optionsCount: options.length,
      })

      setBusinessTypes(types)
      setBusinessTypeOptions(options)
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId)
      if (err instanceof Error && err.name === 'AbortError') return
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Bedrijfstypes laden mislukt. Probeer het later opnieuw.'
      setError(errorMessage)
      logger.error('Failed to fetch business types', { error: errorMessage })
    } finally {
      setLoading(false)
    }
  }, [])

  const refetch = useCallback(async () => {
    await fetchBusinessTypes()
  }, [fetchBusinessTypes])

  useEffect(() => {
    fetchBusinessTypes()
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
