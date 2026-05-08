/**
 * Regional baseline — TypeScript mirror of
 * `apps/valuation-iq/src/domain/startup_valuation/regional_data.py`.
 *
 * The Python engine owns the canonical numbers; we re-publish them
 * here so the left-panel can render the academic *per-milestone EUR
 * value* (Component 1) and the *average pre-money anchor*
 * (Scorecard footnote) without an extra round-trip.
 *
 * KEEP IN SYNC with `regional_data.py`.  When the engine swaps the
 * static dict for a live Athena/Delphi feed, we'll either:
 *   - Expose `/api/v2/stateless/startup/reference?country=...&stage=...`
 *     and replace this constant with a SWR hook, or
 *   - Bake the table into the bootstrap response that the manual
 *     flow already pulls on session start.
 *
 * Until then this constant is the single source of truth on the
 * Venus side, mirrored 1:1 with the Python engine.
 */

import type { StartupStage } from '@/store/manual/useStartupValuationStore'

/**
 * Per-stage Berkus + Scorecard reference bundle.  Numbers are EUR.
 *
 * `total_berkus_cap` is derived (`max_per_milestone × 5`) and exposed
 * for convenience so the UI can render headline copy ("Up to €2.5M
 * across 5 milestones") without re-multiplying at every render.
 */
export interface StartupRegionalBaseline {
  region_code: string
  stage: StartupStage
  /** Average pre-money for recently funded startups in this region/stage (EUR). */
  average_pre_money: number
  /** Maximum value attributed to *each* of the 5 Berkus milestones (EUR). */
  max_per_milestone: number
  /** `max_per_milestone × 5` — total Berkus ceiling (EUR). */
  total_berkus_cap: number
  /** Median EV/Revenue exit multiple observed for comparable Year-5 exits. */
  comparable_exit_revenue_multiple: number
  /** Default cash-on-cash target VCs require for this stage (e.g. 20x for seed). */
  default_target_roi_x: number
  /** Default cumulative founder dilution to exit (%). */
  default_dilution_pct: number
}

const _BE_PRE_SEED: StartupRegionalBaseline = {
  region_code: 'BE',
  stage: 'pre_seed',
  average_pre_money: 1_500_000,
  max_per_milestone: 500_000,
  total_berkus_cap: 2_500_000,
  comparable_exit_revenue_multiple: 5,
  default_target_roi_x: 30,
  default_dilution_pct: 60,
}

const _BE_SEED: StartupRegionalBaseline = {
  region_code: 'BE',
  stage: 'seed',
  average_pre_money: 4_000_000,
  max_per_milestone: 500_000,
  total_berkus_cap: 2_500_000,
  comparable_exit_revenue_multiple: 6,
  default_target_roi_x: 20,
  default_dilution_pct: 55,
}

const _BE_SERIES_A: StartupRegionalBaseline = {
  region_code: 'BE',
  stage: 'series_a',
  average_pre_money: 12_000_000,
  max_per_milestone: 750_000,
  total_berkus_cap: 3_750_000,
  comparable_exit_revenue_multiple: 7,
  default_target_roi_x: 10,
  default_dilution_pct: 45,
}

/**
 * region → stage → baseline.  Dutch / Lux fall back to BE numbers,
 * matching `regional_data.py`'s explicit aliases.
 */
const REGIONAL_BASELINE: Readonly<
  Record<string, Readonly<Record<StartupStage, StartupRegionalBaseline>>>
> = Object.freeze({
  BE: Object.freeze({ pre_seed: _BE_PRE_SEED, seed: _BE_SEED, series_a: _BE_SERIES_A }),
  NL: Object.freeze({
    pre_seed: { ..._BE_PRE_SEED, region_code: 'NL' },
    seed: { ..._BE_SEED, region_code: 'NL' },
    series_a: { ..._BE_SERIES_A, region_code: 'NL' },
  }),
  LU: Object.freeze({
    pre_seed: { ..._BE_PRE_SEED, region_code: 'LU' },
    seed: { ..._BE_SEED, region_code: 'LU' },
    series_a: { ..._BE_SERIES_A, region_code: 'LU' },
  }),
})

const DEFAULT_REGION = 'BE'

/**
 * Resolve the regional baseline for a given country/stage.
 * Falls back to Belgium when the country code is unknown — keeps
 * pure-render hooks safe to call even before bootstrap finishes
 * loading the user's profile country.
 */
