import { formatBusinessTypeCategory } from '../utils/businessTypeCategory'
import { normalizeBusinessTypeId } from '../utils/businessTypeIdAliases'

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
  suggestedWeight?: number | string | null
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
export const BUSINESS_TYPES_PAGE_LIMIT = 200

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

export function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function parseDecimalEnvelope(value: Record<string, unknown>): number | undefined {
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

export function asNumber(value: unknown, fallback: number): number {
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

export function asOptionalNumber(value: unknown): number | undefined {
  const parsed = asNumber(value, Number.NaN)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

export function asRange(value: unknown): { min: number; max: number } | undefined {
  if (!isRecord(value)) return undefined
  const min = asNumber(value.min, Number.NaN)
  const max = asNumber(value.max, Number.NaN)
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : undefined
}

export function normalizeBusinessType(value: unknown): BusinessType | null {
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

export function normalizeBusinessTypes(value: unknown): BusinessType[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const businessType = normalizeBusinessType(item)
    return businessType ? [businessType] : []
  })
}

export function extractErrorStatus(error: unknown): unknown {
  if (!isRecord(error)) return undefined
  const response = isRecord(error.response) ? error.response : undefined
  return response?.status ?? error.status ?? error.code
}

export function getSearchCandidates(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (!isRecord(value)) return []
  if (Array.isArray(value.business_types)) return value.business_types
  if (Array.isArray(value.results)) return value.results
  if (Array.isArray(value.data)) return value.data
  return []
}

export function normalizeQuestionTemplate(
  value: unknown,
  index: number
): BusinessTypeQuestionTemplate {
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

export function normalizeQuestionsResponse(
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

export function normalizeValidationIssue(
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

export function issueRule(issue: BusinessTypeValidationIssue, fallback: string): string {
  return issue.rule ?? issue.type ?? fallback
}

export function normalizeValidationResult(
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

export function normalizeMetricList(value: unknown): BusinessTypeFullMetric[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string' && item.trim().length > 0) {
      return [{ name: item, label: item }]
    }
    return isRecord(item) ? [item as BusinessTypeFullMetric] : []
  })
}

export function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

export function normalizeBusinessTypeFullMetadata(
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
