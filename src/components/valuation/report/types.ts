/**
 * Valuation Report Types
 *
 * Single source of truth for valuation report data.
 * Used by both web UI and PDF generation.
 *
 * These types match the ValuationReportData schema from ValuationIQ.
 */

export interface ValuationMetric {
  label: string
  value: string
  change?: number
  category?: 'financial' | 'operational' | 'growth'
}

export interface EBITDAAdjustment {
  id: string
  label: string
  value: number
  type: 'add' | 'subtract' | 'base' | 'result'
  category: 'owner' | 'nonRecurring' | 'accounting' | 'normalization' | 'base' | 'result'
  description?: string
  // Grootboek source tracking for accountant audit trail
  source?:
    | 'yuki'
    | 'exact'
    | 'odoo'
    | 'octopus'
    | 'accountable'
    | 'manual'
    | 'suggestion'
  sourceRef?: string // e.g., "Yuki 613xxx", "Exact 4000-4999"
  status?: 'approved' | 'pending' | 'rejected'
  approvedBy?: string // Accountant name who approved
}

// Accountant/Advisor branding for co-branded reports
export interface AccountantBranding {
  firmName: string
  logoUrl?: string
  // Optional contact info for footer
  website?: string
  email?: string
}

// Multi-year EBITDA data for weighted average calculation
export interface YearlyEBITDA {
  year: number
  reportedEbitda: number
  normalizedEbitda: number
  weight: number // e.g., 0.5 for most recent, 0.3, 0.2 for older years
  adjustments?: EBITDAAdjustment[]
}

export interface ValuationReportData {
  // Core identification
  id: string
  companyName: string
  generatedAt: Date | string

  // Valuation results
  valuation: number
  valuationLow?: number
  valuationHigh?: number

  // EBITDA data (single year or weighted average)
  ebitda: number // Sustainable EBITDA (weighted average if multi-year)
  reportedEbitda?: number // Latest year reported (before normalization)
  latestNormalizedEbitda?: number // Latest year after normalization (for context)
  ebitdaAdjustments?: EBITDAAdjustment[]

  // Multi-year EBITDA for weighted average (accountant-requested)
  multiYearEbitda?: YearlyEBITDA[]

  // Multiple data
  multiple: number
  multipleRange?: {
    low: number
    high: number
  }

  // Company context
  industry?: string
  industryEmoji?: string // e.g., '🥐' for bakery, '🍽️' for restaurant
  revenue?: number
  employeeCount?: number
  foundedYear?: number
  countryCode?: string

  // Metrics grid
  metrics: ValuationMetric[]

  // Analysis (methodology-focused only)
  methodology?: string
  methodologyNotes?: string

  // Comparable transactions
  comparables?: {
    company: string
    multiple: number
    revenue?: number
    date?: string
  }[]

  // Co-branding for accountants/advisors
  accountant?: AccountantBranding

  // Confidence and risk
  confidenceLevel?: 'low' | 'medium' | 'high'
  confidenceScore?: number
  riskFactors?: string[]
  valueDrivers?: string[]

  // Python-generated HTML report (main 5-page report)
  htmlReport?: string

  // Recommended asking price (premium over equity mid)
  recommendedAskingPrice?: number
}

/**
 * Convert ValuationResponse API response to report data format.
 *
 * Maps from the actual ValuationResponse fields (equity_value_mid, multiples_valuation, etc.)
 * to the ValuationReportData shape consumed by UI components.
 */
