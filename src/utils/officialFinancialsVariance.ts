/**
 * User vs official filing variance — mirrors Titan bootstrap `computeOfficialVarianceAnalysis`
 * (soft threshold default 10%, hard 25%).
 */

import type { OfficialFinancials } from '../lib/bootstrap/types'
import type { OfficialVarianceAnalysis } from '../types/valuation'

function calculateVariancePercent(
  userValue: number | undefined,
  officialValue: number | undefined
): number | undefined {
  if (
    userValue == null ||
    officialValue == null ||
    !Number.isFinite(userValue) ||
    !Number.isFinite(officialValue) ||
    officialValue === 0
  ) {
    return undefined
  }
  return Math.abs(((userValue - officialValue) / Math.abs(officialValue)) * 100)
}

/**
 * Recompute variance analysis on official filing data using the user's current inputs.
 * Call after async enrichment merges so parity with synchronous Titan bootstrap.
 *
 * @param previousVariance - When recomputing (e.g. user edits revenue), preserve draft explanation text while state stays `pending`.
 */
export function applyUserVsOfficialVariance(
  official: OfficialFinancials,
  userRevenue: number | undefined | null,
  userEbitda: number | undefined | null,
  previousVariance?: OfficialVarianceAnalysis | null
): OfficialFinancials {
  const soft = official.variancePolicy?.softThresholdPercent ?? 10
  const hard = official.variancePolicy?.hardThresholdPercent ?? 25

  const ur = userRevenue == null ? undefined : Number(userRevenue)
  const ue = userEbitda == null ? undefined : Number(userEbitda)

  const revenueVariance =
    official.revenueSource === 'gross_margin'
      ? undefined
      : calculateVariancePercent(ur, official.revenue)
  const ebitdaVariance = calculateVariancePercent(ue, official.ebitda)
  const maxVariance = [revenueVariance, ebitdaVariance]
    .filter((value): value is number => value != null)
    .sort((a, b) => b - a)[0]

  const explanationRequired = (maxVariance ?? 0) >= soft

  let severity: 'none' | 'soft' | 'hard' = 'none'
  if (maxVariance != null) {
    if (maxVariance >= hard) severity = 'hard'
    else if (maxVariance >= soft) severity = 'soft'
  }

  let state: 'not_started' | 'pending' | 'not_required' | 'explained' =
    maxVariance == null ? 'not_started' : explanationRequired ? 'pending' : 'not_required'

  const draftExplanation = previousVariance?.explanation?.trim()
  const preserveDraft = state === 'pending' && Boolean(draftExplanation)

  if (
    state === 'pending' &&
    explanationRequired &&
    previousVariance?.state === 'explained' &&
    draftExplanation
  ) {
    state = 'explained'
  }

  const varianceAnalysis: OfficialVarianceAnalysis = {
    state,
    explanationRequired,
    severity,
    ...(revenueVariance != null ? { revenueVariancePercent: revenueVariance } : {}),
    ...(ebitdaVariance != null ? { ebitdaVariancePercent: ebitdaVariance } : {}),
    ...(maxVariance != null ? { maxVariancePercent: maxVariance } : {}),
    ...(preserveDraft ? { explanation: previousVariance?.explanation } : {}),
  }

  return {
    ...official,
    varianceAnalysis,
  }
}
