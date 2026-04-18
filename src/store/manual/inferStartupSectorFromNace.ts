/**
 * NACE-BEL → StartupSector inference for the venture-path PLG flow.
 *
 * Mercury's KBO-search prefill carries a NACE code through to Venus.
 * Without inference, every founder lands on the default "saas" sector
 * even when their KBO record clearly says fintech / biotech / hardware,
 * forcing them to make a choice that the system already had evidence to
 * resolve.  Inferring a sane default here saves the founder a click and,
 * more importantly, anchors the VC-method exit multiple + Y5 revenue
 * defaults to the right industry without any user friction.
 *
 * Mapping is intentionally **conservative**:
 *   - Only high-confidence prefixes are mapped.
 *   - Anything ambiguous returns `null` so the store keeps its default.
 *   - The user can always override after we seed; we expose a
 *     `_sectorWasUserSet` flag in the store so we never re-seed away
 *     from an explicit choice.
 *
 * Sources: NACE-BEL 2008 (Statbel) section / division definitions.
 */

import type { StartupSector } from '@/store/manual/useStartupValuationStore'

/**
 * Map a NACE code (Belgian or generic NACE Rev. 2) to a startup sector.
 *
 * Returns `null` when the code is missing, malformed, or maps to a
 * domain we'd rather leave to the user (e.g. construction, agriculture).
 *
 * Examples:
 *   "62.01"   → "saas"               (computer programming)
 *   "64.19"   → "fintech"            (other monetary intermediation)
 *   "21.20"   → "biotech_healthtech" (pharmaceutical preparations)
 *   "47.91"   → "consumer"           (retail via mail order / internet)
 *   "10.71"   → null                 (bread / pastry — keep default)
 */
export function inferStartupSectorFromNace(
  nace: string | null | undefined
): StartupSector | null {
  if (!nace || typeof nace !== 'string') return null
  // Strip dots, spaces and any country prefix; we only care about the
  // first 2-4 numeric digits ("division.class").
  const digits = nace.replace(/[^0-9]/g, '')
  if (digits.length < 2) return null
  const division = parseInt(digits.slice(0, 2), 10)
  if (Number.isNaN(division)) return null

  // --- Section J — Information & Communication (58-63) ---
  // 58 publishing (incl. software), 62 IT services / programming,
  // 63 data processing / web portals → SaaS / deeptech umbrella.
  if (division === 58 || division === 62 || division === 63) return 'saas'
  // 61 telecoms is closer to infra than to a SaaS startup; skip.

  // --- Section K — Financial activities (64-66) → fintech ---
  if (division >= 64 && division <= 66) return 'fintech'

  // --- Section M — Professional, scientific, technical (71-75) ---
  // 72 = scientific R&D (incl. AI labs / biotech R&D)
  if (division === 72) return 'deeptech_ai'

  // --- Section Q — Human health & social work (86-88) → healthtech ---
  if (division >= 86 && division <= 88) return 'biotech_healthtech'

  // --- Section C — Manufacturing ---
  // 21 = pharmaceutical preparations → biotech
  if (division === 21) return 'biotech_healthtech'
  // 26-30 = electronics, machinery, vehicles → hardware
  if (division >= 26 && division <= 30) return 'hardware'

  // --- Section H — Transportation & storage (49-53) → marketplace ---
  // Conservative: most digital-native logistics startups present as
  // marketplaces.  Pure carriers stay generic.
  if (division >= 49 && division <= 53) return 'marketplace'

  // --- Section G — Retail (47) → consumer ---
  if (division === 47) return 'consumer'

  return null
}
