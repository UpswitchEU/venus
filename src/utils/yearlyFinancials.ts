import { getCurrentFilingYear } from './fiscalYear'

export interface YearlyFinancialLike {
  year?: string | number | null
  revenue?: number | null
  ebitda?: number | null
}

export function hasExplicitNumericValue(value: unknown): boolean {
  return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value))
}

function parseYear(value: string | number | null | undefined): number {
  const year = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(year) ? year : 0
}

export function getHistoricalYearRange(
  baseYear: number = getCurrentFilingYear(),
  count: number = 3,
  startOffset: number = 0
): number[] {
  const safeCount = Math.max(0, count)
  return Array.from({ length: safeCount }, (_, index) => baseYear - startOffset - index)
}

export function isCompleteYearlyFinancial<T extends YearlyFinancialLike>(year: T): boolean {
  return Boolean(year?.year) && (Number(year?.revenue) || 0) > 0 && hasExplicitNumericValue(year?.ebitda)
}

export function getCompleteYearlyFinancialsDesc<T extends YearlyFinancialLike>(years: T[]): T[] {
  return years
    .filter(isCompleteYearlyFinancial)
    .sort((a, b) => parseYear(b.year) - parseYear(a.year))
}

export function getLatestCompleteYearlyFinancial<T extends YearlyFinancialLike>(
  years: T[]
): T | undefined {
  return getCompleteYearlyFinancialsDesc(years)[0]
}
