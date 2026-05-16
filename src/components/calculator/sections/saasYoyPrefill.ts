/**
 * Optional prefill source for `saas_arr_growth_pct` derived from the
 * historical revenue grid (`yearlyFinancials`).  When the founder has
 * already filled in two consecutive completed years, the YoY revenue
 * delta is the most accurate ARR-growth estimate we can offer without
 * an accounting integration — better than the sector median.
 *
 * Rules:
 *   1. Operate only on `isForecast === false` (or undefined) rows so
 *      forward-looking projections never feed back into the prefill.
 *   2. Take the two most recent complete years (descending sort).
 *   3. Both years must have a strictly positive revenue (we can't
 *      compute meaningful growth from a zero or negative base).
 *   4. Clamp the output to a defensible band so a one-off spike
 *      doesn't pre-populate an absurd value:
 *        - Floor:  -50% (a sharper decline is real but extreme; we
 *                  still surface it so the founder confirms).
 *        - Ceiling: 500% (anything north is more likely a data
 *                  entry artefact — a new line of business that
 *                  founder should classify before submitting).
 *   5. Round to 1 decimal so the prefill never looks fake-precise.
 *
 * Returned as an annual % integer-with-one-decimal (e.g. 42.5 = 42.5%
 * YoY), matching the `saas_arr_growth_pct` field's annual semantics.
 */

export interface YearlyFinancialsRow {
  year: string | number
  revenue: number
  isForecast?: boolean
}

const MIN_GROWTH_PCT = -50
const MAX_GROWTH_PCT = 500

export function computeYoyRevenueGrowthPct(
  yearlyFinancials: ReadonlyArray<YearlyFinancialsRow> | null | undefined
): number | null {
  if (!yearlyFinancials || yearlyFinancials.length < 2) return null
  const historical = yearlyFinancials.filter(
    (row) => row && row.isForecast !== true && Number.isFinite(row.revenue)
  )
  if (historical.length < 2) return null
  const sorted = [...historical].sort((a, b) => Number(b.year) - Number(a.year))
  const latest = sorted[0]
  const prior = sorted[1]
  if (!Number.isFinite(latest.revenue) || !Number.isFinite(prior.revenue)) return null
  if (prior.revenue <= 0) return null
  const ratio = (latest.revenue - prior.revenue) / prior.revenue
  const pct = ratio * 100
  if (!Number.isFinite(pct)) return null
  const clamped = Math.max(MIN_GROWTH_PCT, Math.min(MAX_GROWTH_PCT, pct))
  return Math.round(clamped * 10) / 10
}
