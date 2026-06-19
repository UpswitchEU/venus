import {
  SESSION_CARD_FALLBACK_NULLISH_SCALARS,
  SESSION_CARD_FALLBACK_STRING_KEYS,
} from './optionalSessionPrefillKeys'
import { getRegistryIdentityFromRecord } from './registryIdentity'

/**
 * Session/bootstrap often ships multi-year figures as a map (`year_data`) rather than
 * `historical_years_data` - align with SessionNormalizer.
 */
export function historicalRowsFromYearDataBlob(
  yearData: unknown
): Array<{ year: number; revenue?: number; ebitda?: number }> | null {
  if (yearData == null || typeof yearData !== 'object' || Array.isArray(yearData)) return null
  const o = yearData as Record<string, { revenue?: number; ebitda?: number } | unknown>
  const years = Object.keys(o)
    .map((k) => Number.parseInt(k, 10))
    .filter((y) => Number.isFinite(y) && y >= 2000 && y <= 2100)
  if (years.length === 0) return null
  return years
    .sort((a, b) => a - b)
    .map((year) => {
      const raw = o[String(year)] ?? o[year]
      const data =
        raw && typeof raw === 'object' && !Array.isArray(raw)
          ? (raw as { revenue?: number; ebitda?: number })
          : {}
      return { year, revenue: data.revenue, ebitda: data.ebitda }
    })
}

function isBlankSessionString(value: unknown): boolean {
  return value === '' || (typeof value === 'string' && value.trim() === '')
}

function yearDataLikeEmpty(value: unknown): boolean {
  if (value == null) return true
  if (typeof value !== 'object' || Array.isArray(value)) return true
  return Object.keys(value as object).length === 0
}

function currentYearDataVacant(value: unknown): boolean {
  if (value == null) return true
  if (typeof value !== 'object' || Array.isArray(value)) return false
  const o = value as Record<string, unknown>
  const y = o.year
  const hasYear = y != null && String(y).trim() !== ''
  const hasFigures =
    (o.revenue != null && Number.isFinite(Number(o.revenue))) ||
    (o.ebitda != null && Number.isFinite(Number(o.ebitda))) ||
    (o.free_cash_flow != null && Number.isFinite(Number(o.free_cash_flow)))
  if (Object.keys(o).length === 0) return true
  return !hasYear && !hasFigures
}

function coalesceCardUnderEmptyTopLevel(
  merged: Record<string, unknown>,
  bi: Record<string, unknown>
): void {
  for (const key of SESSION_CARD_FALLBACK_STRING_KEYS) {
    if (!isBlankSessionString(merged[key])) continue
    const b = bi[key]
    if (b === undefined || b === null) continue
    if (typeof b === 'string' && b.trim() === '') continue
    merged[key] = b
  }

  for (const key of SESSION_CARD_FALLBACK_NULLISH_SCALARS) {
    const v = merged[key]
    if (v !== undefined && v !== null) continue
    const b = bi[key]
    if (b === undefined || b === null) continue
    merged[key] = b
  }

  const mh = merged['historical_years_data']
  const bh = bi['historical_years_data']
  if (Array.isArray(mh) && mh.length === 0 && Array.isArray(bh) && bh.length > 0) {
    merged['historical_years_data'] = bh
  }

  const mf = merged['forecast_years_data']
  const bf = bi['forecast_years_data']
  if (Array.isArray(mf) && mf.length === 0 && Array.isArray(bf) && bf.length > 0) {
    merged['forecast_years_data'] = bf
  }

  for (const yk of ['year_data', 'yearData'] as const) {
    if (!yearDataLikeEmpty(merged[yk])) continue
    const b = bi[yk]
    if (b == null || yearDataLikeEmpty(b)) continue
    merged[yk] = b
  }

  if (
    currentYearDataVacant(merged['current_year_data']) &&
    !currentYearDataVacant(bi['current_year_data'])
  ) {
    merged['current_year_data'] = bi['current_year_data']
  }
}

/**
 * Flatten `_businessInfo` into the session record (top-level wins), then recover values
 * hidden behind empty top-level placeholders (Mercury/Titan client-invite shape).
 *
 * Single read contract for session -> form: manual saves use a flat `sessionData`
 * shape; integrations add richer figures on the same keys, not a parallel hierarchy.
 */
export function mergeSessionSurfaceForOptionalPrefill(
  sessionData: unknown
): Record<string, unknown> {
  if (!sessionData || typeof sessionData !== 'object' || Array.isArray(sessionData)) {
    return {}
  }
  const sd = sessionData as Record<string, unknown> & {
    _businessInfo?: Record<string, unknown>
  }
  const bi =
    sd._businessInfo && typeof sd._businessInfo === 'object' && !Array.isArray(sd._businessInfo)
      ? (sd._businessInfo as Record<string, unknown>)
      : {}
  const merged: Record<string, unknown> = { ...bi, ...sd }
  coalesceCardUnderEmptyTopLevel(merged, bi)
  return merged
}

/** True when merged session JSON carries registry identity (includes `_businessInfo`). */
export function sessionEnvelopeHasIdentitySignals(sessionData: unknown): boolean {
  const merged = mergeSessionSurfaceForOptionalPrefill(sessionData) as Record<string, unknown>
  return !!(
    (typeof merged.company_name === 'string' && merged.company_name.trim() !== '') ||
    getRegistryIdentityFromRecord(merged) ||
    merged.vat_number ||
    merged.vatNumber
  )
}
