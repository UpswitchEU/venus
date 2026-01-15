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
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.upswitch.app'
    
    // Normalize URL: remove /api suffix if present
    this.baseUrl = apiBaseUrl.replace(/\/api\/?$/, '')

    // Use correct Titan endpoint: /api/v2/business-types
    this.api = axios.create({
      baseURL: `${this.baseUrl}/api/v2/business-types`,
      timeout: 10000,
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
   * Get all business types from API with enhanced caching
   * Uses batched fetching like Mercury to ensure all 168+ types are loaded
   */
  async getBusinessTypes(): Promise<BusinessType[]> {
    try {
      const locale = this.getLocaleFromPathname()

      // CACHE INVALIDATION: Check if cached data is using old limit (50)
      // If so, clear cache to force refetch with new limit (200)
      if (businessTypesCache.hasValidCache()) {
        const cachedData = await businessTypesCache.getBusinessTypes()
        if (cachedData) {
          // If we have fewer than 100 types cached, it's likely old data with limit=50
          if (cachedData.businessTypes.length < 100) {
            generalLogger.warn('[BusinessTypesAPI] Cached data appears incomplete, clearing cache', {
              cachedCount: cachedData.businessTypes.length,
              expected: '168+',
            })
            await businessTypesCache.clear()
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

      // Fetch from API with locale parameter
      // Use batched fetching like Mercury to ensure all 168+ types are loaded
      generalLogger.debug('[BusinessTypesAPI] Fetching from API in batches', { locale })
      
      // Add cache buster to force fresh data (timestamp)
      const cacheBuster = Date.now()
      
      // First batch: 0-100
      const batch1Response = await this.api.get('/types', { 
        params: { limit: 100, offset: 0, locale, _t: cacheBuster } 
      })
      
      if (!batch1Response.data.success || !batch1Response.data.data) {
        throw new Error('API returned unsuccessful response')
      }

      let allBusinessTypes = [...batch1Response.data.data.business_types]
      console.log('🔍 [BUSINESS-TYPES-API] First batch loaded', {
        count: allBusinessTypes.length,
        hasMore: batch1Response.data.data.has_more,
        total: batch1Response.data.data.total,
      })

      // Second batch: 100-200 (if there are more)
      if (batch1Response.data.data.has_more) {
        const batch2Response = await this.api.get('/types', {
          params: { limit: 100, offset: 100, locale, _t: cacheBuster }
        })
        
        if (batch2Response.data.success && batch2Response.data.data) {
          allBusinessTypes = [...allBusinessTypes, ...batch2Response.data.data.business_types]
          console.log('🔍 [BUSINESS-TYPES-API] Second batch loaded', {
            count: batch2Response.data.data.business_types.length,
            totalNow: allBusinessTypes.length,
          })
        }
      }

      // Fetch categories
      const categoriesResponse = await this.api.get('/categories', { params: { locale } })
      const categories = categoriesResponse.data.success ? categoriesResponse.data.data : []

      // DIAGNOSTIC: Log final results
      console.log('🔍 [BUSINESS-TYPES-API] All batches complete', {
        totalCount: allBusinessTypes.length,
        categoriesCount: categories.length,
        hasTitleContainingRestaurant: allBusinessTypes.some(t => 
          t.title?.toLowerCase().includes('restaurant')
        ),
      })

      // Cache the complete data
      await businessTypesCache.setBusinessTypes({
        businessTypes: allBusinessTypes,
        categories,
        popularTypes: allBusinessTypes.filter((bt: BusinessType) => bt.popular),
      })

      generalLogger.info('[BusinessTypesAPI] Fetched and cached', { count: allBusinessTypes.length })
      return allBusinessTypes
    } catch (error) {
      generalLogger.error('[BusinessTypesAPI] Failed to fetch business types', { error })

      // Return hardcoded fallback
      generalLogger.warn('[BusinessTypesAPI] Using hardcoded fallback data')
      const fallbackData = this.getHardcodedBusinessTypes()

      return fallbackData
    }
  }

  /**
   * Get business types as options for dropdown
   */
  async getBusinessTypeOptions(): Promise<BusinessTypeOption[]> {
    const businessTypes = await this.getBusinessTypes()

    return businessTypes.map((bt) => ({
      value: bt.id,
      label: `${bt.icon} ${bt.title}`,
      icon: bt.icon,
      category: bt.category,
    }))
  }

  /**
   * Minimal hardcoded fallback business types
   * Uses the centralized fallback configuration
   */
  private getHardcodedBusinessTypes(): BusinessType[] {
    return BUSINESS_TYPES_FALLBACK.map((bt: ConfigBusinessTypeOption) => ({
      id: bt.value,
      title: bt.label.replace(/^[^\s]+\s/, ''), // Remove emoji
      description: `${bt.category} business`,
      short_description: `${bt.category} business`,
      icon: bt.icon || '📦',
      category: bt.category,
      category_id: bt.category.toLowerCase().replace(/\s+/g, '-'),
      industryMapping: bt.category,
      keywords: [bt.category.toLowerCase()],
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
    }))
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
