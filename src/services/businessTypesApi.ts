/**
 * Business Types API Service for Valuation Tester
 *
 * Fetches business types from the main backend API with caching.
 * Falls back to hardcoded data if API is unavailable.
 *
 * Enhanced with Phase 2 features:
 * - Full business type metadata
 * - Dynamic questions
 * - Real-time validation
 * - Benchmark comparison
 *
 * @author UpSwitch CTO Team
 * @version 2.0.0
 */

import axios, { AxiosInstance } from 'axios'
import { getApiUrl } from '../utils/getMercuryUrl'
import { generalLogger } from '../utils/logger'
import {
  buildBusinessTypesCacheData,
  buildHardcodedBusinessTypes,
  getBusinessTypesCacheDecision,
  MAX_EXTRA_BUSINESS_TYPES_PAGES,
  normalizeBusinessCategories,
  normalizeBusinessTypeSearchResults,
  normalizeBusinessTypesPage,
  normalizeNaceBusinessTypePayload,
} from './businessTypesCatalogModel'
import type {
  ApiResponse,
  BusinessType,
  BusinessTypeBenchmarksResponse,
  BusinessTypeFullMetadata,
  BusinessTypeOption,
  BusinessTypeQuestionsOptions,
  BusinessTypeQuestionsResponse,
  BusinessTypeValidationResult,
} from './businessTypesApi.helpers'
import {
  BUSINESS_TYPES_PAGE_LIMIT,
  businessTypesToOptions,
  extractErrorStatus,
  normalizeBusinessTypeFullMetadata,
  normalizeQuestionsResponse,
  normalizeValidationResult,
} from './businessTypesApi.helpers'
import { businessTypesCache } from './cache/businessTypesCache'

export type {
  ApiResponse,
  BusinessType,
  BusinessTypeBenchmarksResponse,
  BusinessTypeFullMetadata,
  BusinessTypeFullMetric,
  BusinessTypeFullQuestion,
  BusinessTypeOption,
  BusinessTypeQuestionsOptions,
  BusinessTypeQuestionsResponse,
  BusinessTypeValidationError,
  BusinessTypeValidationIssue,
  BusinessTypeValidationResult,
  BusinessTypeValidationSeverity,
  BusinessTypeValidationSuggestion,
  BusinessTypeValidationWarning,
} from './businessTypesApi.helpers'
export { businessTypesToOptions } from './businessTypesApi.helpers'

// ============================================================================
// API SERVICE
// ============================================================================

class BusinessTypesApiService {
  private api: AxiosInstance
  private baseUrl: string

  constructor() {
    // Use the main backend API (Titan)
    // Follow Mercury's pattern: use env var with fallback
    const apiBaseUrl = getApiUrl()

    // Normalize URL: remove /api suffix if present
    this.baseUrl = apiBaseUrl.replace(/\/api\/?$/, '')

    // Use correct Titan endpoint: /api/v2/business-types
    this.api = axios.create({
      baseURL: `${this.baseUrl}/api/v2/business-types`,
      timeout: 6000,
      headers: {
        'Content-Type': 'application/json',
      },
    })

    generalLogger.info('[BusinessTypesAPI] Initialized', {
      baseUrl: this.baseUrl,
      fullEndpoint: `${this.baseUrl}/api/v2/business-types`,
    })
  }

  /**
   * Extract locale from current URL pathname
   */
  private getLocaleFromPathname(): string {
    if (typeof window === 'undefined') return 'en'
    const match = window.location.pathname.match(/^\/(en|nl|fr)/)
    return (match?.[1] as 'en' | 'nl' | 'fr') || 'en'
  }

