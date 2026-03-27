/** @deprecated Use {@link getCurrentFilingYear} which accounts for book closure timing. */
export function getLastFullFiscalYear(): number {
  return Math.min(Math.max(new Date().getFullYear() - 1, 2000), 2100)
}

/**
 * Returns the latest fiscal year for which books are realistically
 * closed and published, based on Belgian/EU filing timelines.
 *
 * Jan–Jun: books for (currentYear − 1) are still being closed → return currentYear − 2
 * Jul–Dec: (currentYear − 1) books are published → return currentYear − 1
 */
export function getCurrentFilingYear(now: Date = new Date()): number {
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  return month <= 6 ? year - 2 : year - 1
}

/**
 * Normalizes a current-year value to the filing-safe year unless the user
 * explicitly confirmed a newer year selection.
 */
export function normalizeCurrentYearForFiling(
  explicitYear: unknown,
  filingYearConfirmed: boolean = false,
  now: Date = new Date()
): number {
  const filingYear = getCurrentFilingYear(now)
  const maxConfirmedYear = Math.min(Math.max(now.getFullYear() - 1, 2000), 2100)
  const parsedYear = Number(explicitYear)

  if (!Number.isFinite(parsedYear) || parsedYear < 2000) {
    return filingYear
  }

  return Math.min(parsedYear, filingYearConfirmed ? maxConfirmedYear : filingYear)
}
