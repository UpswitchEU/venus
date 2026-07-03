/**
 * Derive the correct Mercury (parent app) URL based on the current hostname.
 *
 * Venus runs on a subdomain of Mercury (e.g. valuation.upswitch.app vs www.upswitch.app).
 * In preview/staging environments the subdomain includes a prefix
 * (e.g. preview.valuation.upswitch.app -> preview.upswitch.app).
 *
 * URL mapping:
 *   preview.valuation.upswitch.app  →  preview.upswitch.app
 *   staging.valuation.upswitch.app  →  staging.upswitch.app
 *   valuation.upswitch.app          →  www.upswitch.app (marketing canonical)
 *
 * `NEXT_PUBLIC_MERCURY_URL` / `NEXT_PUBLIC_PARENT_DOMAIN` are normalized (https + origin only).
 */
import {
  MERCURY_SITE_WWW_CANONICAL,
  tryNormalizeApiBaseUrl,
  tryNormalizeToOrigin,
} from './normalizeExplicitUrl'

export function deriveMercuryOriginFromTrustedVenusHostname(hostname: string): string | null {
  const host = hostname.split(':')[0]?.toLowerCase() ?? ''

  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://localhost:3000'
  }

  if (host === 'preview.valuation.upswitch.app') return 'https://preview.upswitch.app'
  if (host === 'staging.valuation.upswitch.app') return 'https://staging.upswitch.app'
  if (host === 'valuation.upswitch.app') return MERCURY_SITE_WWW_CANONICAL
  if (host === 'valuation.upswitch.biz') return 'https://upswitch.biz'

  return null
}

export function getMercuryUrl(): string {
  const envRaw = process.env.NEXT_PUBLIC_MERCURY_URL || process.env.NEXT_PUBLIC_PARENT_DOMAIN
  if (envRaw?.trim()) {
    const origin = tryNormalizeToOrigin(envRaw)
    if (origin) return origin
  }

  if (typeof window === 'undefined') {
    return MERCURY_SITE_WWW_CANONICAL
  }

  const hostname = window.location.hostname

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3000'
  }

  const derived = deriveMercuryOriginFromTrustedVenusHostname(hostname)
  if (derived) return derived

  return MERCURY_SITE_WWW_CANONICAL
}

/**
 * Resolve the Titan API base URL, environment-aware.
 *
 * Priority:
 *   1. NEXT_PUBLIC_BACKEND_URL (explicit)
 *   2. NEXT_PUBLIC_API_BASE_URL (explicit)
 *   3. Hostname-based detection (preview / staging → api-staging)
 *   4. Production fallback
 *
 * Use this everywhere Venus calls Titan so staging never accidentally hits prod.
 */
export function getApiUrl(): string {
  const backend = process.env.NEXT_PUBLIC_BACKEND_URL?.trim()
  if (backend) {
    const n = tryNormalizeApiBaseUrl(backend)
    if (n) return n
  }

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.trim()
  if (apiBase) {
    const n = tryNormalizeApiBaseUrl(apiBase)
    if (n) return n
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3002'
    }
    if (host.includes('preview.') || host.includes('staging.')) {
      return 'https://api-staging.upswitch.app'
    }
  }

  return 'https://api.upswitch.app'
}
