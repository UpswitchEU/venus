/**
 * Headline pre-money used across Report, Round cap-table preview, studio
 * issues, and transparency narrative — keep in sync with priced-round math.
 *
 * Explicit term-sheet targets that are non-finite or ≤ 0 are ignored so a
 * bad CurrencyInput cannot pin headline valuations to €0.
 */

/**
 * Sanity cap for any persisted EUR field on the studio store — 1
 * quadrillion EUR is well above any plausible pre-money target and
 * keeps a typo-of-many-zeros from blowing up downstream math.  Lives
 * here (rather than in a shared constants module) because pre-money
 * is the only field we actively clamp against it today.
 */
const PRE_MONEY_TARGET_MAX_EUR = 1e15

/**
 * Persisted / API cap-table pre-money: same bounds as other studio EUR fields.
 * Non-finite, ≤ 0, or absurdly large → null (or cap).
 */
export function normalizePreMoneyTarget(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded <= 0) return null
  return Math.min(rounded, PRE_MONEY_TARGET_MAX_EUR)
}

/** True when an explicit pre-money target is in effect (persists / display). */
export function isValidPreMoneyTarget(value: number | null | undefined): boolean {
  return normalizePreMoneyTarget(value) !== null
}

export function resolveHeadlinePreMoney(
  preMoneyTarget: number | null | undefined,
  blendedMid: number | null | undefined
): number | null {
  const explicit = normalizePreMoneyTarget(preMoneyTarget)
  if (explicit != null) return explicit
  if (blendedMid != null && Number.isFinite(blendedMid) && blendedMid > 0) return blendedMid
  return null
}
