/**
 * Resolve the origin of the Mercury app from Venus.
 *
 * Used by step 4a's "prefilled from settings" hint and any other Venus
 * surface that needs a deep link back into Mercury (advisor settings,
 * dashboard, etc). Returns `null` when the origin can't be confidently
 * resolved — callers must degrade gracefully (render the hint without a
 * link).
 *
 * Resolution order:
 *  1. `NEXT_PUBLIC_MERCURY_URL` env var — explicit, always wins, strips
 *     trailing slashes.
 *  2. Host-swap heuristic in the browser only — when the current host is on
 *     a known Venus subdomain (`venus.`, `calculator.`), Mercury lives at
 *     the bare domain. This covers the standard Upswitch deploy topology
 *     without needing the env var set everywhere.
 *  3. Same-origin fallback — when running on a single Vercel preview where
 *     both apps sit under one host (mercury.vercel.app routes Venus and
 *     Mercury alike), point at `/` of the current host. The downstream
 *     Mercury settings route then handles routing locally.
 *  4. `null` otherwise — better to render the hint without a link than to
 *     send the advisor to a 404.
 */

const TRAILING_SLASHES = /\/+$/
const KNOWN_VENUS_HOST_PREFIXES = ['venus.', 'calculator.'] as const

export function getMercuryAppOrigin(
  envValue: string | undefined,
  currentLocation: { protocol: string; host: string } | null
): string | null {
  const trimmed = envValue?.trim()
  if (trimmed) return trimmed.replace(TRAILING_SLASHES, '')

  if (!currentLocation) return null
  const { protocol, host } = currentLocation
  if (!protocol || !host) return null

  for (const prefix of KNOWN_VENUS_HOST_PREFIXES) {
    if (host.startsWith(prefix)) {
      return `${protocol}//${host.slice(prefix.length)}`
    }
  }

  // Preview / monolith case: the Mercury settings route is hosted on the
  // same origin (Next.js rewrites or shared deploy). Returning the current
  // origin keeps the deep link working in that topology.
  return `${protocol}//${host}`
}

/**
 * Browser-side convenience wrapper that reads from `process.env` and
 * `window.location` directly. Server-side / non-browser calls always
 * return `null` because there is no current location to swap from.
 */
export function resolveMercuryAppOrigin(): string | null {
  if (typeof window === 'undefined') {
    return getMercuryAppOrigin(process.env.NEXT_PUBLIC_MERCURY_URL, null)
  }
  return getMercuryAppOrigin(process.env.NEXT_PUBLIC_MERCURY_URL, {
    protocol: window.location.protocol,
    host: window.location.host,
  })
}