export function convertApiResponseToReportData(
  apiResponse: Record<string, unknown>
): ValuationReportData {
  const multiples = apiResponse.multiples_valuation as Record<string, unknown> | undefined
  const currentYear = apiResponse.current_year_data as Record<string, unknown> | undefined
  const financialMetrics = apiResponse.financial_metrics as Record<string, unknown> | undefined

  const ebitda = Number(currentYear?.ebitda || 0)
  const revenue = Number(currentYear?.revenue || 0)
  const ebitdaMultiple = Number(multiples?.ebitda_multiple || 0)

  return {
    id: String(apiResponse.valuation_id || apiResponse.id || ''),
    companyName: String(apiResponse.company_name || apiResponse.companyName || ''),
    generatedAt: apiResponse.timestamp
      ? new Date(String(apiResponse.timestamp))
      : apiResponse.generated_at
        ? new Date(String(apiResponse.generated_at))
        : new Date(),

    valuation: Number(apiResponse.equity_value_mid || 0),
    valuationLow:
      apiResponse.equity_value_low != null ? Number(apiResponse.equity_value_low) : undefined,
    valuationHigh:
      apiResponse.equity_value_high != null ? Number(apiResponse.equity_value_high) : undefined,

    ebitda,
    reportedEbitda:
      apiResponse.reported_ebitda != null ? Number(apiResponse.reported_ebitda) : undefined,
    latestNormalizedEbitda:
      apiResponse.latest_normalized_ebitda != null
        ? Number(apiResponse.latest_normalized_ebitda)
        : undefined,
    ebitdaAdjustments: Array.isArray(apiResponse.ebitda_adjustments)
      ? apiResponse.ebitda_adjustments.map((adj: Record<string, unknown>) => ({
          id: String(adj.id || ''),
          label: String(adj.label || ''),
          value: Number(adj.value || 0),
          type: String(adj.type || 'add') as EBITDAAdjustment['type'],
          category: String(adj.category || 'normalization') as EBITDAAdjustment['category'],
          description: adj.description ? String(adj.description) : undefined,
          source: adj.source ? (String(adj.source) as EBITDAAdjustment['source']) : undefined,
          sourceRef: adj.source_ref ? String(adj.source_ref) : undefined,
          status: adj.status ? (String(adj.status) as EBITDAAdjustment['status']) : undefined,
          approvedBy: adj.approved_by ? String(adj.approved_by) : undefined,
        }))
      : [],

    multiple: ebitdaMultiple,
    multipleRange:
      multiples?.p25_ebitda_multiple != null && multiples?.p75_ebitda_multiple != null
        ? {
            low: Number(multiples.p25_ebitda_multiple),
            high: Number(multiples.p75_ebitda_multiple),
          }
        : undefined,

    industry: apiResponse.industry ? String(apiResponse.industry) : undefined,
    industryEmoji: apiResponse.industry_emoji ? String(apiResponse.industry_emoji) : undefined,
    revenue: revenue || undefined,
    employeeCount:
      apiResponse.employee_count != null ? Number(apiResponse.employee_count) : undefined,
    foundedYear: apiResponse.founded_year != null ? Number(apiResponse.founded_year) : undefined,
    countryCode: apiResponse.country_code ? String(apiResponse.country_code) : undefined,
    metrics: Array.isArray(apiResponse.metrics)
      ? apiResponse.metrics.map((m: Record<string, unknown>) => ({
          label: String(m.label || ''),
          value: String(m.value || ''),
          change: m.change != null ? Number(m.change) : undefined,
          category: m.category ? (String(m.category) as ValuationMetric['category']) : undefined,
        }))
      : [],
    methodology: apiResponse.methodology ? String(apiResponse.methodology) : undefined,
    methodologyNotes: apiResponse.methodology_notes
      ? String(apiResponse.methodology_notes)
      : undefined,
    confidenceLevel: apiResponse.overall_confidence
      ? (String(
          apiResponse.overall_confidence
        ).toLowerCase() as ValuationReportData['confidenceLevel'])
      : apiResponse.confidence_level
        ? (String(apiResponse.confidence_level) as ValuationReportData['confidenceLevel'])
        : undefined,
    confidenceScore:
      apiResponse.confidence_score != null ? Number(apiResponse.confidence_score) : undefined,
    riskFactors: Array.isArray(apiResponse.risk_factors)
      ? apiResponse.risk_factors.map(String)
      : undefined,
    valueDrivers: Array.isArray(apiResponse.value_drivers)
      ? apiResponse.value_drivers.map(String)
      : Array.isArray(apiResponse.key_value_drivers)
        ? (apiResponse.key_value_drivers as string[]).map(String)
        : undefined,

    htmlReport: apiResponse.html_report ? String(apiResponse.html_report) : undefined,
    recommendedAskingPrice:
      apiResponse.recommended_asking_price != null
        ? Number(apiResponse.recommended_asking_price)
        : undefined,
  } as ValuationReportData
}
