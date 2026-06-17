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
import { formatBusinessTypeCategory } from '../utils/businessTypeCategory'
import { normalizeBusinessTypeId } from '../utils/businessTypeIdAliases'
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
  evEbitdaMedian?: number
  evEbitdaP10?: number
  evEbitdaP25?: number
  evEbitdaP75?: number
  evEbitdaP90?: number
  evRevenueMedian?: number
  evRevenueP10?: number
  evRevenueP25?: number
  evRevenueP75?: number
  evRevenueP90?: number
  peRatioMedian?: number
  peRatioP10?: number
  peRatioP25?: number
  peRatioP75?: number
  peRatioP90?: number
  multipleBasis?: string
  lowSampleSuppressed?: boolean
  primaryMultiple?: {
    metric?: string | null
    label?: string | null
    median?: number | null
    p25?: number | null
    p75?: number | null
    basis?: string | null
    lowSampleSuppressed?: boolean | null
  }
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

export interface BusinessTypeFullMetric extends Record<string, unknown> {
  label?: string
  name?: string
}

export interface BusinessTypeFullQuestion extends Record<string, unknown> {
  required?: boolean
}

export interface BusinessTypeFullMetadata extends Record<string, unknown> {
  id: string
  title: string
  short_title?: string
  description: string
  icon: string
  category_id: string
  sector: string
  industry: string
  sub_industry?: string
  primary_model: string
  secondary_models?: string[]
  revenue_streams?: unknown[]
  color_hex?: string
  dcf_preference: number
  multiples_preference: number
  preferred_multiples?: string[]
  owner_dependency_impact: number
  typical_revenue_min?: number
  typical_revenue_max?: number
  typical_revenue_median?: number
  typical_ebitda_margin_min?: number
  typical_ebitda_margin_max?: number
  typical_ebitda_margin_median?: number
  typical_employee_min?: number
  typical_employee_max?: number
  typical_employee_median?: number
  key_metrics?: BusinessTypeFullMetric[]
  risk_factors?: unknown[]
  market_maturity?: string
  market_trend?: string
  seasonality_impact?: string
  economic_sensitivity?: string
  relevant_countries?: string[]
  urban_rural_split?: string
  questions: BusinessTypeFullQuestion[]
  validations: unknown[]
  benchmarks: unknown[]
  metadata: unknown[]
  status: string
  version: number
  created_at: string
  updated_at: string
}

export interface BusinessTypeBenchmarksResponse extends Record<string, unknown> {
  benchmarks?: Record<string, unknown>
  data_source?: string
  year?: string | number
}

/** Titan caps `limit` at 200 per request — one call loads the full active catalog. */
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

function parseDecimalEnvelope(value: Record<string, unknown>): number | undefined {
  const sign = value.s
  const exponent = value.e
  const digits = value.d
  if (
    typeof sign !== 'number' ||
    typeof exponent !== 'number' ||
    !Array.isArray(digits) ||
    digits.length === 0 ||
    !digits.every((part) => typeof part === 'number' && Number.isFinite(part))
  ) {
    return undefined
  }

  const compactDigits = digits.map((part, index) => {
    const text = Math.trunc(Math.abs(part)).toString()
    return index === 0 ? text : text.padStart(7, '0')
  })
  const intDigits = compactDigits.join('').replace(/^0+(?=\d)/, '')
  const decimalIndex = exponent + 1
  const numericText =
    decimalIndex <= 0
      ? `0.${'0'.repeat(Math.abs(decimalIndex))}${intDigits}`
      : decimalIndex >= intDigits.length
        ? `${intDigits}${'0'.repeat(decimalIndex - intDigits.length)}`
        : `${intDigits.slice(0, decimalIndex)}.${intDigits.slice(decimalIndex)}`

  const parsed = Number(`${sign < 0 ? '-' : ''}${numericText}`)
  return Number.isFinite(parsed) ? parsed : undefined
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  if (isRecord(value)) {
    const parsed = parseDecimalEnvelope(value)
    if (parsed !== undefined) return parsed
  }
  return fallback
}

