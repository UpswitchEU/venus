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
        ? isForecast
          ? {
              ...row,
              revenue: 0,
              ebitda: 0,
              capex: undefined,
              depreciation: undefined,
              nwc_change: undefined,
              free_cash_flow: value,
            }
          : { ...row, free_cash_flow: value }
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

export interface ManualCurrentYearBalance {
  cash?: number
  total_debt?: number
  current_liabilities?: number
}

/**
 * Write balance-sheet figures (cash / total debt / current liabilities) onto the
 * most recent actual year — both `current_year_data` (the engine's net-debt
 * source for the EV→Equity bridge) and the matching non-forecast
 * `yearlyFinancials` row, so the form table and the live preview agree.
 *
 * Powers the assistant's inline net-debt fix. Only finite values are written;
 * blanks are skipped (the caller treats a blank as 0 at submit time).
 */
export function applyManualCurrentYearBalance(
  formData: ManualValuationFormData,
  balance: ManualCurrentYearBalance
): ManualValuationFormData {
  const patch: ManualCurrentYearBalance = {}
  if (Number.isFinite(balance.cash)) patch.cash = balance.cash
  if (Number.isFinite(balance.total_debt)) patch.total_debt = balance.total_debt
  if (Number.isFinite(balance.current_liabilities)) {
    patch.current_liabilities = balance.current_liabilities
  }
  if (Object.keys(patch).length === 0) return formData

  const rows = formData.yearlyFinancials ?? []
  const latestActualYear =
    formData.current_year_data?.year ??
    rows.reduce<number | undefined>((max, row) => {
      const year = Number(row.year)
      if (!Number.isFinite(year) || row.isForecast) return max
      return max === undefined || year > max ? year : max
    }, undefined)

  return {
    ...formData,
    current_year_data: formData.current_year_data
      ? { ...formData.current_year_data, ...patch }
      : formData.current_year_data,
    yearlyFinancials: rows.map((row) =>
      !row.isForecast && Number(row.year) === latestActualYear ? { ...row, ...patch } : row
    ),
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
