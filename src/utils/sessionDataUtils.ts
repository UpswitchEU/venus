/**
 * Session Data Utilities
 *
 * Single Responsibility: Utilities for detecting and working with session data
 * Shared across restoration hooks to ensure consistency
 *
 * @module utils/sessionDataUtils
 */

/**
 * Check if sessionData has meaningful data (not just empty object from NEW report)
 *
 * NEW reports are created optimistically with empty sessionData: {}
 * EXISTING reports have populated sessionData with form fields, results, etc.
 *
 * This is the single source of truth for detecting NEW vs EXISTING reports
 * based on sessionData content.
 *
 * ENHANCED: Also checks top-level session fields (valuationResult, htmlReport)
 * because backend stores these separately from sessionData.
 *
 * @param sessionData - Session data to check
 * @param session - Optional full session object to check top-level fields
 * @returns true if sessionData has meaningful fields OR session has top-level fields, false if empty (NEW report)
 *
 * @example
 * ```typescript
 * const sessionData = getSessionData()
 * if (hasMeaningfulSessionData(sessionData, session)) {
 *   // EXISTING report - restore data
 * } else {
 *   // NEW report - skip restoration
 * }
 * ```
 */
export function hasMeaningfulSessionData(sessionData: unknown, session?: unknown): boolean {
  const sessionRecord =
    session && typeof session === 'object' ? (session as Record<string, unknown>) : null

  // Check sessionData itself (form fields)
  if (sessionData && typeof sessionData === 'object') {
    const keys = Object.keys(sessionData)
    // Empty object means NEW report (unless session has top-level fields)
    if (keys.length === 0) {
      // Check top-level session fields before returning false
      if (sessionRecord?.valuationResult || sessionRecord?.htmlReport) {
        return true
      }
      return false
    }

    // Check if it has actual form fields (not just metadata)
    // These fields indicate the report has been worked on and has data to restore
    const meaningfulFields = [
      // Core financial data
      'company_name',
      'revenue',
      'ebitda',
      'current_year_data',
      'historical_years_data',
      'filing_year_confirmed',

      // Business identification
      'business_type',
      'business_type_id',
      'business_structure',
      'business_model',
      'industry',

      // Business details
      'business_description',
      'business_highlights',
      'reason_for_selling',

      // Location & basic info
      'country_code',
      'city',
      'founding_year',

      // Ownership
      'number_of_employees',
      'number_of_owners',

      // Generated content
      'html_report',
      'valuation_result',

      // Other user-entered data
      'comparables',
      'business_context',
      'recurring_revenue_percentage',
      'activity_code',
      'canonical_nace_code',
      'preparer_ev_ebitda_median',
      'real_estate_treatment',
      'real_estate_market_value',
      'real_estate_book_value',
      'estimated_market_rent',
      'multiple_calibration_adjustment',
      'multiple_calibration_note',
      'advisor_discount_weights',
      'risk_analysis_enabled',
      'discount_floor_factor',
      'historical_ebitda_weighting_mode',
      'historical_ebitda_weights',
      'show_enterprise_to_equity_bridge',
      'owner_role',
      'owner_hours',
      'delegation_capability',
      'succession_plan',
    ]

    if (keys.some((key) => meaningfulFields.includes(key))) {
      return true
    }

    // Persisted method-specific inputs (DCF, NAV, real estate, SaaS) without core identity rows yet
    if (
      keys.some(
        (key) =>
          key.startsWith('dcf_') ||
          key.startsWith('nav_') ||
          key.startsWith('saas_') ||
          key.startsWith('rev_')
      )
    ) {
      return true
    }
    if (
      keys.some((key) =>
        [
          'exclude_real_estate',
          'real_estate_book_value',
          'estimated_market_rent',
          'shares_for_sale',
          'tax_latencies',
          'balance_sheet_adjustments',
          'forecast_years_data',
          'use_dcf',
          'use_multiples',
        ].includes(key)
      )
    ) {
      return true
    }
  }

  // Check top-level session fields (valuationResult, htmlReport)
  // Backend stores these separately from sessionData
  if (sessionRecord?.valuationResult || sessionRecord?.htmlReport) {
    return true
  }

  return false
}