function asOptionalNumber(value: unknown): number | undefined {
  const parsed = asNumber(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : undefined
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

function asRange(value: unknown): { min: number; max: number } | undefined {
  if (!isRecord(value)) return undefined
  const min = asNumber(value.min, Number.NaN)
  const max = asNumber(value.max, Number.NaN)
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : undefined
}

function normalizeBusinessType(value: unknown): BusinessType | null {
  if (!isRecord(value)) return null

  const id = asOptionalString(value.id)
  if (!id) return null

  const categoryId = asString(value.category_id, asString(value.categoryId, 'other'))
  const now = new Date().toISOString()
  const rawPrimaryMultiple = value.primaryMultiple ?? value.primary_multiple
  const primaryMultiple = isRecord(rawPrimaryMultiple) ? rawPrimaryMultiple : null

  return {
    id,
    title: asString(value.title, id),
    description: asString(value.description),
    short_description: asOptionalString(value.short_description ?? value.shortDescription),
    icon: asString(value.icon, asString(value.emoji, '🏢')),
    category: formatBusinessTypeCategory(value.category, categoryId),
    category_id: categoryId,
    industryMapping: asString(value.industryMapping, asString(value.industry_mapping, id)),
    industry: asOptionalString(value.industry),
    keywords: asStringArray(value.keywords),
    popular: value.popular === true,
    dcfPreference: asOptionalNumber(value.dcfPreference ?? value.dcf_preference),
    multiplesPreference: asOptionalNumber(value.multiplesPreference ?? value.multiples_preference),
    ownerDependencyImpact: asOptionalNumber(
      value.ownerDependencyImpact ?? value.owner_dependency_impact
    ),
    keyMetrics: asStringArray(value.keyMetrics ?? value.key_metrics),
    typicalEmployeeRange: asRange(value.typicalEmployeeRange ?? value.typical_employee_range),
    typicalRevenueRange: asRange(value.typicalRevenueRange ?? value.typical_revenue_range),
    evEbitdaMedian: asOptionalNumber(value.evEbitdaMedian ?? value.ev_ebitda_median),
    evEbitdaP10: asOptionalNumber(value.evEbitdaP10 ?? value.ev_ebitda_p10),
    evEbitdaP25: asOptionalNumber(value.evEbitdaP25 ?? value.ev_ebitda_p25),
    evEbitdaP75: asOptionalNumber(value.evEbitdaP75 ?? value.ev_ebitda_p75),
    evEbitdaP90: asOptionalNumber(value.evEbitdaP90 ?? value.ev_ebitda_p90),
    evRevenueMedian: asOptionalNumber(value.evRevenueMedian ?? value.ev_revenue_median),
    evRevenueP10: asOptionalNumber(value.evRevenueP10 ?? value.ev_revenue_p10),
    evRevenueP25: asOptionalNumber(value.evRevenueP25 ?? value.ev_revenue_p25),
    evRevenueP75: asOptionalNumber(value.evRevenueP75 ?? value.ev_revenue_p75),
    evRevenueP90: asOptionalNumber(value.evRevenueP90 ?? value.ev_revenue_p90),
    peRatioMedian: asOptionalNumber(value.peRatioMedian ?? value.pe_ratio_median),
    peRatioP10: asOptionalNumber(value.peRatioP10 ?? value.pe_ratio_p10),
    peRatioP25: asOptionalNumber(value.peRatioP25 ?? value.pe_ratio_p25),
    peRatioP75: asOptionalNumber(value.peRatioP75 ?? value.pe_ratio_p75),
    peRatioP90: asOptionalNumber(value.peRatioP90 ?? value.pe_ratio_p90),
    multipleBasis: asOptionalString(value.multipleBasis ?? value.multiple_basis),
    lowSampleSuppressed: value.lowSampleSuppressed === true || value.low_sample_suppressed === true,
    primaryMultiple: primaryMultiple
      ? {
          metric: asOptionalString(primaryMultiple.metric),
          label: asOptionalString(primaryMultiple.label),
          median: asOptionalNumber(primaryMultiple.median),
          p25: asOptionalNumber(primaryMultiple.p25),
          p75: asOptionalNumber(primaryMultiple.p75),
          basis: asOptionalString(primaryMultiple.basis),
          lowSampleSuppressed:
            primaryMultiple.lowSampleSuppressed === true ||
            primaryMultiple.low_sample_suppressed === true,
        }
      : undefined,
    status: asString(value.status, 'active'),
    createdAt: asString(value.createdAt, asString(value.created_at, now)),
    updatedAt: asString(value.updatedAt, asString(value.updated_at, now)),
  }
}

function normalizeBusinessTypes(value: unknown): BusinessType[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const businessType = normalizeBusinessType(item)
    return businessType ? [businessType] : []
  })
}

