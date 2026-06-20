import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationTypes'
import { useEbitdaNormalizationStore } from '../store/useEbitdaNormalizationStore'
import { useNormalizationStore } from '../store/useNormalizationStore'
import type { DataResponse } from '../types/data-collection'
import { ValidationError } from '../types/errors'
import type { ValuationFormData, ValuationRequest, YearDataInput } from '../types/valuation'
import {
  hasPositiveHistoricalRevenue,
  hasValidHistoricalEbitdaWeights,
  logValuationRequestDebug,
  normalizeAdvisorDiscountWeights,
  normalizeMultipleTypeWeights,
  pickOptionalYearDataFields,
  requireNonNegativeRevenue,
  resolveCurrentYearFromHistoricalBackstop,
  toBooleanOrNull,
  toFiniteNumber,
} from './buildValuationRequest.helpers'
import { normalizeBusinessTypeId } from './businessTypeIdAliases'
import { coerceIso2OrNull } from './coerceIso2Country'
import { convertDataResponsesToFormData } from './dataCollectionUtils'
import { normalizeCurrentYearForFiling, normalizeHistoricalYearsForFiling } from './fiscalYear'
import { generalLogger } from './logger'
import {
  businessTypeWeightsFromSegments,
  resolveBusinessTypeSegments,
} from './normalizeBusinessTypeSegments'
import { hasUsableOfficialFinancialsContent } from './officialFinancialsContent'
import { buildValuationBusinessContext } from './valuationRequestBusinessContext'
import { resolveValuationRequestIdentity } from './valuationRequestIdentity'
import { buildValuationRequestNormalizations } from './valuationRequestNormalizations'
import {
  applyCapitalHistoryInputs,
  applyFiscalInputs,
  applyLiquidationInputs,
  applyTaxLatencyBalanceSheetAdjustments,
} from './valuationRequestSpecialInputs'
import { deriveNwcChangesForActualYears, isYearRowForecast } from './yearData'

