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

export interface BusinessTypeQuestionsOptions {
  flow_type?: 'manual' | 'ai_guided'
  phase?: string
  existing_data?: Record<string, unknown>
}

export interface BusinessTypeQuestionTemplate {
  id: string
  text: string
  required: boolean
}

export interface BusinessTypeQuestionsResponse {
  business_type_id: string
  flow_type?: 'manual' | 'ai_guided'
  phase: string
  questions: BusinessTypeQuestionTemplate[]
  total_required: number
  estimated_time: number
  source?: string
}

export type BusinessTypeValidationSeverity = 'error' | 'warning' | 'info'

export interface BusinessTypeValidationIssue {
  field: string
  message: string
  type?: string
  rule?: string
  severity?: BusinessTypeValidationSeverity
}

export interface BusinessTypeValidationError {
  field: string
  rule: string
  message: string
  severity: 'error'
}

export interface BusinessTypeValidationWarning {
  field: string
  rule: string
  message: string
  severity: 'warning'
}

export interface BusinessTypeValidationSuggestion {
  field: string
  message: string
  severity: 'info'
  rule?: string
}

export interface BusinessTypeValidationResult {
  business_type_id: string
  valid: boolean
  errors: BusinessTypeValidationError[]
  warnings: BusinessTypeValidationWarning[]
  suggestions: BusinessTypeValidationSuggestion[]
  checked_fields?: number
  source?: string
}

/** Titan caps `limit` at 200 per request — one call loads the full ~168-type catalog. */
const BUSINESS_TYPES_PAGE_LIMIT = 200

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeQuestionTemplate(value: unknown, index: number): BusinessTypeQuestionTemplate {
  if (!isRecord(value)) {
    const id = `question-${index + 1}`
    return { id, text: id, required: false }
  }

  const id = asString(value.id, `question-${index + 1}`)
  return {
    id,
    text: asString(value.text, id),
    required: value.required === true,
  }
}

function normalizeQuestionsResponse(
  value: unknown,
  businessTypeId: string,
  options?: BusinessTypeQuestionsOptions
): BusinessTypeQuestionsResponse {
  const payload = isRecord(value) ? value : {}
  const questions = Array.isArray(payload.questions)
    ? payload.questions.map(normalizeQuestionTemplate)
    : []
  const totalRequired = questions.filter((question) => question.required).length
  const flowType =
    payload.flow_type === 'manual' || payload.flow_type === 'ai_guided'
      ? payload.flow_type
      : options?.flow_type

  return {
    business_type_id: asString(payload.business_type_id, businessTypeId),
    flow_type: flowType,
    phase: asString(payload.phase, options?.phase ?? 'initial'),
    questions,
    total_required: asNumber(payload.total_required, totalRequired),
    estimated_time: asNumber(payload.estimated_time, questions.length),
    source: asOptionalString(payload.source),
  }
}

function normalizeValidationIssue(value: unknown, fallbackField: string): BusinessTypeValidationIssue {
  if (typeof value === 'string') {
    return {
      field: fallbackField,
      message: value,
    }
  }

  if (!isRecord(value)) {
    return {
      field: fallbackField,
      message: 'Validation issue',
    }
  }

  return {
    field: asString(value.field, fallbackField),
    message: asString(value.message, 'Validation issue'),
    type: asOptionalString(value.type),
    rule: asOptionalString(value.rule),
    severity:
      value.severity === 'error' || value.severity === 'warning' || value.severity === 'info'
        ? value.severity
        : undefined,
  }
}

function issueRule(issue: BusinessTypeValidationIssue, fallback: string): string {
  return issue.rule ?? issue.type ?? fallback
}

function normalizeValidationResult(
  value: unknown,
  businessTypeId: string
): BusinessTypeValidationResult {
  const payload = isRecord(value) ? value : {}
  const errors = Array.isArray(payload.errors)
    ? payload.errors.map((error) => {
        const issue = normalizeValidationIssue(error, 'general')
        return {
          field: issue.field,
          rule: issueRule(issue, 'validation'),
          message: issue.message,
          severity: 'error' as const,
        }
      })
    : []

  const warnings = Array.isArray(payload.warnings)
    ? payload.warnings.map((warning) => {
        const issue = normalizeValidationIssue(warning, 'general')
        return {
          field: issue.field,
          rule: issueRule(issue, 'warning'),
          message: issue.message,
          severity: 'warning' as const,
        }
      })
    : []

  const suggestions = Array.isArray(payload.suggestions)
    ? payload.suggestions.map((suggestion) => {
        const issue = normalizeValidationIssue(suggestion, 'general')
        return {
          field: issue.field,
          rule: issue.rule ?? issue.type,
          message: issue.message,
          severity: 'info' as const,
        }
      })
    : []

  return {
    business_type_id: asString(payload.business_type_id, businessTypeId),
    valid: typeof payload.valid === 'boolean' ? payload.valid : errors.length === 0,
    errors,
    warnings,
    suggestions,
    checked_fields:
      typeof payload.checked_fields === 'number' && Number.isFinite(payload.checked_fields)
        ? payload.checked_fields
        : undefined,
    source: asOptionalString(payload.source),
  }
}

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

      const response = await this.api.get<ApiResponse<unknown>>(`/types/${businessTypeId}/questions`, {
        params,
      })

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

      const response = await this.api.post<ApiResponse<unknown>>(`/types/${businessTypeId}/validate`, {
        data,
        locale,
      })

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