function extractErrorStatus(error: unknown): unknown {
  if (!isRecord(error)) return undefined
  const response = isRecord(error.response) ? error.response : undefined
  return response?.status ?? error.status ?? error.code
}

function getSearchCandidates(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!isRecord(value)) return []
  if (Array.isArray(value.business_types)) return value.business_types
  if (Array.isArray(value.results)) return value.results
  if (Array.isArray(value.data)) return value.data
  return []
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
    business_type_id:
      normalizeBusinessTypeId(payload.business_type_id) ??
      normalizeBusinessTypeId(businessTypeId) ??
      businessTypeId,
    flow_type: flowType,
    phase: asString(payload.phase, options?.phase ?? 'initial'),
    questions,
    total_required: asNumber(payload.total_required, totalRequired),
    estimated_time: asNumber(payload.estimated_time, questions.length),
    source: asOptionalString(payload.source),
  }
}

function normalizeValidationIssue(
  value: unknown,
  fallbackField: string
): BusinessTypeValidationIssue {
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
    business_type_id:
      normalizeBusinessTypeId(payload.business_type_id) ??
      normalizeBusinessTypeId(businessTypeId) ??
      businessTypeId,
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

function normalizeMetricList(value: unknown): BusinessTypeFullMetric[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string' && item.trim().length > 0) {
      return [{ name: item, label: item }]
    }
    return isRecord(item) ? [item as BusinessTypeFullMetric] : []
  })
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

