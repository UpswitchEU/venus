import { ValidationError } from '../types/errors'
import type { YearDataInput } from '../types/valuation'
import type { NormYearEntry } from './buildValuationRequest.helpers'
import {
  hasPositiveHistoricalRevenue,
  pickOptionalYearDataFields,
  requireNonNegativeRevenue,
  toFiniteNumber,
} from './buildValuationRequest.helpers'
import { deriveNwcChangesForActualYears } from './yearData'

type DcfInputMode = 'ebitda' | 'fcff_only'

export interface ValuationRequestYearDataInput {
  currentFiscalYear: number
  revenue: number
  ebitda: number
  effectiveCurrentYearData?: YearDataInput
  actualHistoricalData: YearDataInput[]
  rawForecastData: YearDataInput[]
  normByYear: Record<number, NormYearEntry>
  dcfInputMode?: DcfInputMode
}

export interface ValuationRequestYearData {
  currentYearData: YearDataInput
  historicalYearsData: YearDataInput[]
  forecastYearsData: YearDataInput[]
  projectionYears: number
}

function applyNormalization(
  year: YearDataInput,
  normalizedRevenue: number,
  normalization?: NormYearEntry
): YearDataInput {
  if (!normalization) {
    return {
      year: Math.min(Math.max(year.year, 2000), 2100),
      revenue: normalizedRevenue,
      ebitda: toFiniteNumber(year.ebitda) ?? 0,
      ...pickOptionalYearDataFields(year),
      ebitda_normalized: false,
    }
  }

  const reportedEbitda = toFiniteNumber(year.ebitda) ?? 0
  return {
    year: Math.min(Math.max(year.year, 2000), 2100),
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

function buildHistoricalYearsData(args: {
  actualHistoricalData: YearDataInput[]
  normByYear: Record<number, NormYearEntry>
}): YearDataInput[] {
  return deriveNwcChangesForActualYears(
    args.actualHistoricalData
      .filter(
        (year) =>
          toFiniteNumber(year.ebitda) != null &&
          year.year >= 2000 &&
          year.year <= 2100 &&
          hasPositiveHistoricalRevenue(year)
      )
      .map((year) =>
        applyNormalization(
          year,
          requireNonNegativeRevenue(year.revenue, `historical_years_data.${year.year}.revenue`),
          args.normByYear[year.year]
        )
      )
      .sort((a, b) => a.year - b.year)
  )
}

function buildForecastYearsData(args: {
  rawForecastData: YearDataInput[]
  isFcffOnlyMode: boolean
}): YearDataInput[] {
  return args.rawForecastData
    .filter((year) => year.year >= 2000 && year.year <= 2100)
    .map((year) => {
      const clampedYear = Math.min(Math.max(year.year, 2000), 2100)

      if (args.isFcffOnlyMode) {
        const fcf = toFiniteNumber(year.free_cash_flow)
        if (fcf === null) {
          throw new ValidationError(
            'Forecast free cash flow must be a valid number for each year in FCFF-only mode.',
            `forecast_years_data.${year.year}.free_cash_flow`,
            year.free_cash_flow
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

      return {
        year: clampedYear,
        revenue,
        ebitda: toFiniteNumber(year.ebitda) ?? 0,
        ...pickOptionalYearDataFields(year),
        is_forecast: true,
      }
    })
    .sort((a, b) => a.year - b.year)
}

function validateYearPartitions(args: {
  currentFiscalYear: number
  historicalYearsData: YearDataInput[]
  forecastYearsData: YearDataInput[]
}): void {
  const historicalYearSet = new Set<number>()
  for (const year of args.historicalYearsData) {
    if (historicalYearSet.has(year.year)) {
      throw new ValidationError(
        `Historical year ${year.year} is duplicated. Each historical year must appear only once.`,
        'historical_years_data',
        year.year
      )
    }

    if (year.year >= args.currentFiscalYear) {
      throw new ValidationError(
        `Historical year ${year.year} must be earlier than the current fiscal year ${args.currentFiscalYear}.`,
        'historical_years_data',
        year.year
      )
    }

    historicalYearSet.add(year.year)
  }

  const forecastYearSet = new Set<number>()
  for (const year of args.forecastYearsData) {
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

    if (year.year <= args.currentFiscalYear) {
      throw new ValidationError(
        `Forecast year ${year.year} must be later than the current fiscal year ${args.currentFiscalYear}.`,
        'forecast_years_data',
        year.year
      )
    }

    forecastYearSet.add(year.year)
  }
}

export function buildValuationRequestYearData(
  args: ValuationRequestYearDataInput
): ValuationRequestYearData {
  const currentYearNormalization = args.normByYear[args.currentFiscalYear]
  const currentYearData: YearDataInput = {
    year: args.currentFiscalYear,
    revenue: args.revenue,
    ebitda: currentYearNormalization
      ? args.ebitda + currentYearNormalization.totalAdjustment
      : args.ebitda,
    ...(currentYearNormalization && {
      ebitda_normalized: true,
      ebitda_normalization_metadata: {
        reported_ebitda: args.ebitda,
        normalized_ebitda: args.ebitda + currentYearNormalization.totalAdjustment,
        total_adjustments: currentYearNormalization.totalAdjustment,
        adjustment_count: currentYearNormalization.count,
        confidence_score: currentYearNormalization.confidence,
        has_custom_adjustments: currentYearNormalization.hasCustomAdjustments,
        adjustments: currentYearNormalization.items,
      },
    }),
    ...pickOptionalYearDataFields(args.effectiveCurrentYearData),
  }

  const historicalYearsData = buildHistoricalYearsData({
    actualHistoricalData: args.actualHistoricalData,
    normByYear: args.normByYear,
  })
  const derivedActualYears = deriveNwcChangesForActualYears([
    ...historicalYearsData,
    currentYearData,
  ])
  const derivedCurrentYearData = derivedActualYears[derivedActualYears.length - 1]
  if (derivedCurrentYearData) {
    Object.assign(currentYearData, derivedCurrentYearData)
  }

  const isFcffOnlyMode = args.dcfInputMode === 'fcff_only'
  const forecastYearsData = buildForecastYearsData({
    rawForecastData: args.rawForecastData,
    isFcffOnlyMode,
  })

  validateYearPartitions({
    currentFiscalYear: args.currentFiscalYear,
    historicalYearsData,
    forecastYearsData,
  })

  return {
    currentYearData,
    historicalYearsData,
    forecastYearsData,
    projectionYears: Math.max(5, forecastYearsData.length > 0 ? forecastYearsData.length : 5),
  }
}
