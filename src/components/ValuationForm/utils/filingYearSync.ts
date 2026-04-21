/**
 * Pure helpers powering the bidirectional sync between the filing-year row of
 * `HistoricalDataInputs` and the canonical `formData.revenue` / `formData.ebitda`
 * fields rendered by the "Last Full Year Financials" section.
 *
 * These two sections show the same year (the current filing year) and must stay
 * in lockstep, but each owns a different storage shape:
 *   • Historical row → `historicalInputs[`${year}_revenue`]` (string buffer that
 *     can hold partial typing like "-" or "1.").
 *   • Last Full Year → `formData.revenue` / `formData.ebitda` (number | undefined).
 *
 * The helpers live here so they can be unit-tested in isolation from React.
 *
 * Robustness contract:
 *   1. Never propagate NaN from a partial typing buffer into formData.
 *   2. Never overwrite a partial typing buffer in the historical row from the
 *      formData side.
 *   3. Honour explicit clears: empty string in historical → undefined in formData,
 *      and undefined in formData → empty string in historical (only when the
 *      historical buffer holds a parseable number).
 *   4. No-op when values already agree, to keep the surrounding effects loop-free.
 */

/** Aligns with backend / `buildValuationRequest` year guards. */
const YEAR_ROW_MIN = 2000
const YEAR_ROW_MAX = 2100

function isValidYearRowYear(year: unknown): year is number {
  return typeof year === 'number' && Number.isFinite(year) && year >= YEAR_ROW_MIN && year <= YEAR_ROW_MAX
}

export interface MirrorToFormDataResult {
  changed: boolean
  next: number | undefined
}

/**
 * Decide what to write into `formData.revenue` (or ebitda) given the raw string
 * value from `historicalInputs[`${filingYear}_revenue`]` and the current value
 * already on formData.
 *
 *   raw = undefined        → no-op (key absent: nothing to mirror)
 *   raw = ""               → propagate explicit clear iff currentValue is set
 *   raw parses to finite   → mirror parsed number (when different)
 *   raw parses to NaN      → no-op (partial typing like "-" or "1.")
 */
export function mirrorHistoricalToFormData(
  raw: string | undefined,
  currentValue: number | undefined | null
): MirrorToFormDataResult {
  if (raw === undefined) {
    return { changed: false, next: currentValue ?? undefined }
  }
  if (raw === '') {
    const cleared = currentValue !== undefined && currentValue !== null
    return { changed: cleared, next: undefined }
  }
  const parsed = parseFloat(raw.replace(/,/g, ''))
  if (!Number.isFinite(parsed)) {
    return { changed: false, next: currentValue ?? undefined }
  }
  return { changed: parsed !== currentValue, next: parsed }
}

/**
 * Decide what to write into `historicalInputs[`${filingYear}_revenue`]` given
 * the canonical formData value and the current historical buffer.
 *
 * Returns `null` when no write is needed; otherwise the desired string (which
 * may be ""). Critically, returns `null` when the historical buffer holds a
 * partial typing state (NaN), so we never clobber the user's keystrokes.
 *
 *   formValue finite, raw = ""             → seed: String(formValue)
 *   formValue finite, raw parses to ≠      → overwrite: String(formValue)
 *   formValue finite, raw parses to ===    → no-op (already in sync)
 *   formValue finite, raw parses to NaN    → no-op (preserve partial input)
 *   formValue absent, raw parses to finite → propagate clear: ""
 *   formValue absent, raw = "" or NaN      → no-op
 */
export function computeNextHistoricalFromFormData(
  formValue: number | undefined | null,
  raw: string
): string | null {
  const parsed = raw === '' ? Number.NaN : parseFloat(raw.replace(/,/g, ''))
  const formIsNumber = typeof formValue === 'number' && Number.isFinite(formValue)

  if (formIsNumber) {
    if (raw === '') return String(formValue)
    if (Number.isFinite(parsed) && parsed !== formValue) return String(formValue)
    return null
  }

  if (Number.isFinite(parsed)) return ''
  return null
}

/**
 * Minimal shape required to merge year rows.
 *
 * The store types (`YearDataInput`) carry many optional fields; all we need
 * here is the year and the `is_forecast` flag.  Keeping the constraint loose
 * lets callers pass either a freshly-built `{year, revenue, ebitda}` row or a
 * fully-detailed `YearDataInput`.
 */
export interface YearLikeRow {
  year: number
  is_forecast?: boolean
}

