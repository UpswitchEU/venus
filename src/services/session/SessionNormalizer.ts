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

import type { ValuationRequest, ValuationResponse } from '../../types/valuation'
import { generalLogger } from '../../utils/logger'

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

  // Client context (for accountant flow)
  clientContext: {
    accountantUserId: string
    clientUserId: string
    relationshipId: string
  } | null

  // Metadata
  dataSource: 'manual' | 'conversational' | 'mixed'
  hasExistingData: boolean
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
    ['business_type_id', 'businessTypeId'],
    ['business_context', 'businessContext'],
    ['government_bond_yield', 'governmentBondYield'],
    ['long_term_gdp_growth', 'longTermGdpGrowth'],
    ['ebitda'],
    ['use_dcf', 'useDcf'],
    ['use_multiples', 'useMultiples'],
    ['projection_years', 'projectionYears'],
    ['comparables'],
    ['_normalizations'],
    ['_taxLatencies'],
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

  // Fallback: populate revenue/ebitda from current_year_data when not at top-level
  // Venus saves 2025 data in current_year_data; form expects formData.revenue, formData.ebitda
  const cyd = fd.current_year_data as
    | { year?: number; revenue?: number | null; ebitda?: number | null }
    | undefined
  if (cyd && (fd.revenue === undefined || fd.ebitda === undefined)) {
    if (fd.revenue === undefined && cyd.revenue != null) (fd as any).revenue = Number(cyd.revenue)
    if (fd.ebitda === undefined && cyd.ebitda != null) (fd as any).ebitda = Number(cyd.ebitda)
  }

  return formData
}

/**
 * Extract valuation result from session data
 * Checks multiple possible locations and naming conventions
 */
function extractValuationResult(sessionData: any, topLevelSession: any): ValuationResponse | null {
  // Priority order for finding valuation result:
  // 1. Top-level session.valuationResult (camelCase)
  // 2. sessionData.valuationResult (camelCase)
  // 3. sessionData.valuation_result (snake_case)
  // 4. Top-level session.valuation_result (snake_case - legacy)
  // 5. Linked report: session.report.valuation_result (from Titan JOIN)

  const result =
    topLevelSession?.valuationResult ||
    sessionData?.valuationResult ||
    sessionData?.valuation_result ||
    topLevelSession?.valuation_result ||
    topLevelSession?.report?.valuation_result ||
    topLevelSession?.report?.valuationResult ||
    null

  return result
}

/**
 * Extract HTML report from session data
 * Checks multiple locations including valuation result and Titan-injected fields
 */
function extractHtmlReport(sessionData: any, topLevelSession: any): string | null {
  // Get valuation result first (may contain html_report)
  const valuationResult =
    topLevelSession?.valuationResult ||
    sessionData?.valuationResult ||
    sessionData?.valuation_result ||
    topLevelSession?.valuation_result ||
    topLevelSession?.report?.valuation_result ||
    null

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
        min: typeof min === 'string' ? parseFloat(min) : min || 0,
        mid: typeof mid === 'string' ? parseFloat(mid) : mid || 0,
        max: typeof max === 'string' ? parseFloat(max) : max || 0,
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

    // Context
    clientContext,
    dataSource: normalizeFlowType(backendSession.dataSource || sessionData.dataSource),
    hasExistingData: hasExistingData(formData, valuationResult, htmlReport),
  }

  generalLogger.debug('[SessionNormalizer] Normalized session data', {
    reportId: normalized.reportId,
    flowType: normalized.flowType,
    hasFormData: Object.keys(normalized.formData).length > 0,
    hasValuationResult: !!normalized.valuationResult,
    hasHtmlReport: !!normalized.htmlReport,
    hasPricingRange: !!normalized.pricingRange,
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
    clientContext: null,
    dataSource: 'manual',
    hasExistingData: false,
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
