/**
 * Pure helpers shared by `useStartupPrefill`.  Extracted so the
 * defensive parsing logic can be unit-tested without mounting the
 * hook against a fake bootstrap context.
 */

/** Round-size deep-link bounds — clamps obvious garbage from URL inputs. */
export const ROUND_SIZE_MIN = 10_000
export const ROUND_SIZE_MAX = 10_000_000

/**
 * Parse the founding year out of a KBO/KVK foundationDate.  The upstream
 * field is loosely typed (sometimes ISO `yyyy-mm-dd`, sometimes `yyyy`,
 * sometimes empty) so we accept either + reject anything outside a
 * defensible range.
 */
export function parseFoundingYear(input?: string | null): number | null {
  if (!input) return null
  const match = /^(\d{4})/.exec(input.trim())
  if (!match) return null
  const year = Number(match[1])
  if (!Number.isFinite(year) || year < 1900 || year > 2100) return null
  return year
}

/**
 * Validate + clamp a URL-supplied round size.
 *   - Drops anything below `ROUND_SIZE_MIN` (likely a typo or test value).
 *   - Clamps anything above `ROUND_SIZE_MAX` to the cap (better than
 *     refusing the prefill outright — a founder pasting a Series-B
 *     deep-link still gets the cap, with a chance to sharpen it).
 */
export function parseRoundSize(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  if (value < ROUND_SIZE_MIN) return null
  if (value > ROUND_SIZE_MAX) return ROUND_SIZE_MAX
  return value
}
