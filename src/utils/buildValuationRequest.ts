import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationTypes'
import { useEbitdaNormalizationStore } from '../store/useEbitdaNormalizationStore'
import { useNormalizationStore } from '../store/useNormalizationStore'
import type { DataResponse } from '../types/data-collection'
import { ValidationError } from '../types/errors'
import type { ValuationFormData, ValuationRequest } from '../types/valuation'
import {
  hasValidHistoricalEbitdaWeights,
  logValuationRequestDebug,
  normalizeAdvisorDiscountWeights,
  normalizeMultipleTypeWeights,
  requireNonNegativeRevenue,
  resolveCurrentYearFromHistoricalBackstop,
  toBooleanOrNull,
  toFiniteNumber,
} from './buildValuationRequest.helpers'
import { normalizeBusinessTypeId } from './businessTypeIdAliases'
import { coerceIso2OrNull } from './coerceIso2Country'
import { resolveCurrentYearFinancialBasis } from './currentYearFinancialBasis'
import { convertDataResponsesToFormData } from './dataCollectionUtils'
import { normalizeCurrentYearForFiling, normalizeHistoricalYearsForFiling } from './fiscalYear'
import { generalLogger } from './logger'
import {
  businessTypeWeightsFromSegments,
  resolveBusinessTypeSegments,
} from './normalizeBusinessTypeSegments'
import { hasUsableOfficialFinancialsContent } from './officialFinancialsContent'
import { hasAtMostTwoShareholdingDecimals } from './shareholding'
import { buildValuationBusinessContext } from './valuationRequestBusinessContext'
import { resolveValuationRequestIdentity } from './valuationRequestIdentity'
import {
  buildCanonicalNormalizationDecisions,
  buildValuationRequestNormalizations,
} from './valuationRequestNormalizations'
import {
  applyCapitalHistoryInputs,
  applyFiscalInputs,
  applyLiquidationInputs,
  applyTaxLatencyBalanceSheetAdjustments,
} from './valuationRequestSpecialInputs'
import { buildValuationRequestYearData } from './valuationRequestYearData'
import {
  buildForecastYearDataFromYearlyFinancials,
  isYearRowForecast,
  sanitizeForecastRowsForDcfInputMode,
  yearlyFinancialsContainForecastRows,
} from './yearData'

type FormDataRecord = ValuationFormData & Record<string, unknown>

const MAX_AUTO_ACCEPTED_EBITDA_MARGIN = 0.9

