import type { ValuationMethodResult } from '@/types/valuation'

const METHOD_KEY_ALIASES: Record<string, string> = {
  revenue_multiple: 'omzet_multiple',
}

const REVENUE_METHOD_KEYS = new Set(['omzet_multiple', 'revenue_multiple'])

/** The other NL/EN key for the same revenue-multiple methodology. */
export function revenueMethodologySiblingKey(
  key: string
): 'omzet_multiple' | 'revenue_multiple' | null {
  if (key === 'omzet_multiple') return 'revenue_multiple'
  if (key === 'revenue_multiple') return 'omzet_multiple'
  return null
}

/** Read method row from a hydrated map; `omzet_multiple` / `revenue_multiple` are aliases. */
export function getValuationMethodResultForKey(
  map: Record<string, ValuationMethodResult> | null | undefined,
  methodKey: string
): ValuationMethodResult | undefined {
  if (!map) return undefined
  const direct = map[methodKey]
  if (direct) return direct
  const sibling = revenueMethodologySiblingKey(methodKey)
  if (sibling) return map[sibling]
  return undefined
}

/**
 * After revenue alias hydration, `revenue_multiple` may duplicate
 * `omzet_multiple` by reference. Skip copying/enumerating the EN key when
 * merging UI rows.
 */
export function isDuplicateHydratedRevenueAliasEntry(
  map: Record<string, ValuationMethodResult | undefined>,
  key: string,
  method: ValuationMethodResult | undefined
): boolean {
  if (key !== 'revenue_multiple' || method == null) return false
  const omzet = map.omzet_multiple
  return omzet != null && omzet === method
}

/** True when both keys exist and reference the same hydrated row. */
export function hydratedRevenueMethodKeysAreSameRef(
  map: Record<string, ValuationMethodResult | undefined> | null | undefined
): boolean {
  if (!map || typeof map !== 'object') return false
  const omzet = map.omzet_multiple
  const revenue = map.revenue_multiple
  return omzet != null && revenue != null && omzet === revenue
}

export function isRevenueMethodologyKey(methodKey: string): boolean {
  return REVENUE_METHOD_KEYS.has(methodKey)
}

export function normalizeSelectedMethodKey(methodKey: unknown): string {
  if (methodKey == null) return ''
  const raw = String(methodKey).trim().toLowerCase().replace(/-/g, '_')
  const normalized = raw.split(/\s+/).join('_')
  return METHOD_KEY_ALIASES[normalized] || normalized
}

export function withRevenueMethodAliases<T extends Record<string, unknown>>(
  map: T | null
): T | null {
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    return map
  }

  const aliased = map as T & {
    omzet_multiple?: unknown
    revenue_multiple?: unknown
  }
  if (aliased.omzet_multiple && !aliased.revenue_multiple) {
    return { ...map, revenue_multiple: aliased.omzet_multiple }
  }
  if (aliased.revenue_multiple && !aliased.omzet_multiple) {
    return { ...map, omzet_multiple: aliased.revenue_multiple }
  }
  return map
}
