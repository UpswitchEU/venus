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
import {
  BUSINESS_TYPES_FALLBACK,
  BusinessTypeOption as ConfigBusinessTypeOption,
} from '../config/businessTypes'
import { getApiUrl } from '../utils/getMercuryUrl'
import { generalLogger } from '../utils/logger'
import { businessTypesCache } from './cache/businessTypesCache'

// ============================================================================
// TYPES
// ============================================================================

export interface BusinessType {
  id: string
  title: string
  description: string
  short_description?: string
  icon: string
  category: string
  category_id: string
  industryMapping: string
  industry?: string
  keywords: string[]
  popular: boolean
  dcfPreference?: number
  multiplesPreference?: number
  ownerDependencyImpact?: number
  keyMetrics?: string[]
  typicalEmployeeRange?: { min: number; max: number }
  typicalRevenueRange?: { min: number; max: number }
  status: string
  createdAt: string
  updatedAt: string
}

export interface BusinessTypeOption {
  value: string
  label: string
  icon?: string
  category: string
}

/** Titan caps `limit` at 200 per request — one call loads the full ~168-type catalog. */
const BUSINESS_TYPES_PAGE_LIMIT = 200

/** Pure mapping for dropdowns; avoids a second `getBusinessTypes()` round-trip when types are already loaded. */
export function businessTypesToOptions(businessTypes: BusinessType[]): BusinessTypeOption[] {
  return businessTypes.map((bt) => ({
    value: bt.id,
    label: `${bt.icon || '🏢'} ${bt.title}`,
    icon: bt.icon || '🏢',
    category: bt.category,
  }))
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  cached?: boolean
  timestamp: string
}

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
    const match = window.location.pathname.match(/^\/(en|nl)/)
    return (match?.[1] as 'en' | 'nl') || 'en'
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
        if (cachedData) {
          // If we have fewer than 100 types cached, it's likely old data with limit=50
          if (cachedData.businessTypes.length < 100) {
            generalLogger.warn(
              '[BusinessTypesAPI] Cached data appears incomplete, clearing cache',
              {
                cachedCount: cachedData.businessTypes.length,
                expected: '168+',
              }
            )
            businessTypesCache.clearBusinessTypes()
            // Continue to API fetch below
          } else {
            generalLogger.debug('[BusinessTypesAPI] Serving from cache', {
              businessTypes: cachedData.businessTypes.length,
              categories: cachedData.categories.length,
              popularTypes: cachedData.popularTypes.length,
            })
            return cachedData.businessTypes
          }
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

      const typesResponse = typesSettled.value
      if (!typesResponse.data.success || !typesResponse.data.data) {
        throw new Error('API returned unsuccessful response')
      }

      let categories: Array<{ id: string; name: string; icon: string }> = []
      if (categoriesSettled.status === 'fulfilled') {
        const cr = categoriesSettled.value
        if (cr.data?.success && cr.data.data) {
          categories = cr.data.data
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

      const first = typesResponse.data.data
      const firstTypes = first.business_types ?? []
      const allBusinessTypes: BusinessType[] = [...firstTypes]
      let hasMore = Boolean(first.has_more)
      let offset = BUSINESS_TYPES_PAGE_LIMIT
      const maxExtraPages = 8

      for (let p = 0; p < maxExtraPages && hasMore; p++) {
        const next = await this.api.get('/types', {
          params: {
            limit: BUSINESS_TYPES_PAGE_LIMIT,
            offset,
            locale,
            _t: cacheBuster,
          },
          signal,
        })
        if (!next.data.success || !next.data.data) break
        const pageTypes = next.data.data.business_types ?? []
        allBusinessTypes.push(...pageTypes)
        hasMore = Boolean(next.data.data.has_more)
        offset += BUSINESS_TYPES_PAGE_LIMIT
      }

      // Cache the complete data
      await businessTypesCache.setBusinessTypes({
        businessTypes: allBusinessTypes,
        categories,
        popularTypes: allBusinessTypes.filter((bt: BusinessType) => bt.popular),
      })

      generalLogger.info('[BusinessTypesAPI] Fetched and cached', {
        count: allBusinessTypes.length,
      })
      return allBusinessTypes
    } catch (error) {
      generalLogger.error('[BusinessTypesAPI] Failed to fetch business types', { error })
      throw error instanceof Error
        ? error
        : new Error('Bedrijfstypes laden mislukt. Probeer het later opnieuw.')
    }
  }

  /**
   * Get business type for a NACE code (reverse lookup).
   * Uses Titan's NACE→business type mapping (same as Mercury).
   * Returns null if no mapping exists.
   */
  async getBusinessTypeForNaceCode(
    naceCode: string,
    countryCode?: string
  ): Promise<BusinessType | null> {
    if (!naceCode?.trim()) return null
    const normalizedCountry = countryCode?.trim().toUpperCase() || ''
    const marketCountryCode = normalizedCountry === 'UK' ? 'GB' : normalizedCountry

    try {
      const params = new URLSearchParams({ naceCode: naceCode.trim() })
      if (marketCountryCode) {
        params.set('country_code', marketCountryCode)
      }
      const url = `${this.baseUrl}/api/v2/nace/codes/${encodeURIComponent(
        naceCode.trim()
      )}/business-type?${params.toString()}`
      const response = await axios.get<{ business_type: any; confidence: number }>(url, {
        timeout: 5000,
        headers: { Accept: 'application/json' },
      })

      const bt = response.data?.business_type
      if (!bt?.id) return null

      return {
        id: bt.id,
        title: bt.title || bt.id,
        description: bt.description || '',
        short_description: bt.description || '',
        icon: bt.emoji || '📦',
        category: bt.category?.name ?? bt.category?.title ?? bt.category_id ?? 'other',
        category_id: bt.category_id ?? 'other',
        industryMapping: bt.industry_mapping ?? bt.id,
        industry: bt.industry ?? bt.category_id,
        keywords: [],
        popular: false,
        status: bt.status ?? 'active',
        createdAt: bt.created_at ?? new Date().toISOString(),
        updatedAt: bt.updated_at ?? new Date().toISOString(),
      }
    } catch (err: unknown) {
      // Only treat 404 as an expected "no mapping" response.
      // Any other status code (5xx, network timeout, parse error) is a real failure
      // that should be surfaced so monitoring can detect API degradation.
      const status = (err as any)?.response?.status ?? (err as any)?.status ?? (err as any)?.code

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

  /**
   * Minimal hardcoded fallback business types
   * Uses the centralized fallback configuration
   */
  private getHardcodedBusinessTypes(): BusinessType[] {
    return BUSINESS_TYPES_FALLBACK.map((bt: ConfigBusinessTypeOption) => {
      const cat = typeof bt.category === 'string' ? bt.category : String(bt.category ?? '')
      const catLower = cat.toLowerCase().replace(/\s+/g, '-')
      return {
        id: bt.value,
        title: bt.label.replace(/^[^\s]+\s/, ''), // Remove emoji
        description: `${cat} business`,
        short_description: `${cat} business`,
        icon: bt.icon || '📦',
        category: cat,
        category_id: catLower,
        industryMapping: cat,
        keywords: [cat.toLowerCase()],
        popular: true,
        // Add default preferences for fallback data
        dcfPreference: 0.47,
        multiplesPreference: 0.53,
        ownerDependencyImpact: 0.5,
        keyMetrics: ['revenue', 'ebitda', 'growth_rate'],
        typicalEmployeeRange: { min: 1, max: 50 },
        typicalRevenueRange: { min: 100000, max: 5000000 },
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    })
  }

  // ==========================================================================
  // PHASE 2: ENHANCED METADATA METHODS
  // ==========================================================================

  /**
   * Get full business type with all metadata
   * Includes: questions, validations, benchmarks, metadata
   */
  async getBusinessTypeFull(businessTypeId: string): Promise<any> {
    try {
      const locale = this.getLocaleFromPathname()
      if (process.env.NODE_ENV === 'development') {
        generalLogger.debug(`[BusinessTypesApi] Fetching full metadata for: ${businessTypeId}`, {
          locale,
        })
      }

      const response = await this.api.get(`/types/${businessTypeId}/full`, {
        params: { locale },
      })

      if (response.data.success && response.data.data) {
        if (process.env.NODE_ENV === 'development') {
          generalLogger.debug(`[BusinessTypesApi] Full metadata loaded`, {
            businessTypeId,
            questionsCount: response.data.data.questions?.length || 0,
            validationsCount: response.data.data.validations?.length || 0,
            benchmarksCount: response.data.data.benchmarks?.length || 0,
          })
        }
        return response.data.data
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
    options?: {
      flow_type?: 'manual' | 'ai_guided'
      phase?: string
      existing_data?: Record<string, unknown>
    }
  ): Promise<{
    questions?: Array<{ id: string; text: string; required: boolean }>
    total_required?: number
    estimated_time?: number
  } | null> {
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

      const response = await this.api.get(`/types/${businessTypeId}/questions`, { params })

      if (response.data.success && response.data.data) {
        if (process.env.NODE_ENV === 'development') {
          generalLogger.debug(`[BusinessTypesApi] Questions loaded`, {
            businessTypeId,
            totalQuestions: response.data.data.questions?.length || 0,
            requiredQuestions: response.data.data.total_required || 0,
            estimatedTime: response.data.data.estimated_time,
          })
        }
        return response.data.data
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
  async validateBusinessTypeData(businessTypeId: string, data: Record<string, any>): Promise<any> {
    try {
      const locale = this.getLocaleFromPathname()
      generalLogger.debug(`[BusinessTypesApi] Validating data for: ${businessTypeId}`, {
        dataKeys: Object.keys(data),
        locale,
      })

      const response = await this.api.post(`/types/${businessTypeId}/validate`, {
        data,
        locale,
      })

      if (response.data.success && response.data.data) {
        generalLogger.debug(`[BusinessTypesApi] Validation complete`, {
          businessTypeId,
          valid: response.data.data.valid,
          errorsCount: response.data.data.errors?.length || 0,
          warningsCount: response.data.data.warnings?.length || 0,
          suggestionsCount: response.data.data.suggestions?.length || 0,
        })
        return response.data.data
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
  ): Promise<any> {
    try {
      generalLogger.debug(`[BusinessTypesApi] Fetching benchmarks for: ${businessTypeId}`, options)

      const locale = this.getLocaleFromPathname()
      const params: any = {
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

      const response = await this.api.get(`/types/${businessTypeId}/benchmarks`, { params })

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
      const response = await this.api.get('/types/search', {
        params: { q: query, limit, locale },
      })

      const raw = response?.data
      // Flexible parsing: handle various possible shapes
      const candidates = raw?.data?.business_types || raw?.data?.results || raw?.data || []

      return (candidates as any[])
        .map((item, idx) => ({
          text: item?.title || item?.name || item?.label || query,
          confidence: typeof item?.confidence === 'number' ? item.confidence : 0.7,
          reason: item?.category || item?.industry || item?.description || 'Similar business type',
          _index: idx,
        }))
        .filter((s) => !!s.text)
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
