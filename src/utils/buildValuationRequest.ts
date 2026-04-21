/**
 * Build Valuation Request
 *
 * Single Responsibility: Build ValuationRequest from formData or DataResponse[]
 * Unified function used by both manual and conversational flows
 *
 * @module utils/buildValuationRequest
 */

import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationModal'
import { useEbitdaNormalizationStore } from '../store/useEbitdaNormalizationStore'
import { mapFrontendCategoryToBackend, useNormalizationStore } from '../store/useNormalizationStore'
import { calculateLatencyAmount, useTaxLatencyStore } from '../store/useTaxLatencyStore'
import type { DataResponse } from '../types/data-collection'
import { ValidationError } from '../types/errors'
import type { ValuationFormData, ValuationRequest } from '../types/valuation'
import { convertDataResponsesToFormData } from './dataCollectionUtils'
import {
  getCurrentFilingYear,
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from './fiscalYear'
import { generalLogger } from './logger'
import { hasUsableOfficialFinancialsContent } from './officialFinancialsContent'
import { deriveNwcChangesForActualYears } from './yearData'

interface NormYearEntry {
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

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function requireNonNegativeRevenue(value: unknown, field: string): number {
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
])

function pickOptionalYearDataFields(source: unknown): Record<string, number> {
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

/**
 * Build ValuationRequest from formData or DataResponse[]
 *
 * Unified function that normalizes data and builds ValuationRequest ready for API.
 * Used by both manual flow (formData) and conversational flow (DataResponse[]).
 *
 * Normalization Rules (from DATA_FLOW.md):
 * - Year validation (2000-2100)
 * - Recurring revenue clamping (0.0-1.0)
 * - Company name trimming
 * - Country code uppercase
 * - Industry/business model defaults
 * - Financial data merging
 * - Historical data filtering
 * - Sole trader handling
 * - Business context mapping
 *
 * @param source - Either ValuationFormData or DataResponse[] array
 * @param overrideItems - If provided, use these normalizations instead of reading from the store.
 *                        Eliminates a redundant store read when the caller already has the items.
 * @param locale - Report language ('nl' or 'en'). Passed through to ValuationIQ for i18n.
 * @returns ValuationRequest ready for calculateValuation()
 */
export function buildValuationRequest(
  source: ValuationFormData | DataResponse[],
  overrideItems?: NormalizationItem[],
  locale?: 'nl' | 'en'
): ValuationRequest {
  // Convert DataResponse[] to formData if needed
  let formData: ValuationFormData
  if (Array.isArray(source)) {
    formData = convertDataResponsesToFormData(source) as ValuationFormData
  } else {
    formData = source
  }

  // Respect an explicitly selected filing year when the accountant confirms a newer year.
  const currentFiscalYear = normalizeCurrentYearForFiling(
    formData.current_year_data?.year,
    Boolean(formData.filing_year_confirmed)
  )

  // Normalize founding year (1900-2100)
  const foundingYear = Math.min(
    Math.max(formData.founding_year || currentFiscalYear - 5, 1900),
    2100
  )

  // Normalize company name
  const companyName = formData.company_name?.trim() || 'Unknown Company'

  // Normalize country code (2-letter uppercase).
  // Prefer `country_code`; manual panel may only have synced `country` until the store bridge runs.
  const countryRaw =
    formData.country_code?.trim() ||
    (formData as { country?: string }).country?.trim() ||
    ''
  const countryCode = (countryRaw || 'BE').toUpperCase().substring(0, 2)

  // Normalize industry and business model
  // Priority: formData.industry > business_type metadata > default
  // Note: When business_type_id is selected, industry should be set in formData
  // by BasicInformationSection.tsx, but we ensure it's not empty here
  let industry = formData.industry
  let businessModel = formData.business_model

  // If industry is missing but business_type_id is present, log warning
  // (industry should have been set when business type was selected)
  if (!industry && formData.business_type_id) {
    generalLogger.warn(
      '[buildValuationRequest] Industry missing despite business_type_id being set',
      {
        business_type_id: formData.business_type_id,
      }
    )
  }

  // Apply defaults only if still missing
  industry = industry || 'services'
  businessModel = businessModel || 'services'

  // Normalize financial data.
  // Revenue: treat 0 as a valid value (pre-revenue startup). Only fall back to
  // current_year_data when the form field is truly absent (null/undefined).
  const rawRevenue =
    formData.revenue != null
      ? Number(formData.revenue)
      : formData.current_year_data?.revenue != null
        ? Number(formData.current_year_data.revenue)
        : null
  const revenue = requireNonNegativeRevenue(rawRevenue, 'current_year_data.revenue')

  // EBITDA: accept 0 as a legitimate break-even value; only warn if truly absent.
  const rawEbitdaNum =
    formData.ebitda !== undefined && formData.ebitda !== null
      ? Number(formData.ebitda)
      : formData.current_year_data?.ebitda !== undefined &&
          formData.current_year_data?.ebitda !== null
        ? Number(formData.current_year_data.ebitda)
        : null
  const rawEbitda = rawEbitdaNum !== null && !Number.isFinite(rawEbitdaNum) ? null : rawEbitdaNum
  if (rawEbitda === null) {
    generalLogger.warn(
      '[buildValuationRequest] EBITDA is missing or non-numeric — using 0. Ensure the form validates EBITDA before submission.',
      { business_name: companyName, industry }
    )
  }
  const ebitda = rawEbitda ?? 0

  // Use provided items or read from store — avoids redundant getState() in recalculation paths
  const allItems = overrideItems ?? useNormalizationStore.getState().items
  const acceptedNorms = allItems.filter((n) => n.status === 'accepted')
  const legacyNormalizations = useEbitdaNormalizationStore.getState().normalizations

  // Separate historical actuals from explicit forecast projections.
  const normalizedHistoricalData = normalizeHistoricalYearsForFiling(
    formData.historical_years_data?.filter((y) => !y.is_forecast),
    Boolean(formData.filing_year_confirmed)
  )
  const actualHistoricalData = normalizedHistoricalData
  const rawForecastData =
    formData.forecast_years_data && formData.forecast_years_data.length > 0
      ? formData.forecast_years_data
      : (formData.historical_years_data?.filter((y) => y.is_forecast) ?? [])

  const historicalYears = actualHistoricalData
    .filter((y) => y.ebitda != null && y.year >= 2000 && y.year <= 2100)
    .map((y) => y.year)
  const allDataYears = Array.from(new Set([currentFiscalYear, ...historicalYears]))

  const yearEbitdaMap: Record<number, number> = {}
  yearEbitdaMap[currentFiscalYear] = ebitda
  actualHistoricalData.forEach((y) => {
    if (y.ebitda != null) yearEbitdaMap[y.year] = Number(y.ebitda)
  })

  const normByYear: Record<number, NormYearEntry> = {}
  for (const n of acceptedNorms) {
    const yearsToApply: number[] = n.applyAllYears
      ? allDataYears
      : n.applyYears && n.applyYears.length > 0
        ? n.applyYears
        : [n.year]
    for (const y of yearsToApply) {
      if (!normByYear[y])
        normByYear[y] = {
          totalAdjustment: 0,
          count: 0,
          confidence: 'medium',
          hasCustomAdjustments: false,
          items: [],
        }
      const rawYearEbitda = yearEbitdaMap[y] ?? 0
      const yearEbitda = Number.isFinite(rawYearEbitda) ? rawYearEbitda : 0
      const val = toFiniteNumber(n.value) ?? 0
      let amount = toFiniteNumber(n.adjustment) ?? 0
      if (n.type === 'add_percent') amount = (yearEbitda * val) / 100
      else if (n.type === 'subtract_percent') amount = -((yearEbitda * val) / 100)
      else if (n.type === 'absolute') amount = val - yearEbitda
      if (!Number.isFinite(amount)) amount = 0
      normByYear[y].totalAdjustment += amount
      normByYear[y].count++
      if (n.confidence === 'high') normByYear[y].confidence = 'high'
      if (n.source === 'manual') normByYear[y].hasCustomAdjustments = true
      normByYear[y].items.push({
        category: mapFrontendCategoryToBackend(n.category, n.backendCategory),
        amount,
        label: n.ledgerName || n.reason || undefined,
        note: n.reason || undefined,
        source: n.source ?? 'manual',
        confidence: n.confidence ?? 'medium',
        ...(n.ledgerCode && { ledger_code: n.ledgerCode }),
      })
    }
  }

  // Backward-compatibility: ValuationForm still persists normalization input via the
  // legacy store/modal. If no unified normalization exists for a year, use the legacy
  // year total so accountant-entered form adjustments reach the calculation request.
  for (const [yearKey, legacy] of Object.entries(legacyNormalizations)) {
    const year = Number(yearKey)
    if (!Number.isFinite(year) || normByYear[year]) continue

    const adjustmentCount =
      (legacy.adjustments?.length || 0) + (legacy.custom_adjustments?.length || 0)
    const totalAdjustment = Number(legacy.total_adjustments)

    if (adjustmentCount === 0 && !Number.isFinite(totalAdjustment)) continue

    normByYear[year] = {
      totalAdjustment: Number.isFinite(totalAdjustment) ? totalAdjustment : 0,
      count: adjustmentCount,
      confidence: legacy.confidence_score || 'medium',
      hasCustomAdjustments: (legacy.custom_adjustments?.length ?? 0) > 0,
      items: [
        ...(legacy.adjustments ?? []).map((a: any) => ({
          category: a.category ?? 'other_adjustments',
          amount: toFiniteNumber(a.amount) ?? 0,
          source: 'manual',
          confidence: a.confidence ?? 'medium',
          ...(a.ledger_code && { ledger_code: a.ledger_code }),
        })),
        ...(legacy.custom_adjustments ?? []).map((a: any) => ({
          category: 'other_adjustments',
          amount: toFiniteNumber(a.amount) ?? 0,
          source: 'manual',
          confidence: 'medium',
        })),
      ],
    }
  }

  // Check if the selected current year EBITDA is normalized
  const currentYearNormalization = normByYear[currentFiscalYear]

  // Build current_year_data with normalization support
  const currentYearData: any = {
    year: currentFiscalYear,
    revenue: revenue,
    ebitda: currentYearNormalization ? ebitda + currentYearNormalization.totalAdjustment : ebitda,
    ...(currentYearNormalization && {
      ebitda_normalized: true,
      ebitda_normalization_metadata: {
        reported_ebitda: ebitda,
        normalized_ebitda: ebitda + currentYearNormalization.totalAdjustment,
        total_adjustments: currentYearNormalization.totalAdjustment,
        adjustment_count: currentYearNormalization.count,
        confidence_score: currentYearNormalization.confidence,
        has_custom_adjustments: currentYearNormalization.hasCustomAdjustments,
        adjustments: currentYearNormalization.items,
      },
    }),
    ...pickOptionalYearDataFields(formData.current_year_data),
  }

  // Normalize historical data (filter and sort) with normalization support
  const historicalYearsData = deriveNwcChangesForActualYears(
    actualHistoricalData
      .filter(
        (year) =>
          year.ebitda !== undefined &&
          year.ebitda !== null &&
          year.year >= 2000 &&
          year.year <= 2100
      )
      .map((year) => {
        const clampedYear = Math.min(Math.max(year.year, 2000), 2100)

        const normalization = normByYear[year.year]

        if (normalization) {
          const reportedEbitda = Number(year.ebitda)
          const normalizedRevenue = requireNonNegativeRevenue(
            year.revenue,
            `historical_years_data.${year.year}.revenue`
          )
          return {
            year: clampedYear,
            revenue: normalizedRevenue,
            ebitda: reportedEbitda + normalization.totalAdjustment,
            ...pickOptionalYearDataFields(year),
            ebitda_normalized: true,
            ebitda_normalization_metadata: {
              reported_ebitda: reportedEbitda,
              normalized_ebitda: reportedEbitda + normalization.totalAdjustment,
              total_adjustments: normalization.totalAdjustment,
              adjustment_count: normalization.count,
              confidence_score: normalization.confidence,
              has_custom_adjustments: normalization.hasCustomAdjustments,
              adjustments: normalization.items,
            },
          }
        }

        const normalizedRevenue = requireNonNegativeRevenue(
          year.revenue,
          `historical_years_data.${year.year}.revenue`
        )

        return {
          year: clampedYear,
          revenue: normalizedRevenue,
          ebitda: Number(year.ebitda),
          ...pickOptionalYearDataFields(year),
          ebitda_normalized: false,
        }
      })
      .sort((a, b) => a.year - b.year) || []
  )

  const derivedActualYears = deriveNwcChangesForActualYears([
    ...historicalYearsData,
    currentYearData,
  ])
  const derivedCurrentYearData = derivedActualYears[derivedActualYears.length - 1]
  if (derivedCurrentYearData) {
    Object.assign(currentYearData, derivedCurrentYearData)
  }

  const dcfInputMode = (formData as ValuationFormData).dcf_input_mode ?? 'ebitda'
  const isFcffOnlyMode = dcfInputMode === 'fcff_only'

  const forecastYearsData =
    rawForecastData
      .filter((year) => year.year >= 2000 && year.year <= 2100)
      .map((year) => {
        const clampedYear = Math.min(Math.max(year.year, 2000), 2100)

        if (isFcffOnlyMode) {
          const fcf = toFiniteNumber((year as { free_cash_flow?: unknown }).free_cash_flow)
          if (fcf === null) {
            throw new ValidationError(
              'Forecast free cash flow must be a valid number for each year in FCFF-only mode.',
              `forecast_years_data.${year.year}.free_cash_flow`,
              (year as { free_cash_flow?: unknown }).free_cash_flow
            )
          }
          return {
            year: clampedYear,
            revenue: 0,
            ebitda: 0,
            free_cash_flow: fcf,
            is_forecast: true,
          }
        }

        const revenue = toFiniteNumber(year.revenue)
        if (revenue === null || revenue < 0) {
          throw new ValidationError(
            'Forecast revenue must be a valid number and cannot be negative.',
            `forecast_years_data.${year.year}.revenue`,
            year.revenue
          )
        }

        const normalizedEbitda = toFiniteNumber(year.ebitda) ?? 0

        return {
          year: clampedYear,
          revenue,
          ebitda: normalizedEbitda,
          ...pickOptionalYearDataFields(year),
          is_forecast: true,
        }
      })
      .sort((a, b) => a.year - b.year) || []

  const historicalYearSet = new Set<number>()
  for (const year of historicalYearsData) {
    if (historicalYearSet.has(year.year)) {
      throw new ValidationError(
        `Historical year ${year.year} is duplicated. Each historical year must appear only once.`,
        'historical_years_data',
        year.year
      )
    }

    if (year.year >= currentFiscalYear) {
      throw new ValidationError(
        `Historical year ${year.year} must be earlier than the current fiscal year ${currentFiscalYear}.`,
        'historical_years_data',
        year.year
      )
    }

    historicalYearSet.add(year.year)
  }

  const forecastYearSet = new Set<number>()
  for (const year of forecastYearsData) {
    if (forecastYearSet.has(year.year)) {
      throw new ValidationError(
        `Forecast year ${year.year} is duplicated. Each forecast year must appear only once.`,
        'forecast_years_data',
        year.year
      )
    }

    if (historicalYearSet.has(year.year)) {
      throw new ValidationError(
        `Forecast year ${year.year} cannot duplicate a historical year.`,
        'forecast_years_data',
        year.year
      )
    }

    if (year.year <= currentFiscalYear) {
      throw new ValidationError(
        `Forecast year ${year.year} must be later than the current fiscal year ${currentFiscalYear}.`,
        'forecast_years_data',
        year.year
      )
    }

    forecastYearSet.add(year.year)
  }

  const projectionYears = Math.max(5, forecastYearsData.length > 0 ? forecastYearsData.length : 5)

  // Normalize recurring revenue percentage (0.0-1.0)
  // Priority: explicit percentage > currency amount derived > legacy field
  // Use current year revenue as primary reference (matches the UI's
  // latestCompleteYearlyFinancial), falling back to latest historical year.
  // Prefer positive current-year revenue as denominator for % fields; if current year is
  // zero-revenue, fall back to the latest historical year's revenue (may still be 0).
  const latestRevenue =
    Number.isFinite(revenue) && revenue > 0
      ? revenue
      : historicalYearsData.length > 0
        ? historicalYearsData.reduce((latest, y) => (y.year > latest.year ? y : latest)).revenue
        : undefined
  // Priority: explicit percentage > currency amount (new UX) > legacy pct > default 0.
  // When rev_recurring_amount is set, it always wins over rev_recurring_pct to
  // stay consistent with adaptiveFields derivation and the UI badge.
  let recurringRevenueInput: number
  if (formData.recurring_revenue_percentage != null && Number.isFinite(formData.recurring_revenue_percentage)) {
    recurringRevenueInput = formData.recurring_revenue_percentage
  } else if (
    formData.rev_recurring_amount != null &&
    Number.isFinite(formData.rev_recurring_amount) &&
    latestRevenue != null &&
    latestRevenue > 0
  ) {
    recurringRevenueInput = formData.rev_recurring_amount / latestRevenue
  } else if ((formData as any).rev_recurring_pct != null && Number.isFinite((formData as any).rev_recurring_pct)) {
    recurringRevenueInput = (formData as any).rev_recurring_pct / 100
  } else {
    recurringRevenueInput = 0
  }
  const recurringRevenuePercentage = Math.min(Math.max(recurringRevenueInput || 0, 0.0), 1.0)

  // Handle sole trader vs company
  const numberOfEmployees =
    formData.business_type === 'sole-trader' ? undefined : formData.number_of_employees
  const numberOfOwners =
    formData.business_type === 'sole-trader' ? undefined : formData.number_of_owners || 1

  // Build business context from internal metadata + adaptive input fields
  const fd = formData as any
  const adaptiveFields: Record<string, unknown> = {}
  if (fd.dcf_revenue_growth_pct != null)
    adaptiveFields.dcf_revenue_growth_pct = fd.dcf_revenue_growth_pct
  if (fd.dcf_ebitda_margin_pct != null)
    adaptiveFields.dcf_ebitda_margin_pct = fd.dcf_ebitda_margin_pct
  if (fd.dcf_capex_pct != null) adaptiveFields.dcf_capex_pct = fd.dcf_capex_pct
  if (fd.dcf_da_pct != null) adaptiveFields.dcf_da_pct = fd.dcf_da_pct
  if (fd.dcf_nwc_pct != null) adaptiveFields.dcf_nwc_pct = fd.dcf_nwc_pct
  if (fd.dcf_tax_rate_pct != null) adaptiveFields.dcf_tax_rate_pct = fd.dcf_tax_rate_pct
  if (fd.dcf_wacc_pct != null) adaptiveFields.dcf_wacc_pct = fd.dcf_wacc_pct
  if (fd.dcf_terminal_growth_pct != null)
    adaptiveFields.dcf_terminal_growth_pct = fd.dcf_terminal_growth_pct
  if (fd.dcf_exit_multiple != null) adaptiveFields.dcf_exit_multiple = fd.dcf_exit_multiple
  if (fd.dcf_risk_free_rate_pct != null)
    adaptiveFields.dcf_risk_free_rate_pct = fd.dcf_risk_free_rate_pct
  if (fd.dcf_equity_risk_premium_pct != null) {
    adaptiveFields.dcf_equity_risk_premium_pct = fd.dcf_equity_risk_premium_pct
  }
  if (fd.dcf_beta != null) adaptiveFields.dcf_beta = fd.dcf_beta
  if (fd.dcf_cost_of_debt_pct != null) adaptiveFields.dcf_cost_of_debt_pct = fd.dcf_cost_of_debt_pct
  if (fd.dcf_debt_equity_pct != null) adaptiveFields.dcf_debt_equity_pct = fd.dcf_debt_equity_pct
  if (fd.dcf_tax_shield_pct != null) adaptiveFields.dcf_tax_shield_pct = fd.dcf_tax_shield_pct

  const userConfiguredDcf =
    fd.dcf_wacc_pct != null ||
    fd.dcf_terminal_growth_pct != null ||
    fd.dcf_exit_multiple != null ||
    fd.dcf_revenue_growth_pct != null ||
    fd.dcf_ebitda_margin_pct != null ||
    (Array.isArray(formData.forecast_years_data) && formData.forecast_years_data.length > 0) ||
    (Array.isArray(rawForecastData) && rawForecastData.length > 0)

  if (fd.nav_real_estate_adjustment != null && Number.isFinite(Number(fd.nav_real_estate_adjustment)))
    adaptiveFields.nav_real_estate_adjustment = Number(fd.nav_real_estate_adjustment)
  if (fd.nav_inventory_adjustment != null && Number.isFinite(Number(fd.nav_inventory_adjustment)))
    adaptiveFields.nav_inventory_adjustment = Number(fd.nav_inventory_adjustment)
  if (fd.nav_hidden_reserves != null && Number.isFinite(Number(fd.nav_hidden_reserves)))
    adaptiveFields.nav_hidden_reserves = Number(fd.nav_hidden_reserves)
  if (fd.nav_goodwill_writeoff != null && Number.isFinite(Number(fd.nav_goodwill_writeoff)))
    adaptiveFields.nav_goodwill_writeoff = Number(fd.nav_goodwill_writeoff)
  if (fd.nav_receivables_adjustment != null && Number.isFinite(Number(fd.nav_receivables_adjustment)))
    adaptiveFields.nav_receivables_adjustment = Number(fd.nav_receivables_adjustment)
  if (fd.nav_other_revaluations != null && Number.isFinite(Number(fd.nav_other_revaluations)))
    adaptiveFields.nav_other_revaluations = Number(fd.nav_other_revaluations)
  if (fd.nav_tax_latency_pct != null && Number.isFinite(Number(fd.nav_tax_latency_pct))) {
    adaptiveFields.nav_tax_latency_pct = Math.min(Math.max(Number(fd.nav_tax_latency_pct), 0), 100)
  } else if (countryCode === 'BE') {
    adaptiveFields.nav_tax_latency_pct = 25
  }
  if (fd.nav_off_balance_items != null && Number.isFinite(Number(fd.nav_off_balance_items)))
    adaptiveFields.nav_off_balance_items = Number(fd.nav_off_balance_items)
  if (fd.saas_arr != null) adaptiveFields.saas_arr = fd.saas_arr
  if (fd.saas_mrr != null) adaptiveFields.saas_mrr = fd.saas_mrr
  if (fd.saas_arr_growth_pct != null) adaptiveFields.saas_arr_growth_pct = fd.saas_arr_growth_pct
  if (fd.saas_churn_pct != null) adaptiveFields.saas_churn_pct = fd.saas_churn_pct
  if (fd.saas_customer_churn_pct != null)
    adaptiveFields.saas_customer_churn_pct = fd.saas_customer_churn_pct
  if (fd.saas_nrr_pct != null) adaptiveFields.saas_nrr_pct = fd.saas_nrr_pct
  if (fd.saas_gross_margin_pct != null)
    adaptiveFields.saas_gross_margin_pct = fd.saas_gross_margin_pct
  if (fd.saas_cac != null) adaptiveFields.saas_cac = fd.saas_cac
  if (fd.saas_customer_concentration_pct != null)
    adaptiveFields.saas_customer_concentration_pct = fd.saas_customer_concentration_pct
  if (fd.saas_expansion_revenue_pct != null)
    adaptiveFields.saas_expansion_revenue_pct = fd.saas_expansion_revenue_pct
  if (fd.saas_sm_spend != null) adaptiveFields.saas_sm_spend = fd.saas_sm_spend
  // Revenue quality: prefer currency amounts (new UX), derive % for the API.
  // Clamp to [0, 100] to satisfy the Titan Zod schema.
  // Guard with Number.isFinite to prevent NaN from corrupted session data.
  if (fd.rev_recurring_amount != null && Number.isFinite(fd.rev_recurring_amount) && latestRevenue && latestRevenue > 0) {
    adaptiveFields.rev_recurring_pct = Math.min(
      Math.max((fd.rev_recurring_amount / latestRevenue) * 100, 0),
      100
    )
  } else if (fd.rev_recurring_pct != null && Number.isFinite(fd.rev_recurring_pct)) {
    adaptiveFields.rev_recurring_pct = fd.rev_recurring_pct
  }
  if (fd.rev_top_client_amount != null && Number.isFinite(fd.rev_top_client_amount) && latestRevenue && latestRevenue > 0) {
    adaptiveFields.rev_top_client_concentration_pct = Math.min(
      Math.max((fd.rev_top_client_amount / latestRevenue) * 100, 0),
      100
    )
  } else if (fd.rev_top_client_concentration_pct != null && Number.isFinite(fd.rev_top_client_concentration_pct)) {
    adaptiveFields.rev_top_client_concentration_pct = fd.rev_top_client_concentration_pct
  }
  if (fd.rev_contract_backlog != null) adaptiveFields.rev_contract_backlog = fd.rev_contract_backlog
  if (fd.rev_gross_churn_pct != null) adaptiveFields.rev_gross_churn_pct = fd.rev_gross_churn_pct
  if (fd.rev_capitalized_rd_amount != null && Number.isFinite(fd.rev_capitalized_rd_amount)) {
    adaptiveFields.rev_capitalized_rd_amount = fd.rev_capitalized_rd_amount
  }

  const existingBusinessContext =
    formData.business_context && typeof formData.business_context === 'object'
      ? formData.business_context
      : undefined

  const businessContext = formData.business_type_id
    ? {
        ...existingBusinessContext,
        dcfPreference: fd._internal_dcf_preference,
        multiplesPreference: fd._internal_multiples_preference,
        ownerDependencyImpact: fd._internal_owner_dependency_impact,
        keyMetrics: fd._internal_key_metrics,
        typicalEmployeeRange: fd._internal_typical_employee_range,
        typicalRevenueRange: fd._internal_typical_revenue_range,
        ...adaptiveFields,
      }
    : Object.keys(adaptiveFields).length > 0
      ? {
          ...existingBusinessContext,
          ...adaptiveFields,
        }
      : existingBusinessContext
        ? existingBusinessContext
        : undefined

  // Build ValuationRequest
  const request: ValuationRequest = {
    company_name: companyName,
    country_code: countryCode,
    industry: industry,
    business_model: businessModel,
    founding_year: foundingYear,
    ...(formData.nace_code && { nace_code: formData.nace_code }),
    ...(formData.nace_description && { nace_description: formData.nace_description }),
    ...((formData as any).activity_code && { activity_code: (formData as any).activity_code }),
    ...((formData as any).canonical_nace_code && {
      canonical_nace_code: (formData as any).canonical_nace_code,
    }),
    current_year_data: currentYearData,
    historical_years_data: historicalYearsData,
    forecast_years_data: forecastYearsData,
    number_of_employees: numberOfEmployees,
    number_of_owners: numberOfOwners,
    recurring_revenue_percentage: recurringRevenuePercentage,
    use_dcf: true,
    use_multiples: true,
    ...(userConfiguredDcf && { user_configured_dcf: true }),
    projection_years: projectionYears,
    ...(dcfInputMode === 'fcff_only' && { dcf_input_mode: 'fcff_only' as const }),
    comparables: formData.comparables || [],
    business_type_id: formData.business_type_id,
    business_type: formData.business_type,
    shares_for_sale: 100,
    business_context: businessContext,
    ...(fd.exclude_real_estate != null && { exclude_real_estate: Boolean(fd.exclude_real_estate) }),
    ...(fd.real_estate_book_value != null && {
      real_estate_book_value: Number(fd.real_estate_book_value),
    }),
    ...(fd.estimated_market_rent != null && {
      estimated_market_rent: Number(fd.estimated_market_rent),
    }),
    ...(fd.owner_salary_addback != null &&
      Number.isFinite(Number(fd.owner_salary_addback)) && {
        owner_salary_addback: Number(fd.owner_salary_addback),
      }),
    ...(hasUsableOfficialFinancialsContent((formData as any).official_financials) &&
      (formData as any).official_financials && {
        official_financials: (formData as any).official_financials,
      }),
    ...(hasUsableOfficialFinancialsContent((formData as any).official_financials) &&
      (formData as any).official_variance_analysis && {
        official_variance_analysis: (formData as any).official_variance_analysis,
      }),
    ...(hasUsableOfficialFinancialsContent((formData as any).official_financials) &&
      (formData as any).official_verification_badge && {
        official_verification_badge: (formData as any).official_verification_badge,
      }),
    ...(locale && { locale }),
  }

  // Tax latencies (belastinglatenties) now flow as balance-sheet adjustments
  // to keep PDF/report output ledger-linked and avoid double-counting in Step 7.
  const existingBalanceSheetAdjustments = Array.isArray(formData.balance_sheet_adjustments)
    ? formData.balance_sheet_adjustments
    : []
  const taxLatencyItems = useTaxLatencyStore.getState().items
  const taxLatencyAdjustments: ValuationRequest['balance_sheet_adjustments'] =
    taxLatencyItems.length > 0
      ? taxLatencyItems.map((item) => ({
          id: item.id,
          label: item.description || item.accountName || 'Belastinglatentie',
          amount: Math.abs(calculateLatencyAmount(item)),
          type: item.type === 'active' ? ('add' as const) : ('subtract' as const),
          category: 'tax_latency' as const,
          description: item.description,
          ...(item.accountCode ? { account_code: item.accountCode } : {}),
          temporary_difference: Math.abs(item.temporaryDifference),
          tax_rate: item.taxRate,
          tax_latency_type: item.type,
        }))
      : []

  const mergedBalanceSheetAdjustments =
    taxLatencyItems.length > 0
      ? [
          ...existingBalanceSheetAdjustments.filter(
            (adjustment) => adjustment.category !== 'tax_latency'
          ),
          ...taxLatencyAdjustments,
        ]
      : existingBalanceSheetAdjustments

  if (mergedBalanceSheetAdjustments.length > 0) {
    request.balance_sheet_adjustments = mergedBalanceSheetAdjustments
  }

  // BANK-GRADE: Log request structure for diagnostics (only in development)
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
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

  return request
}