  /**
   * Get all business types from API with enhanced caching.
   * First page uses Titan max page size (200); runs in parallel with categories.
   * Extra pages load only if `has_more` (large catalogs).
   */
  async getBusinessTypes(signal?: AbortSignal): Promise<BusinessType[]> {
    try {
      const locale = this.getLocaleFromPathname()

      // CACHE INVALIDATION: Check if cached data is using old limit (50)
      // If so, clear cache to force refetch with new limit (200)
      if (businessTypesCache.hasValidCache()) {
        const cachedData = await businessTypesCache.getBusinessTypes()
        const cacheDecision = getBusinessTypesCacheDecision(cachedData)
        if (cacheDecision.action === 'invalidate-incomplete') {
          generalLogger.warn('[BusinessTypesAPI] Cached data appears incomplete, clearing cache', {
            cachedCount: cacheDecision.cachedCount,
            expected: cacheDecision.expected,
          })
          businessTypesCache.clearBusinessTypes()
        } else if (cacheDecision.action === 'use') {
          generalLogger.debug('[BusinessTypesAPI] Serving from cache', {
            businessTypes: cacheDecision.data.businessTypes.length,
            categories: cacheDecision.data.categories.length,
            popularTypes: cacheDecision.data.popularTypes.length,
          })
          return cacheDecision.data.businessTypes
        }
      }

      // First types page + categories in parallel (one RTT saved). Categories are non-fatal: if
      // the categories request fails, we still load types and cache with categories=[].
      generalLogger.debug('[BusinessTypesAPI] Fetching from API (first types page + categories)', {
        locale,
      })

      const cacheBuster = Date.now()

      const [typesSettled, categoriesSettled] = await Promise.allSettled([
        this.api.get('/types', {
          params: {
            limit: BUSINESS_TYPES_PAGE_LIMIT,
            offset: 0,
            locale,
            _t: cacheBuster,
          },
          signal,
        }),
        this.api.get('/categories', { params: { locale }, signal }),
      ])

      if (typesSettled.status === 'rejected') {
        throw typesSettled.reason
      }

      const firstPage = normalizeBusinessTypesPage(typesSettled.value.data)
      if (!firstPage) {
        throw new Error('API returned unsuccessful response')
      }

      let categories: Array<{ id: string; name: string; icon: string }> = []
      if (categoriesSettled.status === 'fulfilled') {
        const cr = categoriesSettled.value
        if (cr.data?.success && cr.data.data) {
          categories = normalizeBusinessCategories(cr.data.data)
        }
      } else {
        generalLogger.warn(
          '[BusinessTypesAPI] Categories request failed; continuing with business types only',
          {
            error:
              categoriesSettled.reason instanceof Error
                ? categoriesSettled.reason.message
                : String(categoriesSettled.reason),
          }
        )
      }

      const allBusinessTypes: BusinessType[] = [...firstPage.businessTypes]
      let hasMore = firstPage.hasMore
      let offset = BUSINESS_TYPES_PAGE_LIMIT

      for (let p = 0; p < MAX_EXTRA_BUSINESS_TYPES_PAGES && hasMore; p++) {
        const next = await this.api.get('/types', {
          params: {
            limit: BUSINESS_TYPES_PAGE_LIMIT,
            offset,
            locale,
            _t: cacheBuster,
          },
          signal,
        })
        const page = normalizeBusinessTypesPage(next.data)
        if (!page) break
        allBusinessTypes.push(...page.businessTypes)
        hasMore = page.hasMore
        offset += BUSINESS_TYPES_PAGE_LIMIT
      }

      // Cache the complete data
      await businessTypesCache.setBusinessTypes(buildBusinessTypesCacheData(allBusinessTypes, categories))

      generalLogger.info('[BusinessTypesAPI] Fetched and cached', {
        count: allBusinessTypes.length,
      })
      return allBusinessTypes
    } catch (error) {
      generalLogger.error('[BusinessTypesAPI] Failed to fetch business types', { error })
      const cachedData = await businessTypesCache.getBusinessTypes()
      if (cachedData?.businessTypes.length) {
        generalLogger.warn('[BusinessTypesAPI] Serving cached business types after API failure', {
          count: cachedData.businessTypes.length,
        })
        return cachedData.businessTypes
      }

      const fallbackBusinessTypes = buildHardcodedBusinessTypes()
      generalLogger.warn('[BusinessTypesAPI] Serving hardcoded business types after API failure', {
        count: fallbackBusinessTypes.length,
      })
      await businessTypesCache.setBusinessTypes(buildBusinessTypesCacheData(fallbackBusinessTypes, []))
      return fallbackBusinessTypes
    }
  }

