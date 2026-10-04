import { parseFlexibleNumber } from '@/utils/isFiniteNumeric'
import {
  FINANCIAL_YEAR_AMOUNT_KEYS,
  financialYearHasObservations,
  restoredFiscalYear,
} from '@/utils/restoredFinancialYear'
import type { SubmittedFinancialSnapshot, SubmittedFinancialYear } from './manualFinancialSnapshot'

function normalizeFinancialYears(years: SubmittedFinancialYear[]) {
  return years
    .filter(financialYearHasObservations)
    .map((row) => ({
      year: restoredFiscalYear(row.year) ?? row.year,
      forecast: row.isForecast === true,
      amounts: FINANCIAL_YEAR_AMOUNT_KEYS.map((key) => parseFlexibleNumber(row[key]) ?? null),
    }))
    .sort((a, b) => Number(b.year) - Number(a.year))
}

/** Compare the full financial observations, including absence and explicit row removal. */
export function hasFinancialInputsChangedSinceSubmit(
  data: Record<string, unknown>,
  snapshot: SubmittedFinancialSnapshot
): boolean {
  if ('yearlyFinancials' in data) {
    if (!Array.isArray(data.yearlyFinancials)) return true
    const years = data.yearlyFinancials as SubmittedFinancialYear[]
    if (
      JSON.stringify(normalizeFinancialYears(years)) !==
      JSON.stringify(normalizeFinancialYears(snapshot.yearlyFinancials))
    )
      return true
    // Annual observations are authoritative. Top-level mirrors may still contain
    // an engine-normalized EBITDA or the newest forecast year's values.
    return false
  }
  return (['revenue', 'ebitda'] as const).some(
    (key) => key in data && parseFlexibleNumber(data[key]) !== parseFlexibleNumber(snapshot[key])
  )
}
