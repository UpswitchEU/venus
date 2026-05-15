'use client'

import type {
  ManualValuationFormData,
  YearDataInput,
  YearlyFinancials,
} from '../../../types/valuation'
import { getCurrentFilingYear, isFilingYearConfirmedValue } from '../../../utils/fiscalYear'
import {
  getHistoricalYearRange,
  yearlyFinancialRowHasNonPlaceholderData,
  yearlyFinancialsContainsNonPlaceholderData,
} from '../../../utils/yearlyFinancials'

export const generateDefaultYearlyFinancials = (
  baseFilingYear: number = getCurrentFilingYear()
): YearlyFinancials[] =>
  getHistoricalYearRange(baseFilingYear, 3).map((year) => ({
    year: String(year),
    revenue: 0,
    ebitda: 0,
  }))

export const hasMeaningfulYearlyFinancials = (yearlyFinancials?: YearlyFinancials[]): boolean =>
  yearlyFinancialsContainsNonPlaceholderData(yearlyFinancials)

/** True when stored session fields contain any non-placeholder revenue/EBITDA (or FCFF). */
const sessionHasNonPlaceholderFinancials = (d: Partial<ManualValuationFormData>): boolean => {
  if (hasMeaningfulYearlyFinancials(d.yearlyFinancials)) {
    return true
  }
  const cyd = d.current_year_data
  if (cyd && cyd.year != null) {
    if (
      yearlyFinancialRowHasNonPlaceholderData({
        year: cyd.year,
        revenue: cyd.revenue,
        ebitda: cyd.ebitda,
        free_cash_flow: cyd.free_cash_flow,
      })
    ) {
      return true
    }
  }
  const h = d.historical_years_data
  if (Array.isArray(h)) {
    for (const row of h) {
      if (
        row &&
        yearlyFinancialRowHasNonPlaceholderData({
          year: row.year,
          revenue: row.revenue,
          ebitda: row.ebitda,
          free_cash_flow: row.free_cash_flow,
        })
      ) {
        return true
      }
    }
  }
  return false
}

export const getSeedBaseFilingYear = (
  initialData: Partial<ManualValuationFormData>,
  now: Date = new Date()
): number => {
  const filingYear = getCurrentFilingYear(now)
  const maxSelectableYear = Math.min(Math.max(now.getFullYear() - 1, 2000), 2100)
  if (
    !sessionHasNonPlaceholderFinancials(initialData) &&
    !isFilingYearConfirmedValue(initialData.filingYearConfirmed)
  ) {
    return filingYear
  }
  const explicitYear = Number(initialData.current_year_data?.year)
  if (!Number.isFinite(explicitYear) || explicitYear < 2000) {
    return filingYear
  }

  const maxSeedYear = isFilingYearConfirmedValue(initialData.filingYearConfirmed)
    ? maxSelectableYear
    : filingYear
  return Math.min(explicitYear, maxSeedYear)
}

export const isSessionSeedYearStale = (
  initialData: Partial<ManualValuationFormData>,
  now: Date = new Date()
): boolean => {
  if (sessionHasNonPlaceholderFinancials(initialData)) return false
  const explicitYear = Number(initialData.current_year_data?.year)
  if (!Number.isFinite(explicitYear) || explicitYear < 2000) return false
  return explicitYear < getCurrentFilingYear(now)
}