function assertPlausibleImportedEbitdaMargin({
  companyName,
  fiscalYear,
  revenue,
  ebitda,
}: {
  companyName: string
  fiscalYear: number
  revenue: number
  ebitda: number
}): void {
  if (revenue <= 0 || ebitda < 0) return
  const margin = ebitda / revenue
  if (margin < MAX_AUTO_ACCEPTED_EBITDA_MARGIN) return

  generalLogger.warn('[buildValuationRequest] Blocking implausible EBITDA margin', {
    business_name: companyName,
    fiscal_year: fiscalYear,
    revenue,
    ebitda,
    ebitda_margin: margin,
    threshold: MAX_AUTO_ACCEPTED_EBITDA_MARGIN,
    note: 'This usually means imported expense accounts were dropped or sign-mapped incorrectly. Re-import and review the source financials before generating a valuation report.',
  })
  throw new ValidationError(
    'EBITDA is almost equal to revenue. Review the imported expenses before generating the valuation report.',
    'current_year_data.ebitda',
    { fiscalYear, revenue, ebitda, margin }
  )
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
 * @param locale - Report language ('nl', 'en', or 'fr'). Passed through to ValuationIQ for i18n.
 * @returns ValuationRequest ready for calculateValuation()
 */
export function buildValuationRequest(
  source: ValuationFormData | DataResponse[],
  overrideItems?: NormalizationItem[],
  locale?: 'nl' | 'en' | 'fr'
): ValuationRequest {
  // Convert DataResponse[] to formData if needed
  let formData: ValuationFormData
  const requestInputSource = Array.isArray(source) ? 'ai_assistant' : undefined
  if (Array.isArray(source)) {
    formData = convertDataResponsesToFormData(source) as ValuationFormData
  } else {
    formData = source
  }

  // Respect an explicitly selected filing year when the accountant confirms a newer year.
  const normalizedCurrentFiscalYear = normalizeCurrentYearForFiling(
    formData.current_year_data?.year,
    formData.filing_year_confirmed
  )
  const normalizedHistoricalData = normalizeHistoricalYearsForFiling(
    formData.historical_years_data?.filter((y) => !isYearRowForecast(y)),
    formData.filing_year_confirmed
  )
  const { currentYearData: effectiveCurrentYearData, promoted: promotedCurrentFromHistorical } =
    resolveCurrentYearFromHistoricalBackstop({
      formData,
      normalizedCurrentYear: normalizedCurrentFiscalYear,
      normalizedHistoricalData,
    })
  const currentFiscalYear = normalizeCurrentYearForFiling(
    effectiveCurrentYearData?.year ?? normalizedCurrentFiscalYear,
    formData.filing_year_confirmed
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
    formData.country_code?.trim() || (formData as { country?: string }).country?.trim() || ''
  const countryCode = coerceIso2OrNull(countryRaw) ?? 'BE'
  const rawCurrency =
    typeof formData.currency === 'string' ? formData.currency.trim().toUpperCase() : ''
  if (rawCurrency && !/^[A-Z]{3}$/.test(rawCurrency)) {
    throw new ValidationError(
      'Currency must be a three-letter ISO-4217 code.',
      'currency',
      formData.currency
    )
  }
  const currency = rawCurrency || undefined

  // Normalize industry and business model
  // Priority: formData.industry > business_type metadata > default
  // Note: When business_type_id is selected, industry should be set in formData
  // by BasicInformationSection.tsx, but we ensure it's not empty here
  let industry = formData.industry
  let businessModel = formData.business_model
  const businessTypeId = normalizeBusinessTypeId(formData.business_type_id)
  const businessTypeSegments = resolveBusinessTypeSegments({
    business_type_segments: formData.business_type_segments,
    business_type_mix: formData.business_type_mix,
    business_type_weights: formData.business_type_weights,
  })
  const businessTypeWeights = businessTypeWeightsFromSegments(businessTypeSegments)

  // If industry is missing but business_type_id is present, log warning
  // (industry should have been set when business type was selected)
  if (!industry && businessTypeId) {
    generalLogger.warn(
      '[buildValuationRequest] Industry missing despite business_type_id being set',
      {
        business_type_id: businessTypeId,
      }
    )
  }

  // Apply defaults only if still missing
  industry = industry || 'services'
  businessModel = businessModel || 'services'

  const currentYearFinancials = resolveCurrentYearFinancialBasis({
    currentFiscalYear,
    currentYearData: effectiveCurrentYearData,
    preferCurrentYearData: promotedCurrentFromHistorical,
    topLevelRevenue: formData.revenue,
    topLevelEbitda: formData.ebitda,
  })
  if (
    currentYearFinancials.usedCurrentYearData &&
    currentYearFinancials.reason === 'stale_top_level_zero'
  ) {
    generalLogger.warn(
      '[buildValuationRequest] Using populated current_year_data over stale top-level zero financials',
      {
        business_name: companyName,
        fiscal_year: currentFiscalYear,
        revenue: currentYearFinancials.revenueInput,
        ebitda: currentYearFinancials.ebitdaInput,
        note: 'Top-level revenue/EBITDA were still zero while the accounting-imported current-year row was populated.',
      }
    )
  }

  // Normalize financial data.
  // Revenue: treat 0 as a valid value, but do not let stale top-level zero
  // mirrors clobber a populated accounting-imported current-year row.
  const revenue = requireNonNegativeRevenue(
    currentYearFinancials.revenueInput,
    'current_year_data.revenue'
  )

  // EBITDA: accept 0 as a legitimate break-even value; only warn if truly absent.
  const rawEbitdaInput = currentYearFinancials.ebitdaInput
  const rawEbitda = toFiniteNumber(rawEbitdaInput)
  if (rawEbitda === null) {
    generalLogger.warn(
      '[buildValuationRequest] EBITDA is missing or non-numeric — using 0. Ensure the form validates EBITDA before submission.',
      { business_name: companyName, industry }
    )
  }
  const ebitda = rawEbitda ?? 0
  assertPlausibleImportedEbitdaMargin({
    companyName,
    fiscalYear: currentFiscalYear,
    revenue,
    ebitda,
  })

  // Use provided items or read from store — avoids redundant getState() in recalculation paths.
  // Imported auto-suggestions get a second defensibility pass below once the reported
  // EBITDA-by-year map is known, so legacy sessions from before the review gate cannot
  // keep silently submitting extreme addbacks as accepted.
  const rawNormalizationItems = overrideItems ?? useNormalizationStore.getState().items
  const legacyNormalizations = useEbitdaNormalizationStore.getState().normalizations

  // Separate historical actuals from explicit forecast projections.
  const actualHistoricalData = promotedCurrentFromHistorical
    ? normalizedHistoricalData.filter((year) => Number(year.year) !== currentFiscalYear)
    : normalizedHistoricalData
  const dcfInputMode = (formData as ValuationFormData).dcf_input_mode ?? 'ebitda'
  const yearlyFinancialsForecastData = buildForecastYearDataFromYearlyFinancials(
    (formData as FormDataRecord).yearlyFinancials,
    { dcfInputMode }
  )
  const rawForecastData = yearlyFinancialsContainForecastRows(
    (formData as FormDataRecord).yearlyFinancials
  )
    ? yearlyFinancialsForecastData
    : formData.forecast_years_data && formData.forecast_years_data.length > 0
      ? sanitizeForecastRowsForDcfInputMode(formData.forecast_years_data, { dcfInputMode })
      : sanitizeForecastRowsForDcfInputMode(
          formData.historical_years_data?.filter((y) => isYearRowForecast(y)) ?? [],
          { dcfInputMode }
        )

  const historicalYears = actualHistoricalData
    .filter((y) => toFiniteNumber(y.ebitda) != null && y.year >= 2000 && y.year <= 2100)
    .map((y) => y.year)
  const allDataYears = Array.from(new Set([currentFiscalYear, ...historicalYears]))

  const yearEbitdaMap: Record<number, number> = {}
  yearEbitdaMap[currentFiscalYear] =
    toFiniteNumber(effectiveCurrentYearData?.reported_ebitda) ?? ebitda
  actualHistoricalData.forEach((y) => {
    const numericEbitda = toFiniteNumber(y.reported_ebitda) ?? toFiniteNumber(y.ebitda)
    if (numericEbitda != null) yearEbitdaMap[y.year] = numericEbitda
  })

  const normByYear = buildValuationRequestNormalizations({
    companyName,
    rawNormalizationItems,
    legacyNormalizations,
    allDataYears,
    yearEbitdaMap,
    ...((formData as ValuationFormData).owner_role
      ? { ownerRole: (formData as ValuationFormData).owner_role }
      : {}),
    ...(toFiniteNumber((formData as ValuationFormData).owner_salary_addback) != null
      ? {
          actualOwnerCompensation: toFiniteNumber(
            (formData as ValuationFormData).owner_salary_addback
          ) as number,
        }
      : {}),
  })
  const normalizationDecisions = buildCanonicalNormalizationDecisions({
    normByYear,
    yearEbitdaMap,
    ...(currency ? { currency } : {}),
  })

  const { currentYearData, historicalYearsData, forecastYearsData, projectionYears } =
    buildValuationRequestYearData({
      currentFiscalYear,
      revenue,
      ebitda,
      effectiveCurrentYearData,
      actualHistoricalData,
      rawForecastData,
      normByYear,
      dcfInputMode,
    })

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
  const recurringRevenuePctInput = toFiniteNumber(formData.recurring_revenue_percentage)
  const revRecurringAmountInput = toFiniteNumber(formData.rev_recurring_amount)
  const revRecurringPctInput = toFiniteNumber(formData.rev_recurring_pct)
  let recurringRevenueInput: number
  if (recurringRevenuePctInput != null) {
    const rawPct = recurringRevenuePctInput
    recurringRevenueInput = rawPct > 1 ? rawPct / 100 : rawPct
  } else if (revRecurringAmountInput != null && latestRevenue != null && latestRevenue > 0) {
    recurringRevenueInput = revRecurringAmountInput / latestRevenue
  } else if (revRecurringPctInput != null) {
    recurringRevenueInput = revRecurringPctInput / 100
  } else {
    recurringRevenueInput = 0
  }
  const recurringRevenuePercentage = Math.min(Math.max(recurringRevenueInput || 0, 0.0), 1.0)

  // Handle sole trader vs company
  const numberOfEmployees =
    formData.business_type === 'sole-trader'
      ? undefined
      : (formData.number_of_employees ?? formData.employee_count ?? formData.employees)
  const numberOfOwners =
    formData.business_type === 'sole-trader'
      ? undefined
      : (formData.number_of_owners ?? formData.owners ?? 1)

  // Build business context from internal metadata + adaptive input fields
  const fd = formData as FormDataRecord
  const { businessContext, userConfiguredDcf } = buildValuationBusinessContext({
    formData,
    latestRevenue,
    countryCode,
    rawForecastData,
    projectionYears,
    inputSource: requestInputSource,
  })

  const realEstateTreatment =
    fd.real_estate_treatment ??
    (fd.exclude_real_estate === true ? ('carve_out' as const) : ('none' as const))
  const realEstateMarketValue = toFiniteNumber(fd.real_estate_market_value)
  const realEstateBookValue = toFiniteNumber(fd.real_estate_book_value)
  const estimatedMarketRent = toFiniteNumber(fd.estimated_market_rent)
  if (realEstateTreatment === 'included') {
    if (realEstateMarketValue === null) {
      throw new ValidationError(
        'Market value of real estate is required when real estate is included in the transaction.',
        'real_estate_market_value',
        fd.real_estate_market_value
      )
    }
    if (realEstateBookValue === null) {
      throw new ValidationError(
        'Book value of real estate is required when real estate is included in the transaction.',
        'real_estate_book_value',
        fd.real_estate_book_value
      )
    }
  }

  const multipleCalibrationAdjustment = toFiniteNumber(fd.multiple_calibration_adjustment)
  const multipleCalibrationNote =
    typeof fd.multiple_calibration_note === 'string' ? fd.multiple_calibration_note.trim() : ''
  const effectiveMultipleOverride = toFiniteNumber(fd.effective_multiple_override)
  const effectiveMultipleOverrideNote =
    typeof fd.effective_multiple_override_note === 'string'
      ? fd.effective_multiple_override_note.trim()
      : ''
  const multipleTypeWeights = normalizeMultipleTypeWeights(fd.multiple_type_weights)
  const advisorDiscountWeights = normalizeAdvisorDiscountWeights(fd.advisor_discount_weights)
  const riskAnalysisEnabled = toBooleanOrNull(fd.risk_analysis_enabled)
  const discountFloorFactor = toFiniteNumber(fd.discount_floor_factor)
  if (
    multipleCalibrationAdjustment != null &&
    (multipleCalibrationAdjustment < -10 || multipleCalibrationAdjustment > 10)
  ) {
    throw new ValidationError(
      'Specific risk/quality premium must be between -10.0x and +10.0x.',
      'multiple_calibration_adjustment',
      fd.multiple_calibration_adjustment
    )
  }
  if (
    multipleCalibrationAdjustment != null &&
    multipleCalibrationAdjustment !== 0 &&
    !multipleCalibrationNote
  ) {
    throw new ValidationError(
      'Calibration note is required when applying a specific risk/quality premium.',
      'multiple_calibration_note',
      fd.multiple_calibration_note
    )
  }
  if (
    effectiveMultipleOverride != null &&
    (effectiveMultipleOverride <= 0 || effectiveMultipleOverride > 50)
  ) {
    throw new ValidationError(
      'Effective multiple override must be greater than 0.0x and no more than 50.0x.',
      'effective_multiple_override',
      fd.effective_multiple_override
    )
  }
  if (effectiveMultipleOverride != null && !effectiveMultipleOverrideNote) {
    throw new ValidationError(
      'Effective multiple override note is required when setting the final multiple.',
      'effective_multiple_override_note',
      fd.effective_multiple_override_note
    )
  }
  if (discountFloorFactor != null && (discountFloorFactor < 0 || discountFloorFactor > 1)) {
    throw new ValidationError(
      'Discount stack floor must be between 0% and 100%.',
      'discount_floor_factor',
      fd.discount_floor_factor
    )
  }

  // Prune the per-year weights to the years actually carried by THIS request, so
  // weights left over from a year the advisor later added/removed in the financials
  // never reach the engine (which would reject "year not in series" or silently
  // misweight). The weights apply to both revenue and EBITDA.
  const requestYearSet = new Set<number>(allDataYears)
  const historicalEbitdaWeights: Record<number, number> = {}
  if (fd.historical_ebitda_weights && typeof fd.historical_ebitda_weights === 'object') {
    for (const [year, weight] of Object.entries(fd.historical_ebitda_weights)) {
      const numericYear = Number(year)
      const numericWeight = toFiniteNumber(weight)
      if (
        Number.isFinite(numericYear) &&
        requestYearSet.has(numericYear) &&
        numericWeight != null
      ) {
        historicalEbitdaWeights[numericYear] = numericWeight
      }
    }
  }
  // Custom per-year weighting only ships when the advisor selected 'weighted' AND the
  // pruned weights are still valid (3-5 present years summing to ~100). Otherwise we
  // send 'standard' and let the engine apply its recency default — we never throw, so
  // an advisor whose saved default is 'weighted' (or who edited the years) still gets
  // a valuation instead of a hard error.
  const hasValidCustomHistoricalEbitdaWeights =
    fd.historical_ebitda_weighting_mode === 'weighted' &&
    hasValidHistoricalEbitdaWeights(historicalEbitdaWeights)
  const historicalEbitdaWeightingMode: 'standard' | 'weighted' =
    hasValidCustomHistoricalEbitdaWeights ? 'weighted' : 'standard'
  const showEnterpriseToEquityBridge = toBooleanOrNull(fd.show_enterprise_to_equity_bridge)
  const allowUntrustedMultiplesFallback =
    toBooleanOrNull(fd.allow_untrusted_multiples_fallback) === true
  const untrustedMultiplesFallbackReason =
    typeof fd.untrusted_multiples_fallback_reason === 'string'
      ? fd.untrusted_multiples_fallback_reason.trim()
      : ''
  if (allowUntrustedMultiplesFallback && !untrustedMultiplesFallbackReason) {
    throw new ValidationError(
      'A written advisor rationale is required for a disclosed market fallback.',
      'untrusted_multiples_fallback_reason',
      fd.untrusted_multiples_fallback_reason
    )
  }
  const ownerSalaryAddback = toFiniteNumber(fd.owner_salary_addback)
  const explicitSharesForSale = toFiniteNumber(fd.shares_for_sale)
  if (
    explicitSharesForSale != null &&
    (explicitSharesForSale < 0 ||
      explicitSharesForSale > 100 ||
      !hasAtMostTwoShareholdingDecimals(explicitSharesForSale))
  ) {
    throw new ValidationError(
      'Shares for sale must be between 0% and 100% with at most two decimals.',
      'shares_for_sale',
      fd.shares_for_sale
    )
  }
  const sharesForSale = explicitSharesForSale ?? 100
  const { registrationNumber, kboNumber, kvkNumber, vatNumber, legalForm, postalCode, city } =
    resolveValuationRequestIdentity({
      countryCode,
      formDataRecord: fd,
      businessContext,
    })

  // Build ValuationRequest
  const request: ValuationRequest = {
    company_name: companyName,
    country_code: countryCode,
    ...(currency ? { currency } : {}),
    industry: industry,
    business_model: businessModel,
    founding_year: foundingYear,
    ...(formData.nace_code && { nace_code: formData.nace_code }),
    ...(formData.nace_description && { nace_description: formData.nace_description }),
    ...(formData.activity_code && { activity_code: formData.activity_code }),
    ...(formData.canonical_nace_code && {
      canonical_nace_code: formData.canonical_nace_code,
    }),
    ...(registrationNumber && { registration_number: registrationNumber }),
    ...(kboNumber && { kbo_number: kboNumber }),
    ...(kvkNumber && { kvk_number: kvkNumber }),
    ...(vatNumber && { vat_number: vatNumber }),
    ...(legalForm && { legal_form: legalForm }),
    ...(postalCode && { postal_code: postalCode }),
    ...(city && { city }),
    ...(formData.business_description && {
      business_description: formData.business_description,
    }),
    ...(formData.business_highlights && {
      business_highlights: formData.business_highlights,
    }),
    ...(formData.reason_for_selling && {
      reason_for_selling: formData.reason_for_selling,
    }),
    current_year_data: currentYearData,
    historical_years_data: historicalYearsData,
    forecast_years_data: forecastYearsData,
    ...(normalizationDecisions.length > 0 && { normalizations: normalizationDecisions }),
    number_of_employees: numberOfEmployees,
    number_of_owners: numberOfOwners,
    recurring_revenue_percentage: recurringRevenuePercentage,
    use_dcf: formData.use_dcf ?? true,
    use_multiples: formData.use_multiples ?? true,
    ...(formData.selected_method && { selected_method: formData.selected_method }),
    ...(formData.user_weights && { user_weights: formData.user_weights }),
    ...(formData.user_weight_justification && {
      user_weight_justification: formData.user_weight_justification,
    }),
    ...(userConfiguredDcf && { user_configured_dcf: true }),
    projection_years: projectionYears,
    ...(dcfInputMode === 'fcff_only' && { dcf_input_mode: 'fcff_only' as const }),
    comparables: formData.comparables || [],
    ...(toFiniteNumber(formData.government_bond_yield) != null && {
      government_bond_yield: toFiniteNumber(formData.government_bond_yield) ?? undefined,
    }),
    ...(toFiniteNumber(formData.long_term_gdp_growth) != null && {
      long_term_gdp_growth: toFiniteNumber(formData.long_term_gdp_growth) ?? undefined,
    }),
    ...(businessTypeId ? { business_type_id: businessTypeId } : {}),
    ...(businessTypeSegments.length > 0
      ? {
          business_type_segments: businessTypeSegments,
          business_type_mix: businessTypeSegments,
          business_type_weights: businessTypeWeights,
        }
      : {}),
    business_type: formData.business_type,
    shares_for_sale: sharesForSale,
    business_context: businessContext,
    ...(formData.metadata && { metadata: { ...formData.metadata } }),
    ...(formData.valuation_case && { valuation_case: formData.valuation_case }),
    real_estate_treatment: realEstateTreatment,
    exclude_real_estate: realEstateTreatment === 'carve_out',
    ...(realEstateTreatment === 'included' &&
      realEstateMarketValue != null && {
        real_estate_market_value: realEstateMarketValue,
      }),
    ...((realEstateTreatment === 'carve_out' || realEstateTreatment === 'included') &&
      realEstateBookValue != null && {
        real_estate_book_value: realEstateBookValue,
      }),
    ...(realEstateTreatment === 'carve_out' &&
      estimatedMarketRent != null && {
        estimated_market_rent: estimatedMarketRent,
      }),
    ...(multipleCalibrationAdjustment != null && {
      multiple_calibration_adjustment: multipleCalibrationAdjustment,
    }),
    ...(multipleCalibrationAdjustment != null &&
      multipleCalibrationAdjustment !== 0 &&
      multipleCalibrationNote && {
        multiple_calibration_note: multipleCalibrationNote,
      }),
    ...(effectiveMultipleOverride != null && {
      effective_multiple_override: effectiveMultipleOverride,
      effective_multiple_override_note: effectiveMultipleOverrideNote,
    }),
    ...(multipleTypeWeights && {
      multiple_type_weights: multipleTypeWeights,
    }),
    ...(advisorDiscountWeights && {
      advisor_discount_weights: advisorDiscountWeights,
    }),
    ...(riskAnalysisEnabled != null && {
      risk_analysis_enabled: riskAnalysisEnabled,
    }),
    ...(discountFloorFactor != null && {
      discount_floor_factor: discountFloorFactor,
    }),
    ...(fd.historical_ebitda_weighting_mode && {
      historical_ebitda_weighting_mode: historicalEbitdaWeightingMode,
    }),
    ...(hasValidCustomHistoricalEbitdaWeights && {
      historical_ebitda_weights: historicalEbitdaWeights,
    }),
    ...(showEnterpriseToEquityBridge != null && {
      show_enterprise_to_equity_bridge: showEnterpriseToEquityBridge,
    }),
    ...(allowUntrustedMultiplesFallback && {
      allow_untrusted_multiples_fallback: true,
      untrusted_multiples_fallback_reason: untrustedMultiplesFallbackReason,
    }),
    ...(fd.headline_value_basis && {
      headline_value_basis: fd.headline_value_basis,
    }),
    ...(toFiniteNumber(fd.asking_price_buffer_pct) != null && {
      asking_price_buffer_pct: toFiniteNumber(fd.asking_price_buffer_pct) ?? undefined,
    }),
    ...(fd.business_type_multiple_overrides && {
      business_type_multiple_overrides: fd.business_type_multiple_overrides,
    }),
    ...(typeof fd.business_type_multiple_override_note === 'string' &&
      fd.business_type_multiple_override_note.trim() && {
        business_type_multiple_override_note: fd.business_type_multiple_override_note.trim(),
      }),
    ...(typeof fd.has_audit === 'boolean' && { has_audit: fd.has_audit }),
    ...(typeof fd.audited_financials === 'boolean' && {
      audited_financials: fd.audited_financials,
    }),
    ...(typeof fd.is_audited === 'boolean' && { is_audited: fd.is_audited }),
    ...(fd.owner_dependency_factors && {
      owner_dependency_factors: fd.owner_dependency_factors,
    }),
    ...(Array.isArray(fd.shareholder_roster) && {
      shareholder_roster: fd.shareholder_roster,
    }),
    ...(fd.ownership_summary && { ownership_summary: fd.ownership_summary }),
    ...(fd.holdings_consolidation && {
      holdings_consolidation: fd.holdings_consolidation,
    }),
    ...(ownerSalaryAddback != null && {
      owner_salary_addback: ownerSalaryAddback,
    }),
    // SDE working-owner vs passive-investor flag — drives full vs delta add-back
    ...((fd as { owner_role?: 'working' | 'passive' }).owner_role && {
      owner_role: (fd as { owner_role?: 'working' | 'passive' }).owner_role,
    }),
    ...(hasUsableOfficialFinancialsContent(formData.official_financials) &&
      formData.official_financials && {
        official_financials: formData.official_financials,
      }),
    ...(hasUsableOfficialFinancialsContent(formData.official_financials) &&
      formData.official_variance_analysis && {
        official_variance_analysis: formData.official_variance_analysis,
      }),
    ...(hasUsableOfficialFinancialsContent(formData.official_financials) &&
      formData.official_verification_badge && {
        official_verification_badge: formData.official_verification_badge,
      }),
    ...(locale && { locale }),
  }

  applyTaxLatencyBalanceSheetAdjustments(request, formData)
  applyCapitalHistoryInputs(request, fd)
  applyLiquidationInputs(request, fd)
  applyFiscalInputs(request, fd)

  logValuationRequestDebug(request)

  return request
}
