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