const bridgeNonPlaceholderFinancialsIntoYearlyArray = (
  baseRows: YearlyFinancials[],
  d: Partial<ManualValuationFormData>,
  maxYear: number
): YearlyFinancials[] => {
  const out = [...baseRows]
  const passthroughKeys = [
    'capex',
    'depreciation',
    'tax_expense',
    'cash',
    'total_debt',
    'current_assets',
    'current_liabilities',
    'accounts_receivable',
    'accounts_payable',
    'inventory',
    'short_term_debt',
    'nwc_change',
    'free_cash_flow',
  ] as const
  const upsert = (rawYear: unknown, src: Record<string, unknown>) => {
    if (rawYear == null) return
    const yearNum = Number(rawYear)
    if (!Number.isFinite(yearNum) || yearNum < 2000 || yearNum > 2100 || yearNum > maxYear) return
    const yearStr = String(yearNum)
    const existing = out.find((r) => r.year === yearStr)
    const baseRow: Record<string, unknown> = existing
      ? { ...(existing as unknown as Record<string, unknown>) }
      : { year: yearStr, revenue: 0, ebitda: 0 }
    baseRow.year = yearStr
    baseRow.revenue = Number.isFinite(Number(src.revenue))
      ? Number(src.revenue)
      : (existing?.revenue ?? 0)
    baseRow.ebitda = Number.isFinite(Number(src.ebitda))
      ? Number(src.ebitda)
      : (existing?.ebitda ?? 0)
    for (const key of passthroughKeys) {
      const v = src[key]
      if (v != null && Number.isFinite(Number(v))) {
        baseRow[key] = Number(v)
      }
    }
    const nextRow = baseRow as unknown as YearlyFinancials
    if (existing) {
      out[out.indexOf(existing)] = nextRow
    } else {
      out.push(nextRow)
    }
  }
  if (d.current_year_data) {
    upsert(d.current_year_data.year, d.current_year_data as unknown as Record<string, unknown>)
  }
  if (Array.isArray(d.historical_years_data)) {
    for (const row of d.historical_years_data) {
      if (row) upsert(row.year, row as unknown as Record<string, unknown>)
    }
  }
  return out.sort((a, b) => Number(b.year) - Number(a.year))
}

export const getSeedYearlyFinancials = (
  initialData: Partial<ManualValuationFormData>,
  now: Date = new Date()
): YearlyFinancials[] => {
  if (isSessionSeedYearStale(initialData, now)) {
    return generateDefaultYearlyFinancials(getCurrentFilingYear(now))
  }

  const initialYearlyFinancials = initialData.yearlyFinancials
  const initialIsArray =
    Array.isArray(initialYearlyFinancials) && initialYearlyFinancials.length > 0
  const initialIsMeaningful =
    initialIsArray && hasMeaningfulYearlyFinancials(initialYearlyFinancials)

  if (initialIsMeaningful) return initialYearlyFinancials

  if (sessionHasNonPlaceholderFinancials(initialData)) {
    const baseYear = getSeedBaseFilingYear(initialData, now)
    const baseRows = initialIsArray
      ? initialYearlyFinancials
      : generateDefaultYearlyFinancials(baseYear)
    return bridgeNonPlaceholderFinancialsIntoYearlyArray(baseRows, initialData, baseYear)
  }

  return generateDefaultYearlyFinancials(getSeedBaseFilingYear(initialData, now))
}

export const getSeedCurrentYearData = (
  initialData: Partial<ManualValuationFormData>,
  now: Date = new Date()
): YearDataInput | undefined => {
  if (!initialData.current_year_data) {
    return undefined
  }

  if (isSessionSeedYearStale(initialData, now)) {
    return {
      ...initialData.current_year_data,
      year: getCurrentFilingYear(now),
    }
  }

  return {
    ...initialData.current_year_data,
    year: getSeedBaseFilingYear(initialData, now),
  }
}

export const shouldAutoConfirmPrefilledFilingYear = (
  initialData: Partial<ManualValuationFormData>,
  currentFilingYear: number
): boolean => {
  if (isSessionSeedYearStale(initialData)) return false

  const explicitInitialYear = Number(initialData.current_year_data?.year)

  return (
    hasMeaningfulYearlyFinancials(initialData.yearlyFinancials) ||
    isFilingYearConfirmedValue(initialData.filingYearConfirmed) ||
    (Number.isFinite(explicitInitialYear) &&
      explicitInitialYear >= 2000 &&
      explicitInitialYear <= currentFilingYear)
  )
}
