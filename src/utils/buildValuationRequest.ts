import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationModal'
import { useEbitdaNormalizationStore } from '../store/useEbitdaNormalizationStore'
import { mapFrontendCategoryToBackend, useNormalizationStore } from '../store/useNormalizationStore'
import type { DataResponse } from '../types/data-collection'
import { ValidationError } from '../types/errors'
import type { ValuationFormData, ValuationRequest, YearDataInput } from '../types/valuation'
import {
  firstNonEmptyString,
  hasPositiveHistoricalRevenue,
  hasValidHistoricalEbitdaWeights,
  logValuationRequestDebug,
  mapLegacyCustomAdjustment,
  mapLegacyNormalizationAdjustment,
  type NormYearEntry,
  normalizeAdvisorDiscountWeights,
  normalizeMultipleTypeWeights,
  parsePostalCityFromAddress,
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
import { normalizeImportedLedgerReviewStatuses } from './importedLedgerNormalization'
import { generalLogger } from './logger'
import {
  businessTypeWeightsFromSegments,
  resolveBusinessTypeSegments,
} from './normalizeBusinessTypeSegments'
import { hasUsableOfficialFinancialsContent } from './officialFinancialsContent'
import { buildValuationBusinessContext } from './valuationRequestBusinessContext'
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

  const allItems = normalizeImportedLedgerReviewStatuses(rawNormalizationItems, yearEbitdaMap)
  const acceptedNorms = allItems.filter((n) => n.status === 'accepted')

  // Integrity guard: if the user can see normalizations in the UI but none reach the API
  // payload, the resulting valuation will silently use unnormalized EBITDA. That is the
  // failure mode that produced the Metaalbewerking incident (€272K of adjustments dropped,
  // ~€1M understatement). Surface it loudly so QA/telemetry can catch it.
  if (
    allItems.length > 0 &&
    acceptedNorms.length === 0 &&
    Object.keys(legacyNormalizations || {}).length === 0
  ) {
    const visibleAdjustment = allItems.reduce(
      (sum, n) => sum + (toFiniteNumber(n.adjustment) ?? 0),
      0
    )
    generalLogger.warn(
      '[buildValuationRequest] Normalization integrity guard: items visible to user but none applied to request',
      {
        business_name: companyName,
        visible_count: allItems.length,
        visible_total_adjustment: visibleAdjustment,
        statuses: Array.from(new Set(allItems.map((n) => n.status ?? 'undefined'))),
        note: 'Valuation will use unnormalized EBITDA. Confirm the user accepted these adjustments before submitting.',
      }
    )
  }

  const allDataYearsSet = new Set(allDataYears)
  const orphanItems: Array<{ id: string; targetYears: number[]; adjustment: number }> = []
  const normByYear: Record<number, NormYearEntry> = {}
  for (const n of acceptedNorms) {
    const yearsToApply: number[] = n.applyAllYears
      ? allDataYears
      : n.applyYears && n.applyYears.length > 0
        ? n.applyYears
        : [n.year]
    // Orphan-year guard: a normalization that targets a year outside the
    // canonical data set (current_year_data + historical_years_data) gets
    // dropped silently downstream — the year is allocated in normByYear but
    // neither current_year_data nor historical_years_data ever reads it.
    // This is the second flavor of the Metaalbewerking-class drop: instead
    // of the basis year being missing from the iteration, the addback
    // targets a year that isn't there at all (stale form data, typo, fiscal
    // year mismatch).
    const validYearsToApply = yearsToApply.filter((y) => allDataYearsSet.has(y))
    if (validYearsToApply.length === 0 && yearsToApply.length > 0) {
      orphanItems.push({
        id: n.id ?? `${n.year}:${n.category ?? 'unknown'}`,
        targetYears: yearsToApply,
        adjustment: toFiniteNumber(n.adjustment) ?? 0,
      })
      continue
    }
    for (const y of validYearsToApply) {
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

  if (orphanItems.length > 0) {
    const orphanTotal = orphanItems.reduce((s, o) => s + o.adjustment, 0)
    generalLogger.warn(
      '[buildValuationRequest] Dropped accepted normalizations with no matching year in the data set',
      {
        business_name: companyName,
        canonical_years: allDataYears,
        orphan_count: orphanItems.length,
        orphan_total_adjustment: orphanTotal,
        orphans: orphanItems,
        note:
          'These items targeted year(s) outside current_year_data + historical_years_data ' +
          'and would have been silently lost downstream. Either remove them, or extend the ' +
          'historical years to cover the targeted year before resubmitting.',
      }
    )
  }

  // Backward-compatibility: ValuationForm still persists normalization input via the
  // legacy store/modal. If no unified normalization exists for a year, use the legacy
  // year total so accountant-entered form adjustments reach the calculation request.
  // Orphan-year guard mirrors the unified-store path: a legacy entry keyed by a year
  // outside the canonical data set would be allocated into normByYear[year] but
  // never read by either the current_year_data builder or the historical_years_data
  // builder downstream. Drop + log so the silent-loss is observable.
  const legacyOrphanYears: Array<{ year: number; totalAdjustment: number }> = []
  for (const [yearKey, legacy] of Object.entries(legacyNormalizations)) {
    const year = Number(yearKey)
    if (!Number.isFinite(year) || normByYear[year]) continue

    const adjustmentCount =
      (legacy.adjustments?.length || 0) + (legacy.custom_adjustments?.length || 0)
    const totalAdjustment = Number(legacy.total_adjustments)

    if (adjustmentCount === 0 && !Number.isFinite(totalAdjustment)) continue

    if (!allDataYearsSet.has(year)) {
      legacyOrphanYears.push({
        year,
        totalAdjustment: Number.isFinite(totalAdjustment) ? totalAdjustment : 0,
      })
      continue
    }

    normByYear[year] = {
      totalAdjustment: Number.isFinite(totalAdjustment) ? totalAdjustment : 0,
      count: adjustmentCount,
      confidence: legacy.confidence_score || 'medium',
      hasCustomAdjustments: (legacy.custom_adjustments?.length ?? 0) > 0,
      items: [
        ...(legacy.adjustments ?? []).map(mapLegacyNormalizationAdjustment),
        ...(legacy.custom_adjustments ?? []).map(mapLegacyCustomAdjustment),
      ],
    }
  }

  if (legacyOrphanYears.length > 0) {
    const legacyOrphanTotal = legacyOrphanYears.reduce((s, o) => s + o.totalAdjustment, 0)
    generalLogger.warn(
      '[buildValuationRequest] Dropped legacy normalization entries with no matching year in the data set',
      {
        business_name: companyName,
        canonical_years: allDataYears,
        orphan_count: legacyOrphanYears.length,
        orphan_total_adjustment: legacyOrphanTotal,
        orphan_years: legacyOrphanYears,
        note:
          'These legacy form-store entries were keyed by year(s) outside ' +
          'current_year_data + historical_years_data and would have been ' +
          'silently lost downstream.',
      }
    )
  }

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
  const businessContextRecord =
    businessContext && typeof businessContext === 'object'
      ? (businessContext as Record<string, unknown>)
      : {}
  const contextExplicitRegistration = firstNonEmptyString(
    businessContextRecord.registration_number,
    businessContextRecord.registrationNumber,
    businessContextRecord.company_registration_number,
    businessContextRecord.companyRegistrationNumber,
    businessContextRecord.company_number,
    businessContextRecord.companyNumber,
    businessContextRecord.enterprise_number,
    businessContextRecord.enterpriseNumber
  )
  const contextCompanyId = firstNonEmptyString(
    businessContextRecord.company_id,
    businessContextRecord.companyId
  )
  const contextExplicitKboAlias = firstNonEmptyString(
    businessContextRecord.kbo_number,
    businessContextRecord.kboNumber,
    businessContextRecord.kbo_registration_number,
    businessContextRecord.kboRegistrationNumber,
    businessContextRecord.kbo_registration,
    businessContextRecord.kboRegistration
  )
  const contextExplicitKvkAlias = firstNonEmptyString(
    businessContextRecord.kvk_number,
    businessContextRecord.kvkNumber,
    businessContextRecord.kvk_registration_number,
    businessContextRecord.kvkRegistrationNumber,
    businessContextRecord.kvk_registration,
    businessContextRecord.kvkRegistration
  )
  const topLevelKboAlias = firstNonEmptyString(
    fd.kbo_number,
    fd.kboNumber,
    fd.kbo_registration_number,
    fd.kboRegistrationNumber,
    fd.kbo_registration,
    fd.kboRegistration
  )
  const topLevelKvkAlias = firstNonEmptyString(
    fd.kvk_number,
    fd.kvkNumber,
    fd.kvk_registration_number,
    fd.kvkRegistrationNumber,
    fd.kvk_registration,
    fd.kvkRegistration
  )
  const topLevelRegistrationAlias = firstNonEmptyString(
    fd.registration_number,
    fd.registrationNumber,
    fd.company_registration_number,
    fd.companyRegistrationNumber,
    fd.company_number,
    fd.companyNumber,
    fd.enterprise_number,
    fd.enterpriseNumber
  )
  const contextGenericRegistration = firstNonEmptyString(
    contextExplicitRegistration,
    contextCompanyId
  )
  const contextKboAlias = firstNonEmptyString(
    contextExplicitKboAlias,
    countryCode === 'BE' ? contextExplicitRegistration : null,
    countryCode === 'BE' ? contextCompanyId : null
  )
  const contextKvkAlias = firstNonEmptyString(
    contextExplicitKvkAlias,
    // BasicInformationSection stores the selected registry number under the
    // legacy KBO alias even for NL/KVK searches.
    countryCode === 'NL' ? contextExplicitKboAlias : null,
    countryCode === 'NL' ? contextExplicitRegistration : null,
    countryCode === 'NL' ? contextCompanyId : null
  )
  const kboNumber =
    countryCode === 'BE'
      ? firstNonEmptyString(contextKboAlias, topLevelKboAlias)
      : countryCode === 'NL'
        ? undefined
        : topLevelKboAlias
  const kvkNumber =
    countryCode === 'NL'
      ? firstNonEmptyString(contextKvkAlias, topLevelKvkAlias, topLevelKboAlias)
      : countryCode === 'BE'
        ? undefined
        : topLevelKvkAlias
  const contextIdentityApplied =
    countryCode === 'BE'
      ? !!contextKboAlias
      : countryCode === 'NL'
        ? !!contextKvkAlias
        : !!contextGenericRegistration
  const contextRegistrationNumber =
    countryCode === 'NL'
      ? firstNonEmptyString(
          contextKvkAlias,
          contextExplicitKboAlias,
          contextExplicitRegistration,
          contextCompanyId
        )
      : countryCode === 'BE'
        ? firstNonEmptyString(contextKboAlias, contextExplicitRegistration, contextCompanyId)
        : contextGenericRegistration
  const registrationNumber =
    firstNonEmptyString(
      contextRegistrationNumber,
      contextIdentityApplied ? null : topLevelRegistrationAlias,
      countryCode === 'NL' ? kvkNumber : kboNumber,
      kboNumber,
      kvkNumber,
      contextIdentityApplied ? null : contextCompanyId
    ) ?? (contextIdentityApplied ? null : contextGenericRegistration)
  const contextVatNumber = firstNonEmptyString(
    businessContextRecord.vat_number,
    businessContextRecord.vatNumber,
    businessContextRecord.vat,
    businessContextRecord.btw_number,
    businessContextRecord.btwNumber
  )
  const vatNumber = contextIdentityApplied
    ? firstNonEmptyString(contextVatNumber, fd.vat_number, fd.vatNumber)
    : firstNonEmptyString(fd.vat_number, fd.vatNumber, contextVatNumber)
  const contextLegalForm = firstNonEmptyString(
    businessContextRecord.legal_form,
    businessContextRecord.legalForm
  )
  const legalForm = contextIdentityApplied
    ? firstNonEmptyString(contextLegalForm, fd.legal_form, fd.legalForm)
    : firstNonEmptyString(fd.legal_form, fd.legalForm, contextLegalForm)
  const parsedAddressLocation = parsePostalCityFromAddress(
    firstNonEmptyString(
      businessContextRecord.company_address,
      businessContextRecord.companyAddress,
      businessContextRecord.registered_address,
      businessContextRecord.registeredAddress,
      businessContextRecord.address,
      businessContextRecord.company_location,
      businessContextRecord.companyLocation,
      businessContextRecord.location
    )
  )
  const contextPostalCode = firstNonEmptyString(
    businessContextRecord.postal_code,
    businessContextRecord.postalCode,
    businessContextRecord.company_postal_code,
    businessContextRecord.companyPostalCode,
    parsedAddressLocation.postalCode
  )
  const postalCode = contextIdentityApplied
    ? firstNonEmptyString(contextPostalCode, fd.postal_code, fd.postalCode)
    : firstNonEmptyString(fd.postal_code, fd.postalCode, contextPostalCode)
  const contextCity = firstNonEmptyString(
    businessContextRecord.city,
    businessContextRecord.company_city,
    businessContextRecord.companyCity,
    businessContextRecord.municipality,
    parsedAddressLocation.city
  )
  const city = contextIdentityApplied
    ? firstNonEmptyString(contextCity, fd.city, fd.companyCity)
    : firstNonEmptyString(fd.city, fd.companyCity, contextCity)

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
