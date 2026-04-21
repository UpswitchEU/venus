/**
 * Session Data Normalizer
 *
 * World-class data normalization layer that converts backend session data
 * to a consistent frontend format. This is the SINGLE source of truth for
 * all naming conversions between backend (snake_case) and frontend (camelCase).
 *
 * Key Principles:
 * - Normalize ONCE at the API boundary
 * - Handle both camelCase and snake_case inputs gracefully
 * - Provide type-safe output structure
 * - No scattered conversion logic elsewhere
 *
 * @module services/session/SessionNormalizer
 */

import { coalesceFiniteNumber } from '../../lib/omniPreview'
import type { ValuationRequest, ValuationResponse } from '../../types/valuation'
import {
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from '../../utils/fiscalYear'
import { extractValuationResultsMap } from '../../utils/extractValuationResultsMap'
import { generalLogger } from '../../utils/logger'
import {
  SESSION_PRE_SELECTED_VALUATION_METHOD_ALT_KEY,
  SESSION_PRE_SELECTED_VALUATION_METHOD_KEY,
  SESSION_PRE_SELECTED_METHODS_KEY,
  SESSION_USER_WEIGHTS_KEY,
  SESSION_USER_WEIGHT_JUSTIFICATION_KEY,
} from '../../constants/sessionUiKeys'
import {
  OPTIONAL_SESSION_PREFILL_SCALAR_KEYS,
  OPTIONAL_SESSION_STRUCT_SYNC_KEYS,
} from '../../utils/mergeOptionalSessionPrefillFields'

/**
 * Pricing range structure for valuation results
 */
export interface PricingRange {
  min: number
  mid: number
  max: number
  currency: string
}

/**
 * Normalized session data structure
 * All fields use consistent camelCase naming
 */
export interface NormalizedSessionData {
  // Session metadata
  reportId: string
  flowType: 'manual' | 'conversational'
  status: 'active' | 'completed' | 'expired'

  // Timestamps
  createdAt: Date | null
  updatedAt: Date | null
  completedAt: Date | null

  // Form data (normalized to frontend format)
  formData: Partial<ValuationRequest>

  // Valuation result (normalized)
  valuationResult: ValuationResponse | null
  htmlReport: string | null
  pricingRange: PricingRange | null
  reportReady: boolean

  // Client context (for accountant flow)
  clientContext: {
    accountantUserId: string
    clientUserId: string
    relationshipId: string
  } | null

  // Metadata
  dataSource: 'manual' | 'conversational' | 'mixed'
  hasExistingData: boolean

  /**
   * Upfront valuation method preference (session JSONB `_pre_selected_valuation_method`).
   * Only used when no valuation result exists yet; otherwise `selected_valuation_method` on the result wins.
   * `undefined` = key absent (do not overwrite store); `null` = explicitly adaptive; string = method key.
   */
  preSelectedValuationMethod: string | null | undefined

  /** Multi-method selection for blended valuation. */
  preSelectedMethods: string[] | undefined
  /** User-configured weights (method_key → 0-100). */
  userWeights: Record<string, number> | undefined
  /** Accountant justification for chosen weighting. */
  userWeightJustification: string | undefined
}

/**
 * Normalize flow type from various backend formats
 */
function normalizeFlowType(input: string | undefined | null): 'manual' | 'conversational' {
  if (!input) return 'manual'

  const normalized = input.toLowerCase().trim()

  switch (normalized) {
    case 'conversational':
    case 'ai-guided':
    case 'advanced':
      return 'conversational'
    case 'manual':
    case 'simple':
    default:
      return 'manual'
  }
}

/**
 * Extract form data from session data
 * Handles both camelCase and snake_case field names
 */
function extractFormData(sessionData: any): Partial<ValuationRequest> {
  if (!sessionData || typeof sessionData !== 'object') {
    return {}
  }

  // List of all form fields we want to extract
  // Each entry: [camelCase, snake_case alternatives...]
  const fieldMappings: [string, ...string[]][] = [
    ['company_name', 'companyName'],
    ['country_code', 'countryCode'],
    ['industry'],
    ['business_model', 'businessModel'],
    ['founding_year', 'foundingYear'],
    ['current_year_data', 'currentYearData'],
    ['historical_years_data', 'historicalYearsData'],
    ['forecast_years_data', 'forecastYearsData'],
    ['filing_year_confirmed', 'filingYearConfirmed'],
    ['number_of_employees', 'numberOfEmployees', 'employee_count', 'employeeCount'],
    ['number_of_owners', 'numberOfOwners'],
    ['recurring_revenue_percentage', 'recurringRevenuePercentage'],
    ['shares_for_sale', 'sharesForSale'],
    ['business_type', 'businessType'],
    ['revenue'],
    ['business_description', 'businessDescription'],
    ['business_highlights', 'businessHighlights'],
    ['reason_for_selling', 'reasonForSelling'],
    ['city'],
    ['kbo_number', 'kboNumber'],
    ['vat_number', 'vatNumber'],
    ['postal_code', 'postalCode'],
    ['legal_form', 'legalForm'],
    ['nace_code', 'naceCode'],
    ['nace_description', 'naceDescription'],
    ['activity_code', 'activityCode'],
    ['activity_label', 'activityLabel'],
    ['taxonomy'],
    ['canonical_nace_code', 'canonicalNaceCode'],
    ['business_type_id', 'businessTypeId'],
    ['business_context', 'businessContext'],
    ['government_bond_yield', 'governmentBondYield'],
    ['long_term_gdp_growth', 'longTermGdpGrowth'],
    ['ebitda'],
    ['use_dcf', 'useDcf'],
    ['use_multiples', 'useMultiples'],
    ['user_configured_dcf', 'userConfiguredDcf'],
    ['projection_years', 'projectionYears'],
    ['comparables'],
    ['_normalizations'],
    ['_taxLatencies'],
    ['_import_quality'],
    // Adjusted NAV + real-estate carve-out (manual left panel) — must round-trip through extractFormData
    ['nav_real_estate_adjustment', 'navRealEstateAdjustment'],
    ['nav_inventory_adjustment', 'navInventoryAdjustment'],
    ['nav_hidden_reserves', 'navHiddenReserves'],
    ['nav_goodwill_writeoff', 'navGoodwillWriteoff'],
    ['nav_receivables_adjustment', 'navReceivablesAdjustment'],
    ['nav_other_revaluations', 'navOtherRevaluations'],
    ['nav_tax_latency_pct', 'navTaxLatencyPct'],
    ['nav_off_balance_items', 'navOffBalanceItems'],
    ['exclude_real_estate', 'excludeRealEstate'],
    ['real_estate_book_value', 'realEstateBookValue'],
    ['estimated_market_rent', 'estimatedMarketRent'],
    ['owner_salary_addback', 'ownerSalaryAddback'],
    // DCF left-panel inputs — persisted by useFormSessionSync; must hydrate into manual form on restore
    ['dcf_input_mode', 'dcfInputMode'],
    ['dcf_revenue_growth_pct', 'dcfRevenueGrowthPct'],
    ['dcf_ebitda_margin_pct', 'dcfEbitdaMarginPct'],
    ['dcf_capex_pct', 'dcfCapexPct'],
    ['dcf_da_pct', 'dcfDaPct'],
    ['dcf_nwc_pct', 'dcfNwcPct'],
    ['dcf_tax_rate_pct', 'dcfTaxRatePct'],
    ['dcf_wacc_pct', 'dcfWaccPct'],
    ['dcf_terminal_growth_pct', 'dcfTerminalGrowthPct'],
    ['dcf_exit_multiple', 'dcfExitMultiple'],
    ['dcf_risk_free_rate_pct', 'dcfRiskFreeRatePct'],
    ['dcf_equity_risk_premium_pct', 'dcfEquityRiskPremiumPct'],
    ['dcf_beta', 'dcfBeta'],
    ['dcf_cost_of_debt_pct', 'dcfCostOfDebtPct'],
    ['dcf_debt_equity_pct', 'dcfDebtEquityPct'],
    ['dcf_tax_shield_pct', 'dcfTaxShieldPct'],
    ['dcf_terminal_value_method', 'dcfTerminalValueMethod'],
    // Adaptive / SaaS / revenue-quality / preparer / legacy tax rows — must mirror
    // `OPTIONAL_SESSION_PREFILL_SCALAR_KEYS` in mergeOptionalSessionPrefillFields.ts (except keys
    // already listed above: revenue, ebitda, shares, number_of_owners, business_highlights, etc.).
    ['subIndustry'],
    ['net_income', 'netIncome'],
    ['owner_role', 'ownerRole'],
    ['owner_hours', 'ownerHours'],
    ['delegation_capability', 'delegationCapability'],
    ['succession_plan', 'successionPlan'],
    ['saas_arr', 'saasArr'],
    ['saas_mrr', 'saasMrr'],
    ['saas_arr_growth_pct', 'saasArrGrowthPct'],
    ['saas_churn_pct', 'saasChurnPct'],
    ['saas_customer_churn_pct', 'saasCustomerChurnPct'],
    ['saas_nrr_pct', 'saasNrrPct'],
    ['saas_gross_margin_pct', 'saasGrossMarginPct'],
    ['saas_cac', 'saasCac'],
    ['saas_customer_concentration_pct', 'saasCustomerConcentrationPct'],
    ['saas_expansion_revenue_pct', 'saasExpansionRevenuePct'],
    ['saas_sm_spend', 'saasSmSpend'],
    ['rev_recurring_pct', 'revRecurringPct'],
    ['rev_recurring_amount', 'revRecurringAmount'],
    ['rev_top_client_concentration_pct', 'revTopClientConcentrationPct'],
    ['rev_top_client_amount', 'revTopClientAmount'],
    ['rev_contract_backlog', 'revContractBacklog'],
    ['rev_gross_churn_pct', 'revGrossChurnPct'],
    ['rev_capitalized_rd_amount', 'revCapitalizedRdAmount'],
    ['preparer_ev_ebitda_median', 'preparerEvEbitdaMedian'],
    ['preparer_ev_ebitda_override', 'preparerEvEbitdaOverride'],
    ['_internal_dcf_preference'],
    ['_internal_multiples_preference'],
    ['_internal_owner_dependency_impact'],
    ['_internal_key_metrics'],
    ['_internal_typical_employee_range'],
    ['_internal_typical_revenue_range'],
    ['tax_latencies', 'taxLatencies'],
    ['balance_sheet_adjustments', 'balanceSheetAdjustments'],
  ]

  const formData: Partial<ValuationRequest> = {}

  for (const [primaryKey, ...alternatives] of fieldMappings) {
    // Try primary key first, then alternatives
    let value = sessionData[primaryKey]

    if (value === undefined || value === null) {
      for (const alt of alternatives) {
        if (sessionData[alt] !== undefined && sessionData[alt] !== null) {
          value = sessionData[alt]
          break
        }
      }
    }

    if (value !== undefined && value !== null) {
      ;(formData as any)[primaryKey] = value
    }
  }

  // Venus now treats ownership percentage as a fixed 100% valuation invariant.
  // Normalize any legacy restored value so stale partial-share sessions cannot
  // re-enter current product state, but avoid fabricating data for truly empty sessions.
  if (Object.keys(formData).length > 0) {
    ;(formData as Partial<ValuationRequest>).shares_for_sale = 100
  }

  // Preserve manual history exactly as stored. Do not fabricate historical years from
  // current-year fields because that changes accountant-entered intent on restore.
  const fd = formData as Record<string, unknown>

  // Build historical_years_data from year_data when missing (PrefillResolver/bootstrap format)
  const yearData = sessionData.year_data ?? sessionData.yearData
  if (
    !fd.historical_years_data &&
    yearData &&
    typeof yearData === 'object' &&
    !Array.isArray(yearData)
  ) {
    const years = Object.keys(yearData)
      .map((y) => parseInt(y, 10))
      .filter((y) => !isNaN(y) && y >= 2000 && y <= 2100)
    if (years.length > 0) {
      fd.historical_years_data = years
        .sort((a, b) => a - b)
        .map((year) => {
          const data = (yearData as Record<number, { revenue?: number; ebitda?: number }>)[year]
          return {
            year,
            revenue: data?.revenue ?? 0,
            ebitda: data?.ebitda ?? 0,
          }
        })
    }
  }

  if (Array.isArray(fd.historical_years_data)) {
    fd.historical_years_data = normalizeHistoricalYearsForFiling(
      fd.historical_years_data as Array<{ year: number; revenue?: number; ebitda?: number }>,
      Boolean(fd.filing_year_confirmed)
    )
  }

  // Fallback: populate revenue/ebitda from current_year_data when not at top-level
  // Venus saves 2025 data in current_year_data; form expects formData.revenue, formData.ebitda
  const cyd = fd.current_year_data as
    | { year?: number; revenue?: number | null; ebitda?: number | null }
    | undefined
  if (cyd) {
    cyd.year = normalizeCurrentYearForFiling(cyd.year, Boolean(fd.filing_year_confirmed))
  }
  if (cyd && (fd.revenue === undefined || fd.ebitda === undefined)) {
    if (fd.revenue === undefined && cyd.revenue != null) (fd as any).revenue = Number(cyd.revenue)
    if (fd.ebitda === undefined && cyd.ebitda != null) (fd as any).ebitda = Number(cyd.ebitda)
  }

  // Activity presentation: canonical NACE for lookups; prefer activity_label for description
  const canonicalRaw =
    (typeof fd.canonical_nace_code === 'string' && fd.canonical_nace_code.trim()) ||
    (typeof fd.nace_code === 'string' && fd.nace_code.trim()) ||
    ''
  if (canonicalRaw) {
    ;(fd as any).canonical_nace_code = canonicalRaw
    ;(fd as any).nace_code = canonicalRaw
  }
  const activityLabel =
    (typeof fd.activity_label === 'string' && fd.activity_label.trim()) ||
    (typeof fd.nace_description === 'string' && fd.nace_description.trim()) ||
    ''
  if (activityLabel) {
    ;(fd as any).nace_description = activityLabel
  }

  promoteAdaptiveFieldsFromBusinessContext(fd, sessionData as Record<string, unknown>)

  return formData
}

/** Core financials / registry keys — never pull from `business_context` when top-level is missing. */
const SKIP_BUSINESS_CONTEXT_SCALAR_PROMOTE = new Set<string>([
  'revenue',
  'ebitda',
  'shares_for_sale',
  'activity_code',
  'canonical_nace_code',
])

/**
 * Titan persists adaptive inputs under `business_context`; Venus autosave also keeps top-level
 * `saas_*`, `dcf_*`, etc. Legacy blobs may only nest them — promote so the panel and
 * `buildValuationRequest` match.
 */
function promoteAdaptiveFieldsFromBusinessContext(
  fd: Record<string, unknown>,
  sessionData: Record<string, unknown>
): void {
  const rawBc =
    fd.business_context ?? sessionData.business_context ?? sessionData.businessContext
  if (!rawBc || typeof rawBc !== 'object' || Array.isArray(rawBc)) return
  const bc = rawBc as Record<string, unknown>

  for (const key of OPTIONAL_SESSION_PREFILL_SCALAR_KEYS) {
    if (SKIP_BUSINESS_CONTEXT_SCALAR_PROMOTE.has(key)) continue
    const cur = fd[key]
    if (cur !== undefined && cur !== null) continue
    const incoming = bc[key]
    if (incoming !== undefined && incoming !== null) {
      fd[key] = incoming
    }
  }

  for (const key of OPTIONAL_SESSION_STRUCT_SYNC_KEYS) {
    const cur = fd[key]
    if (cur !== undefined && cur !== null) continue
    const incoming = bc[key]
    if (incoming !== undefined && incoming !== null) {
      fd[key] = incoming
    }
  }

  const camelToInternal: [string, string][] = [
    ['keyMetrics', '_internal_key_metrics'],
    ['typicalEmployeeRange', '_internal_typical_employee_range'],
    ['typicalRevenueRange', '_internal_typical_revenue_range'],
    ['dcfPreference', '_internal_dcf_preference'],
    ['multiplesPreference', '_internal_multiples_preference'],
    ['ownerDependencyImpact', '_internal_owner_dependency_impact'],
  ]
  for (const [camel, snake] of camelToInternal) {
    const cur = fd[snake]
    if (cur !== undefined && cur !== null) continue
    const incoming = bc[camel]
    if (incoming !== undefined && incoming !== null) {
      fd[snake] = incoming
    }
  }
}

/**
 * Extract valuation result from session data
 * Checks multiple possible locations and naming conventions
 */
function extractValuationResult(sessionData: any, topLevelSession: any): ValuationResponse | null {
  const candidates = [
    topLevelSession?.valuationResult,
    sessionData?.valuationResult,
    sessionData?.valuation_result,
    topLevelSession?.valuation_result,
    topLevelSession?.report?.valuation_result,
    topLevelSession?.report?.valuationResult,
  ].filter((candidate) => candidate && typeof candidate === 'object') as ValuationResponse[]

  if (candidates.length === 0) return null

  const scoreCandidate = (candidate: Record<string, any>) => {
    let score = 0
    const valuationResultsCandidate = extractValuationResultsMap(candidate, {
      selectedValuationMethod: candidate.selected_valuation_method,
    })
    if (valuationResultsCandidate) {
      score += 8
    }
    if (candidate.html_report || candidate.htmlReport || candidate.details?.html_report) score += 4
    if (
      candidate.equity_value_mid != null ||
      candidate.valuation_midpoint != null ||
      candidate.pricing_range ||
      candidate.priceRange
    ) {
      score += 2
    }
    score += Math.min(Object.keys(candidate).length, 5)
    return score
  }

  return candidates.reduce((best, candidate) =>
    scoreCandidate(candidate as Record<string, any>) > scoreCandidate(best as Record<string, any>)
      ? candidate
      : best
  )
}

/**
 * Extract HTML report from session data
 * Checks multiple locations including valuation result and Titan-injected fields
 */
function extractHtmlReport(sessionData: any, topLevelSession: any): string | null {
  // Get valuation result first (may contain html_report)
  const valuationResult = extractValuationResult(sessionData, topLevelSession)

  return (
    // Direct top-level fields
    topLevelSession?.htmlReport ||
    sessionData?.htmlReport ||
    sessionData?.html_report ||
    topLevelSession?.html_report ||
    // Titan-injected field (prefixed with _)
    sessionData?._htmlReport ||
    // Inside valuation result
    valuationResult?.html_report ||
    valuationResult?.htmlReport ||
    valuationResult?.details?.html_report ||
    null
  )
}

/**
 * Extract pricing range from session data
 * Checks multiple locations including Titan-injected fields and valuation result
 */
function extractPricingRange(sessionData: any, topLevelSession: any): PricingRange | null {
  // Get valuation result for fallback extraction
  const valuationResult = extractValuationResult(sessionData, topLevelSession)

  // Priority 1: Titan-injected _pricingRange field
  if (sessionData?._pricingRange) {
    return sessionData._pricingRange
  }

  // Priority 2: Direct priceRange field (camelCase)
  if (sessionData?.priceRange) {
    return {
      min: sessionData.priceRange.min,
      mid: sessionData.priceRange.mid,
      max: sessionData.priceRange.max,
      currency: sessionData.priceRange.currency || 'EUR',
    }
  }

  // Priority 3: pricing_range from valuation result
  if ((valuationResult as any)?.pricing_range) {
    return (valuationResult as any).pricing_range
  }

  // Priority 4: priceRange from valuation result (camelCase)
  if ((valuationResult as any)?.priceRange) {
    return (valuationResult as any).priceRange
  }

  // Priority 5: Extract from valuation result equity values
  if (valuationResult) {
    const min = valuationResult.equity_value_low || (valuationResult as any).valuation_min
    const mid = valuationResult.equity_value_mid || (valuationResult as any).valuation_midpoint
    const max = valuationResult.equity_value_high || (valuationResult as any).valuation_max

    // Only return if we have at least one valid value
    if (min !== undefined || mid !== undefined || max !== undefined) {
      return {
        min: coalesceFiniteNumber(min),
        mid: coalesceFiniteNumber(mid),
        max: coalesceFiniteNumber(max),
        currency: (valuationResult as any).currency || 'EUR',
      }
    }
  }

  return null
}

/**
 * Extract client context from session data
 */
function extractClientContext(sessionData: any): NormalizedSessionData['clientContext'] {
  const context = sessionData?._client_context || sessionData?.clientContext

  if (!context) return null

  // Normalize field names
  const accountantUserId = context.accountant_user_id || context.accountantUserId
  const clientUserId = context.client_user_id || context.clientUserId
  const relationshipId = context.relationship_id || context.relationshipId

  if (!accountantUserId || !clientUserId) return null

  return {
    accountantUserId,
    clientUserId,
    relationshipId: relationshipId || '',
  }
}

/**
 * Check if session has meaningful existing data
 * Includes form inputs, valuation result, and HTML output for complete restoration
 */
function hasExistingData(
  formData: Partial<ValuationRequest>,
  valuationResult: any,
  htmlReport?: string | null
): boolean {
  // Has form data if company_name or key financial data exists
  const hasFormData = !!(
    formData.company_name ||
    formData.revenue ||
    formData.current_year_data ||
    formData.historical_years_data ||
    formData.kbo_number ||
    formData.business_type_id
  )

  // Has valuation result
  const hasResult = !!valuationResult

  // Has output assets (HTML reports)
  const hasOutput = !!htmlReport?.trim()

  return hasFormData || hasResult || hasOutput
}

function deriveReportReady(params: {
  backendSession: any
  valuationResult: ValuationResponse | null
  htmlReport: string | null
}): boolean {
  const explicitReady = params.backendSession?.reportReady
  if (typeof explicitReady === 'boolean') {
    return explicitReady
  }

  const status = params.backendSession?.status
  if (status === 'completed') {
    return !!(params.valuationResult || params.htmlReport?.trim())
  }

  return true
}

/**
 * Main normalization function
 *
 * Takes raw backend session data and converts it to a consistent
 * frontend format with all naming normalized to camelCase.
 *
 * @param backendSession - Raw session data from backend API
 * @returns Normalized session data ready for store hydration
 */
export function normalizeSessionData(backendSession: any): NormalizedSessionData {
  if (!backendSession) {
    generalLogger.warn('[SessionNormalizer] Received null/undefined session')
    return createEmptyNormalizedData('')
  }

  // Extract the nested session_data/sessionData
  const sessionData = backendSession.sessionData || backendSession.session_data || {}

  // Extract reportId from multiple possible sources
  const reportId = backendSession.reportId || backendSession.session_key || backendSession.id || ''

  // Extract and normalize all data
  const formData = extractFormData(sessionData)
  const valuationResult = extractValuationResult(sessionData, backendSession)
  const htmlReport = extractHtmlReport(sessionData, backendSession)
  const pricingRange = extractPricingRange(sessionData, backendSession)
  const clientContext = extractClientContext(sessionData)
  const reportReady = deriveReportReady({
    backendSession,
    valuationResult,
    htmlReport,
  })

  const preKey = SESSION_PRE_SELECTED_VALUATION_METHOD_KEY
  const altKey = SESSION_PRE_SELECTED_VALUATION_METHOD_ALT_KEY
  const hasPreKey =
    sessionData &&
    typeof sessionData === 'object' &&
    (preKey in sessionData || altKey in sessionData)
  const rawPre = hasPreKey
    ? (preKey in sessionData! ? (sessionData as any)[preKey] : (sessionData as any)[altKey])
    : undefined

  let preSelectedValuationMethod: string | null | undefined
  if (!hasPreKey) {
    preSelectedValuationMethod = undefined
  } else if (rawPre === null || rawPre === '') {
    preSelectedValuationMethod = null
  } else if (typeof rawPre === 'string' && rawPre.trim().length > 0) {
    preSelectedValuationMethod = rawPre.trim().toLowerCase()
  } else {
    preSelectedValuationMethod = undefined
  }

  const rawMethods = sessionData?.[SESSION_PRE_SELECTED_METHODS_KEY]
  const preSelectedMethods: string[] | undefined =
    Array.isArray(rawMethods) && rawMethods.every((m: unknown) => typeof m === 'string')
      ? rawMethods
      : undefined

  const rawWeights = sessionData?.[SESSION_USER_WEIGHTS_KEY]
  const userWeights: Record<string, number> | undefined =
    rawWeights && typeof rawWeights === 'object' && !Array.isArray(rawWeights)
      ? (rawWeights as Record<string, number>)
      : undefined

  const rawJustification = sessionData?.[SESSION_USER_WEIGHT_JUSTIFICATION_KEY]
  const userWeightJustification: string | undefined =
    typeof rawJustification === 'string' ? rawJustification : undefined

  const normalized: NormalizedSessionData = {
    // Metadata
    reportId,
    flowType: normalizeFlowType(backendSession.currentView || sessionData.currentView),
    status: backendSession.status || 'active',

    // Timestamps
    createdAt: backendSession.createdAt ? new Date(backendSession.createdAt) : null,
    updatedAt: backendSession.updatedAt ? new Date(backendSession.updatedAt) : null,
    completedAt: backendSession.completedAt ? new Date(backendSession.completedAt) : null,

    // Form data
    formData,

    // Valuation result and HTML
    valuationResult,
    htmlReport,
    pricingRange,
    reportReady,

    // Context
    clientContext,
    dataSource: normalizeFlowType(backendSession.dataSource || sessionData.dataSource),
    hasExistingData: hasExistingData(formData, valuationResult, htmlReport),
    preSelectedValuationMethod,
    preSelectedMethods,
    userWeights,
    userWeightJustification,
  }

  generalLogger.debug('[SessionNormalizer] Normalized session data', {
    reportId: normalized.reportId,
    flowType: normalized.flowType,
    hasFormData: Object.keys(normalized.formData).length > 0,
    hasValuationResult: !!normalized.valuationResult,
    hasHtmlReport: !!normalized.htmlReport,
    hasPricingRange: !!normalized.pricingRange,
    reportReady: normalized.reportReady,
    hasClientContext: !!normalized.clientContext,
    formDataKeys: Object.keys(normalized.formData),
  })

  return normalized
}

/**
 * Create empty normalized data structure
 */
export function createEmptyNormalizedData(reportId: string): NormalizedSessionData {
  return {
    reportId,
    flowType: 'manual',
    status: 'active',
    createdAt: null,
    updatedAt: null,
    completedAt: null,
    formData: {},
    valuationResult: null,
    htmlReport: null,
    pricingRange: null,
    reportReady: true,
    clientContext: null,
    dataSource: 'manual',
    hasExistingData: false,
    preSelectedValuationMethod: undefined,
    preSelectedMethods: undefined,
    userWeights: undefined,
    userWeightJustification: undefined,
  }
}

/**
 * Validate normalized session data
 * Returns true if data is valid for restoration
 */
export function validateNormalizedData(data: NormalizedSessionData): boolean {
  // Must have a reportId
  if (!data.reportId) {
    generalLogger.warn('[SessionNormalizer] Validation failed: missing reportId')
    return false
  }

  // Flow type must be valid
  if (!['manual', 'conversational'].includes(data.flowType)) {
    generalLogger.warn('[SessionNormalizer] Validation failed: invalid flowType', {
      flowType: data.flowType,
    })
    return false
  }

  return true
}
