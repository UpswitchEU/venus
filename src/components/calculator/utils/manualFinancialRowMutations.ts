import type { ManualValuationFormData } from '../../../types/valuation'
import {
  canRemoveHistoricalYear,
  removeForecastYears,
  removeHistoricalYear,
} from '../../../utils/forecastYears'
import { buildCurrentYearData } from '../../../utils/yearData'
import { hasExplicitNumericValue as hasExplicitFinancialValue } from '../../../utils/yearlyFinancials'
import { generateDefaultYearlyFinancials } from './manualFinancialSeeds'
import type { ManualYearlyFinancialField } from './manualYearlyFinancialUpdates'

export function updateManualYearlyFinancialsRows({
  field,
  isForecast,
  value,
  year,
  yearlyFinancials,
}: {
  field: ManualYearlyFinancialField
  isForecast: boolean
  value: number | undefined
  year: string
  yearlyFinancials: ManualValuationFormData['yearlyFinancials']
}) {
  const yearKey = String(year)
  return yearlyFinancials.map((row) =>
    String(row.year) === yearKey && !!row.isForecast === isForecast
      ? field === 'free_cash_flow'
        ? { ...row, free_cash_flow: value }
        : { ...row, [field]: value ?? 0 }
      : row
  )
}

export function applyManualFilingYearSelection(
  formData: ManualValuationFormData,
  selectedYear: number
): ManualValuationFormData {
  return {
    ...formData,
    yearlyFinancials: generateDefaultYearlyFinancials(selectedYear),
    filingYearConfirmed: true,
    current_year_data: buildCurrentYearData({
      year: selectedYear,
      revenue: formData.current_year_data?.revenue ?? 0,
      ebitda: formData.current_year_data?.ebitda ?? 0,
      currentYearData: formData.current_year_data,
    }),
  }
}

export function applyManualFinancialYearSelection(
  formData: ManualValuationFormData,
  selectedYears: readonly number[]
): {
  didApply: boolean
  next: ManualValuationFormData
} {
  const selectedYearKeys = new Set(
    selectedYears
      .filter((year) => Number.isInteger(year) && year >= 1900 && year <= 2100)
      .map(String)
  )
  if (selectedYearKeys.size === 0) return { didApply: false, next: formData }

  const historicalRows = formData.yearlyFinancials.filter((row) => !row.isForecast)
  const keptHistoricalRows = historicalRows.filter((row) => selectedYearKeys.has(String(row.year)))
  if (keptHistoricalRows.length === 0 || keptHistoricalRows.length === historicalRows.length) {
    return { didApply: false, next: formData }
  }

  return {
    didApply: true,
    next: {
      ...formData,
      yearlyFinancials: formData.yearlyFinancials.filter(
        (row) => row.isForecast || selectedYearKeys.has(String(row.year))
      ),
    },
  }
}

export function removeManualHistoricalYear(
  formData: ManualValuationFormData,
  year: string
): {
  didRemove: boolean
  next: ManualValuationFormData
  removedFiscalYear?: number
} {
  if (!canRemoveHistoricalYear(formData.yearlyFinancials)) {
    return { didRemove: false, next: formData }
  }
  const removedFiscalYear = Number.parseInt(year, 10)
  return {
    didRemove: true,
    next: {
      ...formData,
      yearlyFinancials: removeHistoricalYear(formData.yearlyFinancials, year),
    },
    removedFiscalYear: Number.isFinite(removedFiscalYear) ? removedFiscalYear : undefined,
  }
}

export function removeManualForecastYears(
  formData: ManualValuationFormData
): ManualValuationFormData {
  return {
    ...formData,
    yearlyFinancials: removeForecastYears(formData.yearlyFinancials),
  }
}

export function getManualPartialHistoricalYears(
  yearlyFinancials: ManualValuationFormData['yearlyFinancials']
) {
  return yearlyFinancials
    .filter(
      (row) =>
        !row.isForecast &&
        hasExplicitFinancialValue(row.revenue) !== hasExplicitFinancialValue(row.ebitda)
    )
    .map((row) => row.year)
}
