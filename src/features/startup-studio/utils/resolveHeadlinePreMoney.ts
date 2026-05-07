/**
 * Headline pre-money used across Report, Round cap-table preview, studio
 * issues, and transparency narrative — keep in sync with priced-round math.
 *
 * Explicit term-sheet targets that are non-finite or ≤ 0 are ignored so a
 * bad CurrencyInput cannot pin headline valuations to €0.
 */

import { TAM_SAM_SOM_MAX_EUR } from '@/features/startup-studio/utils/tamSamSomFunnel'

/**
 * Persisted / API cap-table pre-money: same bounds as other studio EUR fields.
 * Non-finite, ≤ 0, or absurdly large → null (or cap).
 */
export function normalizePreMoneyTarget(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded <= 0) return null
  return Math.min(rounded, TAM_SAM_SOM_MAX_EUR)
}

/** True when an explicit pre-money target is in effect (persists / display). */
export function isValidPreMoneyTarget(value: number | null | undefined): boolean {
  return normalizePreMoneyTarget(value) !== null
}

export function resolveHeadlinePreMoney(
  preMoneyTarget: number | null | undefined,
  blendedMid: number | null | undefined,
): number | null {
  const explicit = normalizePreMoneyTarget(preMoneyTarget)
  if (explicit != null) return explicit
  if (blendedMid != null && Number.isFinite(blendedMid) && blendedMid > 0) return blendedMid
  return null
}
