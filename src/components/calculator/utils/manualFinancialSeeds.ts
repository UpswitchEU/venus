'use client'

import type {
  ManualValuationFormData,
  YearDataInput,
  YearlyFinancials,
} from '../../../types/valuation'
import { getCurrentFilingYear, isFilingYearConfirmedValue } from '../../../utils/fiscalYear'
import { restoredFiscalYear } from '../../../utils/restoredFinancialYear'
import {
  buildYearlyFinancialsFromCurrentAndHistorical,
  getHistoricalYearRange,
  type YearlyFinancialLike,
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

/**
 * Most recent fiscal year that actually carries real (non-placeholder, non-zero)
 * revenue / EBITDA / FCFF across any persisted source (`yearlyFinancials`,
 * `current_year_data`, `historical_years_data`). Returns null when no real data
 * exists. This is the anchor for the "Basis" year and the displayed ladder, so a
 * file whose only real data is FY2023 anchors on 2023 — not on a phantom calendar
 * filing year with empty leading rows.
 */
export const getLatestNonPlaceholderFinancialYear = (
  initialData: Partial<ManualValuationFormData>
): number | null => {
  let latest: number | null = null
  const consider = (rawYear: unknown, row: YearlyFinancialLike & { isForecast?: boolean }) => {
    if (row.isForecast) return
    const yearNum = restoredFiscalYear(rawYear)
    if (yearNum === undefined) return
    if (!yearlyFinancialRowHasNonPlaceholderData({ ...row, isForecast: false, year: yearNum }))
      return
    if (latest === null || yearNum > latest) latest = yearNum
  }
  if (Array.isArray(initialData.yearlyFinancials)) {
    for (const row of initialData.yearlyFinancials) {
      if (row) consider(row.year, row)
    }
  }
  const cyd = initialData.current_year_data
  if (cyd && cyd.year != null) consider(cyd.year, cyd)
  if (Array.isArray(initialData.historical_years_data)) {
    for (const row of initialData.historical_years_data) {
      if (row) consider(row.year, row)
    }
  }
  return latest
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

  const maxSeedYear = isFilingYearConfirmedValue(initialData.filingYearConfirmed)
    ? maxSelectableYear
    : filingYear

  // Anchor on the most recent year that has real figures (regardless of which
  // source carries them), clamped to the filing-safe ceiling. This is what makes
  // the FY2023-only file show 2023 as "Basis" instead of an empty calendar year.
  const latestRealYear = getLatestNonPlaceholderFinancialYear(initialData)
  if (latestRealYear !== null) {
    return Math.min(latestRealYear, maxSeedYear)
  }

  const explicitYear = Number(initialData.current_year_data?.year)
  if (!Number.isFinite(explicitYear) || explicitYear < 2000) {
    return filingYear
  }

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
  const current = d.current_year_data
  // Legacy forms seeded both the current row and the empty grid with zeroes.
  // Repair only that identifiable seed shape; reviewed/imported/confirmed rows
  // and any current row with a real observation keep current-year priority.
  const currentIsMirroredSeed =
    current?.revenue === 0 &&
    current.ebitda === 0 &&
    !isFilingYearConfirmedValue(d.filingYearConfirmed) &&
    Object.keys(current).every((key) => ['year', 'revenue', 'ebitda'].includes(key)) &&
    d.yearlyFinancials?.some(
      (row) => row.year === String(current.year) && row.revenue === 0 && row.ebitda === 0
    )
  const restored = buildYearlyFinancialsFromCurrentAndHistorical(
    currentIsMirroredSeed ? undefined : current,
    d.historical_years_data
  ).filter((row) => Number(row.year) <= maxYear)
  const byYear = new Map(baseRows.map((row) => [row.year, row]))
  for (const row of restored) byYear.set(row.year, row)
  return [...byYear.values()].sort((a, b) => Number(b.year) - Number(a.year))
}

/**
 * Drops the newest rows that sit ABOVE the anchor (latest-real-data) year and
 * carry no real figures, so the displayed ladder leads with the real "Basis"
 * year rather than phantom empty future rows. Forecast rows and any row from the
 * base year down are preserved. No-op when every row is at/below the base.
 */
const stripLeadingPlaceholderRowsAboveBase = (
  rows: YearlyFinancials[],
  baseYear: number
): YearlyFinancials[] => {
  const kept = rows.filter((row) => {
    if (row.isForecast) return true
    const yearNum = Number(row.year)
    if (!Number.isFinite(yearNum) || yearNum <= baseYear) return true
    return yearlyFinancialRowHasNonPlaceholderData(row)
  })
  // Never strip down to nothing (defensive): keep original if filter emptied it.
  return kept.length > 0 ? kept : rows
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

  if (initialIsMeaningful) {
    const baseYear = getSeedBaseFilingYear(initialData, now)
    return stripLeadingPlaceholderRowsAboveBase(initialYearlyFinancials, baseYear)
  }

  if (sessionHasNonPlaceholderFinancials(initialData)) {
    const baseYear = getSeedBaseFilingYear(initialData, now)
    const baseRows = initialIsArray
      ? initialYearlyFinancials
      : generateDefaultYearlyFinancials(baseYear)
    return stripLeadingPlaceholderRowsAboveBase(
      bridgeNonPlaceholderFinancialsIntoYearlyArray(baseRows, initialData, baseYear),
      baseYear
    )
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