export function getRegionalBaseline(
  countryCode: string | null | undefined,
  stage: StartupStage,
): StartupRegionalBaseline {
  const code = (countryCode ?? DEFAULT_REGION).toUpperCase()
  const region = REGIONAL_BASELINE[code] ?? REGIONAL_BASELINE[DEFAULT_REGION]
  return region[stage]
}

/**
 * Pure-function mirror of `berkus.calculate_berkus`.  Used purely for
 * the live preview chip on the left panel — the canonical number
 * still comes from the Python engine.
 *
 * Mirrors `apps/valuation-iq/src/domain/startup_valuation/berkus.py`.
 */
export function previewBerkusContribution(
  scorePct: number,
  maxPerMilestone: number,
): number {
  if (!Number.isFinite(scorePct) || scorePct <= 0) return 0
  const clamped = Math.min(100, Math.max(0, scorePct))
  return Math.round((clamped / 100) * maxPerMilestone)
}

/**
 * Forecast horizon for the live SaaS-forward preview — matches the
 * Python engine's `_FORWARD_MONTHS` so the on-screen number tracks
 * what the report will eventually print.
 */
const FORWARD_MONTHS = 12

/**
 * Cap on monthly growth used for the forward ARR preview.  Anything
 * above ~20%/mo compounds into nine-figure projections in a year and
 * blows up the UI without changing the founder's signal.
 */
const MAX_MOM_GROWTH_PCT = 20

/**
 * Forward 12-month ARR projection — pure mirror of the engine's
 * ``saas_forward._project_forward_arr`` (without the Decimal
 * quantisation).  Returns ``null`` when no anchor revenue exists.
 *
 * Lives here (not in the legacy `ForwardLookingSaasSection.tsx`,
 * which was retired 2026-05-08) so the test suite keeps a single
 * import target.
 */
export function projectForwardArrEur({
  mrr,
  arr,
  momGrowthPct,
}: {
  mrr: number | null | undefined
  arr: number | null | undefined
  momGrowthPct: number | null | undefined
}): number | null {
  const anchorMrr =
    typeof mrr === 'number' && mrr > 0
      ? mrr
      : typeof arr === 'number' && arr > 0
        ? arr / 12
        : null
  if (anchorMrr === null) return null

  const growth =
    typeof momGrowthPct === 'number' && momGrowthPct > 0
      ? Math.min(momGrowthPct, MAX_MOM_GROWTH_PCT)
      : 0
  const monthlyFactor = 1 + growth / 100
  const forwardMrr = anchorMrr * Math.pow(monthlyFactor, FORWARD_MONTHS)
  return Math.round(forwardMrr * 12)
}

/**
 * Default target ROI surfaced when a stage-specific override is not
 * available.  The 15× academic mid-point preserves the legacy fallback
 * the now-retired `ExitScenarioSection` defaulted to.
 */
export const DEFAULT_TARGET_ROI_X = 15

/**
 * Pure mirror of the engine's VC backsolve formula
 * ``vc_method.calculate_vc_method`` (without Decimal quantisation).
 * Returns ``null`` when the inputs cannot produce a meaningful pre-money
 * (zero/negative inputs, fully oversubscribed round, etc).  Lives here
 * alongside the regional baseline so callers don't have to reach into
 * the retired `ExitScenarioSection.tsx`.
 */
export function previewVcMethod({
  year5Revenue,
  exitMultiple,
  targetRoi,
  investmentSought,
  fallbackRoi,
}: {
  year5Revenue: number | null | undefined
  exitMultiple: number | null | undefined
  targetRoi: number | null | undefined
  investmentSought: number | null | undefined
  fallbackRoi: number
}): { post: number; pre: number; investment: number; dilution: number } | null {
  const y5 = typeof year5Revenue === 'number' ? year5Revenue : 0
  const m = typeof exitMultiple === 'number' ? exitMultiple : 0
  const roi =
    typeof targetRoi === 'number' && targetRoi > 0 ? targetRoi : fallbackRoi
  const inv =
    typeof investmentSought === 'number' && investmentSought > 0 ? investmentSought : 0

  if (y5 <= 0 || m <= 0 || roi <= 0) return null

  const post = (y5 * m) / roi
  if (post <= 0) return null

  if (inv <= 0) return { post, pre: post, investment: 0, dilution: 0 }

  const pre = Math.max(0, post - inv)
  const rawDilution = (inv / post) * 100
  const dilution = Math.max(0, Math.min(100, rawDilution))
  return { post, pre, investment: inv, dilution }
}