type FormDataRecord = ValuationFormData & Record<string, unknown>

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

  // Normalize financial data.
  // Revenue: treat 0 as a valid value (pre-revenue startup). Only fall back to
  // current_year_data when the form field is truly absent (null/undefined).
  const rawRevenue =
    promotedCurrentFromHistorical && effectiveCurrentYearData?.revenue != null
      ? effectiveCurrentYearData.revenue
      : formData.revenue != null
        ? formData.revenue
        : effectiveCurrentYearData?.revenue != null
          ? effectiveCurrentYearData.revenue
          : null
  const revenue = requireNonNegativeRevenue(rawRevenue, 'current_year_data.revenue')

  // EBITDA: accept 0 as a legitimate break-even value; only warn if truly absent.
  const rawEbitdaInput =
    promotedCurrentFromHistorical && effectiveCurrentYearData?.ebitda != null
      ? effectiveCurrentYearData.ebitda
      : formData.ebitda !== undefined && formData.ebitda !== null
        ? formData.ebitda
        : effectiveCurrentYearData?.ebitda !== undefined &&
            effectiveCurrentYearData?.ebitda !== null
          ? effectiveCurrentYearData.ebitda
          : null
  const rawEbitda = toFiniteNumber(rawEbitdaInput)
  if (rawEbitda === null) {
    generalLogger.warn(
      '[buildValuationRequest] EBITDA is missing or non-numeric — using 0. Ensure the form validates EBITDA before submission.',
      { business_name: companyName, industry }
    )
  }
  const ebitda = rawEbitda ?? 0

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
  const rawForecastData =
    formData.forecast_years_data && formData.forecast_years_data.length > 0
      ? formData.forecast_years_data
      : (formData.historical_years_data?.filter((y) => isYearRowForecast(y)) ?? [])

  const historicalYears = actualHistoricalData
    .filter((y) => toFiniteNumber(y.ebitda) != null && y.year >= 2000 && y.year <= 2100)
    .map((y) => y.year)
  const allDataYears = Array.from(new Set([currentFiscalYear, ...historicalYears]))

  const yearEbitdaMap: Record<number, number> = {}
  yearEbitdaMap[currentFiscalYear] = ebitda
  actualHistoricalData.forEach((y) => {
    const numericEbitda = toFiniteNumber(y.ebitda)
    if (numericEbitda != null) yearEbitdaMap[y.year] = numericEbitda
  })

  const normByYear = buildValuationRequestNormalizations({
    companyName,
    rawNormalizationItems,
    legacyNormalizations,
    allDataYears,
    yearEbitdaMap,
  })

  // Check if the selected current year EBITDA is normalized
  const currentYearNormalization = normByYear[currentFiscalYear]

  // Build current_year_data with normalization support
  const currentYearData: YearDataInput = {
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
          toFiniteNumber(year.ebitda) != null &&
          year.year >= 2000 &&
          year.year <= 2100 &&
          hasPositiveHistoricalRevenue(year)
      )
      .map((year) => {
        const clampedYear = Math.min(Math.max(year.year, 2000), 2100)

        const normalization = normByYear[year.year]

        if (normalization) {
          const reportedEbitda = toFiniteNumber(year.ebitda) ?? 0
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
          ebitda: toFiniteNumber(year.ebitda) ?? 0,
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
    formData.business_type === 'sole-trader' ? undefined : formData.number_of_employees
  const numberOfOwners =
    formData.business_type === 'sole-trader' ? undefined : formData.number_of_owners || 1

  // Build business context from internal metadata + adaptive input fields
  const fd = formData as FormDataRecord
  const { businessContext, userConfiguredDcf } = buildValuationBusinessContext({
    formData,
    latestRevenue,
    countryCode,
    rawForecastData,
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

  const historicalEbitdaWeights: Record<number, number> = {}
  if (fd.historical_ebitda_weights && typeof fd.historical_ebitda_weights === 'object') {
    for (const [year, weight] of Object.entries(fd.historical_ebitda_weights)) {
      const numericYear = Number(year)
      const numericWeight = toFiniteNumber(weight)
      if (Number.isFinite(numericYear) && numericWeight != null) {
        historicalEbitdaWeights[numericYear] = numericWeight
      }
    }
  }
  const hasValidCustomHistoricalEbitdaWeights =
    fd.historical_ebitda_weighting_mode === 'weighted' &&
    hasValidHistoricalEbitdaWeights(historicalEbitdaWeights)
  if (
    fd.historical_ebitda_weighting_mode === 'weighted' &&
    !hasValidCustomHistoricalEbitdaWeights
  ) {
    throw new ValidationError(
      'Historical EBITDA weights must contain 3 to 5 fiscal years and sum to 100%.',
      'historical_ebitda_weights',
      fd.historical_ebitda_weights
    )
  }
  const showEnterpriseToEquityBridge = toBooleanOrNull(fd.show_enterprise_to_equity_bridge)
  const ownerSalaryAddback = toFiniteNumber(fd.owner_salary_addback)
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
    ...(businessTypeId ? { business_type_id: businessTypeId } : {}),
    ...(businessTypeSegments.length > 0
      ? {
          business_type_segments: businessTypeSegments,
          business_type_mix: businessTypeSegments,
          business_type_weights: businessTypeWeights,
        }
      : {}),
    business_type: formData.business_type,
    shares_for_sale: 100,
    business_context: businessContext,
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
      historical_ebitda_weighting_mode: fd.historical_ebitda_weighting_mode,
    }),
    ...(hasValidCustomHistoricalEbitdaWeights && {
      historical_ebitda_weights: historicalEbitdaWeights,
    }),
    ...(showEnterpriseToEquityBridge != null && {
      show_enterprise_to_equity_bridge: showEnterpriseToEquityBridge,
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
