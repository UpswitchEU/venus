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
 *   3. Hostname from request.headers.get('host'): localhost → local Titan
 *   4. Hostname from request.headers.get('host'): preview/staging → api-staging
 *   5. Production fallback
 */

import type { NextRequest } from 'next/server'

import { tryNormalizeApiBaseUrl } from '@/utils/normalizeExplicitUrl'

const API_STAGING = 'https://api-staging.upswitch.app'
const API_PRODUCTION = 'https://api.upswitch.app'
const API_LOCAL = 'http://localhost:3002'

/** Request-like with headers (Request | NextRequest) */
type RequestWithHeaders = { headers: Headers }

export function getTitanApiUrl(request?: RequestWithHeaders | NextRequest): string {
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

  const nextUrlHostname =
    request && 'nextUrl' in request && request.nextUrl ? request.nextUrl.hostname.split(':')[0] : ''
  const host = request?.headers.get('host')?.split(':')[0] || nextUrlHostname
  if (host === 'localhost' || host === '127.0.0.1') {
    return API_LOCAL
  }

  if (host.includes('preview.') || host.includes('staging.')) {
    return API_STAGING
  }

  return API_PRODUCTION
}