/**
 * Builds the forecast row pool for {@link mergeHistoricalAndForecastRows}.
 *
 * `buildValuationRequest` reads forecasts from `forecast_years_data` when that
 * array is non-empty, otherwise from `historical_years_data` rows with
 * `is_forecast: true`.  `ManualInputPanel` can therefore keep projections only
 * in `forecast_years_data`.  ValuationForm merges must union **both** sources
 * so editing historical actuals never drops forecasts that never lived on
 * `historical_years_data`.
 *
 * Deduping: rows already marked `is_forecast` on `historical_years_data` win
 * over the same `year` on `forecast_years_data` (session shape may carry both).
 */
export function collectForecastRowsForMerge<
  T extends Partial<YearLikeRow & { revenue?: number; ebitda?: number }>,
>(historicalYearsData: readonly T[] | undefined, forecastYearsData: readonly T[] | undefined): T[] {
  const byYear = new Map<number, T>()

  for (const row of historicalYearsData ?? []) {
    if (row?.is_forecast === true && isValidYearRowYear(row.year)) {
      byYear.set(row.year, row)
    }
  }

  for (const row of forecastYearsData ?? []) {
    if (!isValidYearRowYear(row?.year)) continue
    const y = row.year as number
    if (!byYear.has(y)) {
      byYear.set(y, { ...row, year: y, is_forecast: true } as T)
    }
  }

  return Array.from(byYear.values())
}

/**
 * Merge freshly-built historical rows from this form's `historicalInputs`
 * with forecast rows from {@link collectForecastRowsForMerge} (or any list of
 * projection rows for future years).
 *
 * Why this exists:
 *   `ManualInputPanel` and `ValuationForm` share the same `useManualFormStore`.
 *   The ValuationForm only drives actuals (years &lt; filing year) plus the
 *   filing-year mirror; it would otherwise wipe projections when rewriting
 *   `historical_years_data`.
 *
 * Conflict policy:
 *   If the same `year` appears in BOTH inputs we keep the historical
 *   (non-forecast) row and drop the forecast row for that year.  Historical
 *   is the source of truth for an actually-observed year; a forecast for an
 *   already-observed year is contradictory data.
 *
 * Output is sorted chronologically (ascending) — backend-required order.
 */
export function mergeHistoricalAndForecastRows<H extends YearLikeRow, F extends YearLikeRow>(
  historicalRows: readonly H[],
  forecastRows: readonly F[]
): Array<H | F> {
  const validHistorical = historicalRows.filter((row) => isValidYearRowYear(row?.year)) as H[]

  const historicalYears = new Set<number>()
  for (const row of validHistorical) {
    historicalYears.add(row.year)
  }

  const forecastRowsToKeep = forecastRows.filter(
    (row) =>
      row?.is_forecast === true &&
      isValidYearRowYear(row.year) &&
      !historicalYears.has(row.year)
  )

  return [...validHistorical, ...forecastRowsToKeep].sort((a, b) => a.year - b.year)
}

/**
 * Pick out the forecast rows we should preserve when the form clears all
 * historical inputs.  Same conflict policy as
 * {@link mergeHistoricalAndForecastRows}, but with no historical rows in play.
 */
export function pickForecastRowsToPreserve<F extends YearLikeRow>(
  existingRows: readonly F[]
): F[] {
  return existingRows.filter(
    (row) => row?.is_forecast === true && isValidYearRowYear(row.year)
  )
}

/**
 * Structural equality for `historical_years_data` payloads after merge/normalize.
 * Sorts by year, clamps to the supported year window, and compares
 * year / revenue / ebitda / is_forecast so the ValuationForm effect can skip
 * redundant `updateFormData` calls when `historical_years_data` is in the
 * dependency array (avoids render loops).
 */
export function areMergedYearRowsEqual(
  a: readonly Partial<{
    year: number
    revenue?: number
    ebitda?: number
    is_forecast?: boolean
  }>[] | null | undefined,
  b: readonly Partial<{
    year: number
    revenue?: number
    ebitda?: number
    is_forecast?: boolean
  }>[] | null | undefined
): boolean {
  const norm = (
    rows: readonly Partial<{
      year: number
      revenue?: number
      ebitda?: number
      is_forecast?: boolean
    }>[] | null | undefined
  ) =>
    [...(rows ?? [])]
      .filter((r) => r != null && isValidYearRowYear(r.year))
      .sort((x, y) => x.year! - y.year!)
      .map((r) => ({
        y: r.year,
        rev: Number(r.revenue ?? 0),
        ebd: Number(r.ebitda ?? 0),
        f: r.is_forecast === true,
      }))

  return JSON.stringify(norm(a)) === JSON.stringify(norm(b))
}