  /**
   * Get business type for a NACE code (reverse lookup).
   * Uses Titan's NACE→business type mapping (same as Mercury).
   * Returns null if no mapping exists.
   */
  async getBusinessTypeForNaceCode(
    naceCode: string,
    countryCode?: string,
    options?: { guaranteeResolution?: boolean }
  ): Promise<BusinessType | null> {
    if (!naceCode?.trim()) return null
    const normalizedCountry = countryCode?.trim().toUpperCase() || ''
    const marketCountryCode = normalizedCountry === 'UK' ? 'GB' : normalizedCountry

    try {
      const params = new URLSearchParams({ naceCode: naceCode.trim() })
      if (marketCountryCode) {
        params.set('country_code', marketCountryCode)
      }
      if (options?.guaranteeResolution) {
        params.set('guarantee_resolution', '1')
      }
      const url = `${this.baseUrl}/api/v2/nace/codes/${encodeURIComponent(
        naceCode.trim()
      )}/business-type?${params.toString()}`
      const response = await axios.get<{ business_type?: unknown; confidence?: number }>(url, {
        timeout: 5000,
        headers: { Accept: 'application/json' },
      })

      return normalizeNaceBusinessTypePayload(response.data)
    } catch (err: unknown) {
      // Only treat 404 as an expected "no mapping" response.
      // Any other status code (5xx, network timeout, parse error) is a real failure
      // that should be surfaced so monitoring can detect API degradation.
      const status = extractErrorStatus(err)

      const isNotFound =
        status === 404 || (err instanceof Error && err.message.toLowerCase().includes('not found'))

      if (isNotFound) {
        generalLogger.debug('[BusinessTypesAPI] No business type mapping for NACE code', {
          naceCode,
        })
        return null
      }

      // Unexpected error — log at warn level and re-throw so caller can handle / surface it
      generalLogger.warn('[BusinessTypesAPI] NACE lookup failed unexpectedly', {
        naceCode,
        status,
        error: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  /**
   * Get business types as options for dropdown (loads types then maps — prefer `businessTypesToOptions` if you already have types).
   */
  async getBusinessTypeOptions(signal?: AbortSignal): Promise<BusinessTypeOption[]> {
    const businessTypes = await this.getBusinessTypes(signal)
    return businessTypesToOptions(businessTypes)
  }

  // ==========================================================================
  // PHASE 2: ENHANCED METADATA METHODS
  // ==========================================================================

  /**
   * Get full business type with all metadata
   * Includes: questions, validations, benchmarks, metadata
   */
  async getBusinessTypeFull(businessTypeId: string): Promise<BusinessTypeFullMetadata | null> {
    try {
      const locale = this.getLocaleFromPathname()
      if (process.env.NODE_ENV === 'development') {
        generalLogger.debug(`[BusinessTypesApi] Fetching full metadata for: ${businessTypeId}`, {
          locale,
        })
      }

      const response = await this.api.get<ApiResponse<unknown>>(`/types/${businessTypeId}/full`, {
        params: { locale },
      })

      if (response.data.success && response.data.data) {
        const normalized = normalizeBusinessTypeFullMetadata(response.data.data, businessTypeId)
        if (!normalized) return null

        if (process.env.NODE_ENV === 'development') {
          generalLogger.debug(`[BusinessTypesApi] Full metadata loaded`, {
            businessTypeId,
            questionsCount: normalized.questions?.length || 0,
            validationsCount: normalized.validations?.length || 0,
            benchmarksCount: normalized.benchmarks?.length || 0,
          })
        }
        return normalized
      }

      return null
    } catch (error) {
      generalLogger.error(`[BusinessTypesApi] Failed to fetch full metadata`, {
        error,
        businessTypeId,
      })
      throw error
    }
  }

  /**
   * Get dynamic questions for a business type
   */
  async getBusinessTypeQuestions(
    businessTypeId: string,
    options?: BusinessTypeQuestionsOptions
  ): Promise<BusinessTypeQuestionsResponse | null> {
    try {
      generalLogger.debug(`[BusinessTypesApi] Fetching questions for: ${businessTypeId}`, options)

      const locale = this.getLocaleFromPathname()
      const params: Record<string, string | undefined> = {
        locale,
      }

      if (options?.flow_type) {
        params.flow_type = options.flow_type
      }

      if (options?.phase) {
        params.phase = options.phase
      }

      if (options?.existing_data) {
        params.existing_data = JSON.stringify(options.existing_data)
      }

      const response = await this.api.get<ApiResponse<unknown>>(
        `/types/${businessTypeId}/questions`,
        {
          params,
        }
      )

      if (response.data.success && response.data.data) {
        const normalized = normalizeQuestionsResponse(response.data.data, businessTypeId, options)

        if (process.env.NODE_ENV === 'development') {
          generalLogger.debug(`[BusinessTypesApi] Questions loaded`, {
            businessTypeId,
            totalQuestions: normalized.questions.length,
            requiredQuestions: normalized.total_required,
            estimatedTime: normalized.estimated_time,
          })
        }
        return normalized
      }

      return null
    } catch (error) {
      generalLogger.error(`[BusinessTypesApi] Failed to fetch questions`, { error, businessTypeId })
      throw error
    }
  }

  /**
   * Validate user data against business-type-specific rules
   */
  async validateBusinessTypeData(
    businessTypeId: string,
    data: Record<string, unknown>
  ): Promise<BusinessTypeValidationResult | null> {
    try {
      const locale = this.getLocaleFromPathname()
      generalLogger.debug(`[BusinessTypesApi] Validating data for: ${businessTypeId}`, {
        dataKeys: Object.keys(data),
        locale,
      })

      const response = await this.api.post<ApiResponse<unknown>>(
        `/types/${businessTypeId}/validate`,
        {
          data,
          locale,
        }
      )

      if (response.data.success && response.data.data) {
        const normalized = normalizeValidationResult(response.data.data, businessTypeId)

        generalLogger.debug(`[BusinessTypesApi] Validation complete`, {
          businessTypeId,
          valid: normalized.valid,
          errorsCount: normalized.errors.length,
          warningsCount: normalized.warnings.length,
          suggestionsCount: normalized.suggestions.length,
        })
        return normalized
      }

      return null
    } catch (error) {
      generalLogger.error(`[BusinessTypesApi] Validation failed`, { error, businessTypeId })
      throw error
    }
  }

  /**
   * Get industry benchmarks for a business type
   */
  async getBusinessTypeBenchmarks(
    businessTypeId: string,
    options?: {
      country?: string
      metrics?: string[]
      user_data?: Record<string, number>
    }
  ): Promise<BusinessTypeBenchmarksResponse | null> {
    try {
      generalLogger.debug(`[BusinessTypesApi] Fetching benchmarks for: ${businessTypeId}`, options)

      const locale = this.getLocaleFromPathname()
      const params: Record<string, string> = {
        locale,
      }

      if (options?.country) {
        params.country = options.country
      }

      if (options?.metrics && options.metrics.length > 0) {
        params.metrics = options.metrics.join(',')
      }

      if (options?.user_data) {
        params.user_data = JSON.stringify(options.user_data)
      }

      const response = await this.api.get<ApiResponse<BusinessTypeBenchmarksResponse>>(
        `/types/${businessTypeId}/benchmarks`,
        { params }
      )

      if (response.data.success && response.data.data) {
        generalLogger.debug(`[BusinessTypesApi] Benchmarks loaded`, {
          businessTypeId,
          benchmarksCount: Object.keys(response.data.data.benchmarks || {}).length,
          dataSource: response.data.data.data_source,
          year: response.data.data.year,
        })
        return response.data.data
      }

      return null
    } catch (error) {
      generalLogger.error(`[BusinessTypesApi] Failed to fetch benchmarks`, {
        error,
        businessTypeId,
      })
      throw error
    }
  }

  /**
   * Search business types (backend proxy: /api/business-types/types/search)
   */
  async searchBusinessTypes(
    query: string,
    limit: number = 5
  ): Promise<Array<{ text: string; confidence: number; reason: string }>> {
    if (!query || query.trim().length === 0) return []
    try {
      const locale = this.getLocaleFromPathname()
      const response = await this.api.get<ApiResponse<unknown>>('/types/search', {
        params: { q: query, limit, locale },
      })

      return normalizeBusinessTypeSearchResults(response.data?.data, query)
    } catch (error) {
      generalLogger.error('[BusinessTypesAPI] Failed to search business types', { error })
      return []
    }
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const businessTypesApiService = new BusinessTypesApiService()

export default businessTypesApiService
