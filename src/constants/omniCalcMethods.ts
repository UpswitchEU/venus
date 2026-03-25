/**
 * Method keys shown in the primary list (before "Show all methods") in OmniCalc UI.
 * Order is stable for UX (headline → multiples → DCF → balance sheet → fiscal).
 * Must match backend `ValuationMethodResult` keys from the valuation response.
 */
export const PRIMARY_OMNI_METHOD_ORDER = [
  'upswitch_adaptive',
  'ebitda_multiple',
  'omzet_multiple',
  'revenue_multiple',
  'sde_multiple',
  'dcf',
  'adjusted_nav',
  'fiscal_4x',
] as const

export const PRIMARY_OMNI_METHOD_KEYS = new Set<string>(PRIMARY_OMNI_METHOD_ORDER)

export function primaryOmniMethodOrderIndex(key: string): number {
  const i = (PRIMARY_OMNI_METHOD_ORDER as readonly string[]).indexOf(key)
  return i === -1 ? 999 : i
}

/** Primary methods first (catalog order), then secondary keys A–Z. */
export function compareOmniMethodKeys(a: string, b: string): number {
  const aP = PRIMARY_OMNI_METHOD_KEYS.has(a)
  const bP = PRIMARY_OMNI_METHOD_KEYS.has(b)
  if (aP && !bP) return -1
  if (!aP && bP) return 1
  if (aP && bP) return primaryOmniMethodOrderIndex(a) - primaryOmniMethodOrderIndex(b)
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

export function partitionOmniMethodEntries<T>(
  entries: [string, T][]
): { primary: [string, T][]; secondary: [string, T][] } {
  const primary = entries
    .filter(([k]) => PRIMARY_OMNI_METHOD_KEYS.has(k))
    .sort(([a], [b]) => primaryOmniMethodOrderIndex(a) - primaryOmniMethodOrderIndex(b))
  const secondary = entries
    .filter(([k]) => !PRIMARY_OMNI_METHOD_KEYS.has(k))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  return { primary, secondary }
}