function normalizeBusinessTypeFullMetadata(
  value: unknown,
  businessTypeId: string
): BusinessTypeFullMetadata | null {
  if (!isRecord(value)) return null

  const id =
    normalizeBusinessTypeId(value.id) ?? normalizeBusinessTypeId(businessTypeId) ?? businessTypeId
  const rangeValue = value.typicalRevenueRange ?? value.typical_revenue_range
  const range = isRecord(rangeValue) ? rangeValue : {}
  const employeeValue = value.typicalEmployeeRange ?? value.typical_employee_range
  const employees = isRecord(employeeValue) ? employeeValue : {}
  const categoryId = asString(value.category_id ?? value.categoryId, 'other')
  const now = new Date().toISOString()

  return {
    ...value,
    id,
    title: asString(value.title, id),
    short_title: asOptionalString(value.short_title ?? value.shortTitle),
    description: asString(value.description),
    icon: asString(value.icon, asString(value.emoji, '🏢')),
    category_id: categoryId,
    sector: asString(value.sector, 'services'),
    industry: asString(
      value.industry,
      asString(value.industryMapping ?? value.industry_mapping, id)
    ),
    sub_industry: asOptionalString(value.sub_industry ?? value.subIndustry),
    primary_model: asString(value.primary_model ?? value.primaryModel, ''),
    secondary_models: normalizeStringArray(value.secondary_models ?? value.secondaryModels),
    revenue_streams: Array.isArray(value.revenue_streams ?? value.revenueStreams)
      ? ((value.revenue_streams ?? value.revenueStreams) as unknown[])
      : [],
    color_hex: asOptionalString(value.color_hex ?? value.colorHex),
    dcf_preference: asNumber(value.dcf_preference ?? value.dcfPreference, 0.5),
    multiples_preference: asNumber(value.multiples_preference ?? value.multiplesPreference, 0.5),
    owner_dependency_impact: asNumber(
      value.owner_dependency_impact ?? value.ownerDependencyImpact,
      0.5
    ),
    typical_revenue_min: asOptionalNumber(
      value.typical_revenue_min ?? value.typicalRevenueMin ?? range.min
    ),
    typical_revenue_max: asOptionalNumber(
      value.typical_revenue_max ?? value.typicalRevenueMax ?? range.max
    ),
    typical_revenue_median: asOptionalNumber(
      value.typical_revenue_median ?? value.typicalRevenueMedian ?? range.median
    ),
    typical_ebitda_margin_min: asOptionalNumber(
      value.typical_ebitda_margin_min ?? value.typicalEbitdaMarginMin
    ),
    typical_ebitda_margin_max: asOptionalNumber(
      value.typical_ebitda_margin_max ?? value.typicalEbitdaMarginMax
    ),
    typical_ebitda_margin_median: asOptionalNumber(
      value.typical_ebitda_margin_median ?? value.typicalEbitdaMarginMedian
    ),
    typical_employee_min: asOptionalNumber(
      value.typical_employee_min ?? value.typicalEmployeeMin ?? employees.min
    ),
    typical_employee_max: asOptionalNumber(
      value.typical_employee_max ?? value.typicalEmployeeMax ?? employees.max
    ),
    typical_employee_median: asOptionalNumber(
      value.typical_employee_median ?? value.typicalEmployeeMedian ?? employees.median
    ),
    key_metrics: normalizeMetricList(value.key_metrics ?? value.keyMetrics),
    risk_factors: Array.isArray(value.risk_factors ?? value.riskFactors)
      ? ((value.risk_factors ?? value.riskFactors) as unknown[])
      : [],
    market_maturity: asOptionalString(value.market_maturity ?? value.marketMaturity),
    market_trend: asOptionalString(value.market_trend ?? value.marketTrend),
    seasonality_impact: asOptionalString(value.seasonality_impact ?? value.seasonalityImpact),
    economic_sensitivity: asOptionalString(value.economic_sensitivity ?? value.economicSensitivity),
    relevant_countries: normalizeStringArray(value.relevant_countries ?? value.relevantCountries),
    urban_rural_split: asOptionalString(value.urban_rural_split ?? value.urbanRuralSplit),
    questions: Array.isArray(value.questions)
      ? (value.questions as BusinessTypeFullQuestion[])
      : [],
    validations: Array.isArray(value.validations) ? value.validations : [],
    benchmarks: Array.isArray(value.benchmarks) ? value.benchmarks : [],
    metadata: Array.isArray(value.metadata) ? value.metadata : [],
    status: asString(value.status, 'active'),
    version: asNumber(value.version, 1),
    created_at: asString(value.created_at ?? value.createdAt, now),
    updated_at: asString(value.updated_at ?? value.updatedAt, now),
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
        if (cachedData) {
          // If we have fewer than 100 types cached, it's likely old data with limit=50
          if (cachedData.businessTypes.length < 100) {
            generalLogger.warn(
              '[BusinessTypesAPI] Cached data appears incomplete, clearing cache',
              {
                cachedCount: cachedData.businessTypes.length,
                expected: '100+ fresh catalog entries',
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
      const firstTypes = normalizeBusinessTypes(first.business_types)
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
        const pageTypes = normalizeBusinessTypes(next.data.data.business_types)
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

      const bt = isRecord(response.data?.business_type) ? response.data.business_type : null
      const businessTypeId = normalizeBusinessTypeId(asOptionalString(bt?.id))
      if (!bt || !businessTypeId) return null

      const category = isRecord(bt.category) ? bt.category : {}
      const categoryId = asString(bt.category_id, 'other')

      return {
        id: businessTypeId,
        title: asString(bt.title, businessTypeId),
        description: asString(bt.description),
        short_description: asString(bt.description),
        icon: asString(bt.emoji, '📦'),
        category: asString(category.name, asString(category.title, categoryId)),
        category_id: categoryId,
        industryMapping: asString(bt.industry_mapping, businessTypeId),
        industry: asString(bt.industry, categoryId),
        keywords: [],
        popular: false,
        status: asString(bt.status, 'active'),
        createdAt: asString(bt.created_at, new Date().toISOString()),
        updatedAt: asString(bt.updated_at, new Date().toISOString()),
      }
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

      return getSearchCandidates(response.data?.data)
        .map((candidate) => {
          const item = isRecord(candidate) ? candidate : {}
          return {
            text: asString(item.title, asString(item.name, asString(item.label, query))),
            confidence: asNumber(item.confidence, 0.7),
            reason: asString(
              item.category,
              asString(item.industry, asString(item.description, 'Similar business type'))
            ),
          }
        })
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
