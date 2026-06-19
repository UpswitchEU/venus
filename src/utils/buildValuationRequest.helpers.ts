import type { CustomAdjustment, NormalizationAdjustment } from '../types/ebitdaNormalization'
import { ValidationError } from '../types/errors'
import type { ValuationFormData, ValuationRequest, YearDataInput } from '../types/valuation'
import {
  isFilingYearConfirmedValue,
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from './fiscalYear'
import { parseFlexibleNumber } from './isFiniteNumeric'
import { generalLogger } from './logger'

export interface NormYearEntry {
  totalAdjustment: number
  count: number
  confidence: string
  hasCustomAdjustments: boolean
  items: Array<{
    category: string
    amount: number
    label?: string
    note?: string
    source: string
    confidence: string
    ledger_code?: string
  }>
}

export function toFiniteNumber(value: unknown): number | null {
  return parseFlexibleNumber(value) ?? null
}

export function hasValidHistoricalEbitdaWeights(weights: Record<number, number>): boolean {
  const values = Object.values(weights)
  if (values.length < 3 || values.length > 5) return false
  if (values.some((weight) => weight < 0)) return false

  const total = values.reduce((sum, weight) => sum + weight, 0)
  return Math.abs(total - 100) <= 2 || Math.abs(total - 1) <= 0.02
}

export function toBooleanOrNull(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null

  const normalized = value.trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false
  return null
}

export function normalizeMultipleTypeWeights(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const weights: Record<string, number> = {}
  for (const [key, rawValue] of Object.entries(value)) {
    const numeric = toFiniteNumber(rawValue)
    if (numeric == null) continue
    if (numeric < 0 || numeric > 100) {
      throw new ValidationError(
        'Multiple-type blend weights must be between 0% and 100%.',
        `multiple_type_weights.${key}`,
        rawValue
      )
    }
    weights[key] = numeric
  }

  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0)
  if (total <= 0) return null
  const ratioMode = total <= 1.5
  const normalized = Object.fromEntries(
    Object.entries(weights).map(([key, weight]) => [
      key,
      Math.round((ratioMode ? weight * 100 : weight) * 100) / 100,
    ])
  )
  const normalizedTotal = Object.values(normalized).reduce((sum, weight) => sum + weight, 0)
  if (Math.abs(normalizedTotal - 100) > 1) {
    throw new ValidationError(
      'Multiple-type blend weights must sum to 100%.',
      'multiple_type_weights',
      value
    )
  }
  return normalized
}

export function normalizeAdvisorDiscountWeights(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const weights: Record<string, number> = {}
  for (const [key, rawValue] of Object.entries(value)) {
    const numeric = toFiniteNumber(rawValue)
    if (numeric == null) continue
    if (numeric < 0 || numeric > 2) {
      throw new ValidationError(
        'Advisor discount influence must be between 0.00x and 2.00x.',
        `advisor_discount_weights.${key}`,
        rawValue
      )
    }
    weights[key] = Math.round(numeric * 100) / 100
  }
  return Object.keys(weights).length > 0 ? weights : null
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const trimmed = String(value).trim()
  return trimmed.length > 0 ? trimmed : null
}

export function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    const cleaned = toNonEmptyString(value)
    if (cleaned) return cleaned
  }
  return null
}

function cleanParsedCity(value: string | undefined): string | null {
  const cleaned = value?.replace(/^[,;\-\s]+|[,;\s]+$/g, '').trim()
  return cleaned ? cleaned : null
}

export function parsePostalCityFromAddress(value: unknown): {
  postalCode: string | null
  city: string | null
} {
  const raw = toNonEmptyString(value)
  if (!raw) return { postalCode: null, city: null }

  const normalized = raw
    .replace(/\s+/g, ' ')
    .replace(/^[,;\s]+|[,;\s]+$/g, '')
    .trim()
  const candidates = [
    normalized,
    ...normalized
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .reverse(),
  ]

  for (const candidate of candidates) {
    const nlMatch = candidate.match(/^(\d{4})\s*([A-Za-z]{2})(?:\s+(.+))?$/)
    if (nlMatch) {
      return {
        postalCode: `${nlMatch[1]} ${nlMatch[2].toUpperCase()}`,
        city: cleanParsedCity(nlMatch[3]),
      }
    }

    const fourDigitMatch = candidate.match(/^(\d{4})(?:\s+|[,;-]+)(.+)$/)
    if (fourDigitMatch) {
      return {
        postalCode: fourDigitMatch[1],
        city: cleanParsedCity(fourDigitMatch[2]),
      }
    }
  }

  return { postalCode: null, city: null }
}

export function requireNonNegativeRevenue(value: unknown, field: string): number {
  const revenue = toFiniteNumber(value)

  if (revenue === null || revenue < 0) {
    throw new ValidationError('Revenue is required and cannot be negative.', field, value)
  }

  return revenue
}

