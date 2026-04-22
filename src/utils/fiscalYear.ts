/**
 * Interprets persisted "filing year confirmed" without `Boolean("false") === true`
 * when values come from JSON/DB as strings.
 */
export function isFilingYearConfirmedValue(value: unknown): boolean {
  if (value === true) {
    return true
  }
  if (value === 1) {
    return true
  }
  if (typeof value === 'string') {
    const t = value.trim().toLowerCase()
    if (t === 'true' || t === '1') {
      return true
    }
  }
  return false
}

/** @deprecated Use {@link getCurrentFilingYear} which accounts for book closure timing. */
export function getLastFullFiscalYear(): number {
  return Math.min(Math.max(new Date().getFullYear() - 1, 2000), 2100)
}

/**
 * Returns the latest fiscal year for which books are realistically
 * closed and published, based on Belgian/EU filing timelines.
 *
 * Jan–Mar: books for (currentYear − 1) are still being closed → return currentYear − 2
 * Apr–Dec: (currentYear − 1) books are published → return currentYear − 1
 */
export function getCurrentFilingYear(now: Date = new Date()): number {
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  return month < 4 ? year - 2 : year - 1
}

/**
 * Normalizes a current-year value to the filing-safe year unless the user
 * explicitly confirmed a newer year selection.
 */
export function normalizeCurrentYearForFiling(
  explicitYear: unknown,
  filingYearConfirmed: unknown = false,
  now: Date = new Date()
): number {
  const confirmed = isFilingYearConfirmedValue(filingYearConfirmed)
  const filingYear = getCurrentFilingYear(now)
  const maxConfirmedYear = Math.min(Math.max(now.getFullYear() - 1, 2000), 2100)
  const parsedYear = Number(explicitYear)

  if (!Number.isFinite(parsedYear) || parsedYear < 2000) {
    return filingYear
  }

  return Math.min(parsedYear, confirmed ? maxConfirmedYear : filingYear)
}

/**
 * For UI labels: how many years before the chosen filing base this row is (0 = base year).
 * Returns null if the year is after the base (e.g. mis-seeded data) or invalid.
 */
export function getFilingYearHistoricalOffset(
  year: string | number,
  baseFilingYear: number
): number | null {
  const y = Number(year)
  if (!Number.isFinite(y)) return null
  const offset = baseFilingYear - y
  return offset >= 0 ? offset : null
}

export function normalizeHistoricalYearsForFiling<
  T extends { year: number | string | null | undefined }
>(
  rows: T[] | null | undefined,
  filingYearConfirmed: unknown = false,
  now: Date = new Date()
): T[] {
  if (!Array.isArray(rows)) {
    return []
  }

  const maxHistoricalYear = isFilingYearConfirmedValue(filingYearConfirmed)
    ? Math.min(Math.max(now.getFullYear() - 1, 2000), 2100)
    : getCurrentFilingYear(now)

  return rows.filter((row) => {
    const year = Number(row?.year)
    return Number.isFinite(year) && year >= 2000 && year <= maxHistoricalYear
  })
}
