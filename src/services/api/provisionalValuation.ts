/**
 * Owner provisional valuation (BET-318, "Door 3 — estimate it for me").
 *
 * Thin client over the Venus BFF proxy
 * (`/api/valuations/provisional/:country/:registryNumber`) → Titan. Mirrors the
 * "blank is never a dead end" contract: it NEVER throws and NEVER rejects —
 * every failure (bad input, network, upstream miss) resolves to
 * `available:false`, so the Door 3 UI can always render the precision-upsell.
 */

export interface ProvisionalValuationBand {
  available: boolean
  band: { low: number; high: number; currency: string } | null
  confidence: string | null
  method: string | null
  computedAt: string | null
  ageDays: number | null
  source: string | null
}

export const PROVISIONAL_UNAVAILABLE: ProvisionalValuationBand = {
  available: false,
  band: null,
  confidence: null,
  method: null,
  computedAt: null,
  ageDays: null,
  source: null,
}

/** Normalised registry number for the path: alphanumeric, no separators. */
function normalizeRegistryNumber(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '')
}

/**
 * Fetch a registry-derived provisional equity band for the owner's company.
 * Resolves to `available:false` on any failure — callers never need a try/catch.
 */
export async function fetchProvisionalBand(
  country: string,
  registryNumber: string
): Promise<ProvisionalValuationBand> {
  const normalizedCountry = country.trim().toUpperCase()
  const normalizedRegistry = normalizeRegistryNumber(registryNumber)
  if (!/^[A-Z]{2}$/.test(normalizedCountry) || normalizedRegistry.length === 0) {
    return PROVISIONAL_UNAVAILABLE
  }

  try {
    const response = await fetch(
      `/api/valuations/provisional/${encodeURIComponent(normalizedCountry)}/${encodeURIComponent(
        normalizedRegistry
      )}`,
      {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      }
    )
    if (!response.ok) return PROVISIONAL_UNAVAILABLE
    const json = (await response.json().catch(() => null)) as ProvisionalValuationBand | null
    return json && typeof json === 'object' ? json : PROVISIONAL_UNAVAILABLE
  } catch {
    return PROVISIONAL_UNAVAILABLE
  }
}