const YEAR_DATA_OPTIONAL_FIELDS = [
  'cogs',
  'gross_profit',
  'operating_expenses',
  'ebit',
  'capex',
  'depreciation',
  'amortization',
  'interest_expense',
  'tax_expense',
  'net_income',
  'total_assets',
  'current_assets',
  'cash',
  'accounts_receivable',
  'accounts_payable',
  'inventory',
  'total_liabilities',
  'current_liabilities',
  'short_term_debt',
  'total_debt',
  'total_equity',
  'nwc_change',
  'free_cash_flow',
  'paid_up_capital',
  'deferred_tax_liabilities',
] as const

const NON_NEGATIVE_YEAR_FIELDS = new Set<string>([
  'cogs',
  'operating_expenses',
  'capex',
  'depreciation',
  'amortization',
  'total_assets',
  'current_assets',
  'cash',
  'accounts_receivable',
  'inventory',
  'total_liabilities',
  'current_liabilities',
  'total_debt',
  'paid_up_capital',
  'deferred_tax_liabilities',
])

export function pickOptionalYearDataFields(source: unknown): Record<string, number> {
  if (source === undefined || source === null || typeof source !== 'object') {
    return {}
  }

  const record = source as Record<string, unknown>
  const result: Record<string, number> = {}

  for (const field of YEAR_DATA_OPTIONAL_FIELDS) {
    const numeric = toFiniteNumber(record[field])
    if (numeric === null) {
      continue
    }
    if (NON_NEGATIVE_YEAR_FIELDS.has(field) && numeric < 0) {
      continue
    }
    result[field] = numeric
  }

  return result
}

export function hasPositiveHistoricalRevenue(source: YearDataInput): boolean {
  const revenue = toFiniteNumber(source.revenue)
  return revenue !== null && revenue > 0
}

function hasRealRevenueOrEbitda(source: { revenue?: unknown; ebitda?: unknown }): boolean {
  const revenue = toFiniteNumber(source.revenue)
  const ebitda = toFiniteNumber(source.ebitda)
  return (revenue !== null && revenue !== 0) || (ebitda !== null && ebitda !== 0)
}

function getLatestRealHistoricalRow(rows: YearDataInput[]): YearDataInput | null {
  return (
    rows.filter(hasRealRevenueOrEbitda).sort((a, b) => Number(b.year) - Number(a.year))[0] ?? null
  )
}

export function resolveCurrentYearFromHistoricalBackstop(args: {
  formData: ValuationFormData
  normalizedCurrentYear: number
  normalizedHistoricalData: YearDataInput[]
}): { currentYearData?: YearDataInput; promoted: boolean } {
  const current = args.formData.current_year_data
  const latestHistorical = getLatestRealHistoricalRow(args.normalizedHistoricalData)
  if (!latestHistorical) {
    return { currentYearData: current, promoted: false }
  }

  const topLevelHasRealFigures = hasRealRevenueOrEbitda({
    revenue: args.formData.revenue,
    ebitda: args.formData.ebitda,
  })
  const currentMissing = !current && !topLevelHasRealFigures
  const currentPlaceholder = !hasRealRevenueOrEbitda({
    revenue: current?.revenue,
    ebitda: current?.ebitda,
  })
  const canTreatCurrentAsStalePlaceholder =
    currentPlaceholder &&
    !topLevelHasRealFigures &&
    !isFilingYearConfirmedValue(args.formData.filing_year_confirmed) &&
    latestHistorical.year <= args.normalizedCurrentYear

  if (!currentMissing && !canTreatCurrentAsStalePlaceholder) {
    return { currentYearData: current, promoted: false }
  }

  generalLogger.warn('[buildValuationRequest] Promoted latest historical row to current year', {
    business_name: args.formData.company_name,
    stale_current_year: current?.year ?? args.normalizedCurrentYear,
    promoted_year: latestHistorical.year,
    revenue: latestHistorical.revenue,
    ebitda: latestHistorical.ebitda,
    note: 'A placeholder current-year row would have produced a zero basis year. Using the latest imported actual year instead.',
  })

  return { currentYearData: latestHistorical, promoted: true }
}

export function mapLegacyNormalizationAdjustment(
  adjustment: NormalizationAdjustment
): NormYearEntry['items'][number] {
  return {
    category: adjustment.category ?? 'other_adjustments',
    amount: toFiniteNumber(adjustment.amount) ?? 0,
    source: 'manual',
    confidence: adjustment.confidence ?? 'medium',
    ...(adjustment.ledger_code && { ledger_code: adjustment.ledger_code }),
  }
}

export function mapLegacyCustomAdjustment(
  adjustment: CustomAdjustment
): NormYearEntry['items'][number] {
  return {
    category: 'other_adjustments',
    amount: toFiniteNumber(adjustment.amount) ?? 0,
    source: 'manual',
    confidence: 'medium',
  }
}

export function logValuationRequestDebug(request: ValuationRequest): void {
  if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') return

  generalLogger.debug('buildValuationRequest: Request structure', {
    company_name: request.company_name,
    industry: request.industry,
    business_model: request.business_model,
    business_type_id: request.business_type_id,
    has_current_year_data: !!request.current_year_data,
    current_year_revenue: request.current_year_data?.revenue,
    current_year_ebitda: request.current_year_data?.ebitda,
    has_historical_data: !!request.historical_years_data?.length,
    number_of_employees: request.number_of_employees,
    number_of_owners: request.number_of_owners,
  })
}
