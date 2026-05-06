/**
 * Headline pre-money used across Report, Round cap-table preview, studio
 * issues, and transparency narrative — keep in sync with priced-round math.
 *
 * Explicit term-sheet targets that are non-finite or ≤ 0 are ignored so a
 * bad CurrencyInput cannot pin headline valuations to €0.
 */

export function isValidPreMoneyTarget(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0
}

export function resolveHeadlinePreMoney(
  preMoneyTarget: number | null | undefined,
  blendedMid: number | null | undefined,
): number | null {
  if (isValidPreMoneyTarget(preMoneyTarget)) return preMoneyTarget
  if (blendedMid != null && Number.isFinite(blendedMid) && blendedMid > 0) return blendedMid
  return null
}
