/**
 * ISO-3166 alpha-2 coercion for API payloads (Titan / ValuationIQ).
 *
 * Kept free of Zustand imports so SME builders can share the same rules as
 * the venture path without pulling `useStartupValuationStore`.
 *
 * @module utils/coerceIso2Country
 */

/**
 * Normalise a free-form country token to ISO-3166 alpha-2, or `null`
 * when the input is empty / too short.  Registry data may use `UK`;
 * APIs expect `GB`.
 */
export function coerceIso2OrNull(input: string | null | undefined): string | null {
  const u = (input ?? '').trim().toUpperCase()
  if (!u) return null
  if (u === 'UK') return 'GB'
  return u.length >= 2 ? u.substring(0, 2) : null
}
