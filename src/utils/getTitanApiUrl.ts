/**
 * Server-safe Titan API URL resolution.
 *
 * Use in Venus API routes (server-side) where getApiUrl() returns production
 * when typeof window === 'undefined'. This helper uses request headers to
 * infer staging vs production when env vars are missing.
 *
 * Priority:
 *   1. NEXT_PUBLIC_BACKEND_URL (explicit)
 *   2. NEXT_PUBLIC_API_BASE_URL (explicit)
 *   3. Hostname from request.headers.get('host'): preview/staging → api-staging
 *   4. Production fallback
 */

import type { NextRequest } from 'next/server'

const API_STAGING = 'https://api-staging.upswitch.app'
const API_PRODUCTION = 'https://api.upswitch.app'

/** Request-like with headers (Request | NextRequest) */
type RequestWithHeaders = { headers: Headers }

export function getTitanApiUrl(request?: RequestWithHeaders | NextRequest): string {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL
  if (process.env.NEXT_PUBLIC_API_BASE_URL) return process.env.NEXT_PUBLIC_API_BASE_URL

  const host = request?.headers.get('host')?.split(':')[0] ?? ''
  if (host.includes('preview.') || host.includes('staging.')) {
    return API_STAGING
  }

  return API_PRODUCTION
}
