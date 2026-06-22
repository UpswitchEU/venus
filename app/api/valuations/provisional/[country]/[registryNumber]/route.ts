/**
 * Owner Provisional Valuation Proxy (BET-318, "Door 3 — estimate it for me").
 *
 * Auth-forwarded proxy to Titan's
 * `GET /api/v2/valuations/provisional/:country/:registryNumber`. Returns the
 * lean provisional-band DTO so a financials-step owner with no figures still
 * gets a ballpark from registry data.
 *
 * "Blank is never a dead end": malformed input, an upstream miss, a timeout, or
 * any failure all resolve to `available:false` (HTTP 200) rather than an error —
 * the door then leads with the precision-upsell (connect / invite). Titan itself
 * never 503s this route; we mirror that contract on the way through.
 *
 * @module api/valuations/provisional
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

const TITAN_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://api.upswitch.app'

const TIMEOUT_MS = 12_000
const COUNTRY_PATTERN = /^[A-Z]{2}$/
const REGISTRY_PATTERN = /^[A-Za-z0-9]{1,32}$/

/** Graceful "no band" — the door's not-a-dead-end fallback. */
const UNAVAILABLE = {
  available: false,
  band: null,
  confidence: null,
  method: null,
  computedAt: null,
  ageDays: null,
  source: null,
} as const

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ country: string; registryNumber: string }> }
) {
  const { country, registryNumber } = await params
  const normalizedCountry = country.trim().toUpperCase()
  const normalizedRegistry = registryNumber.replace(/[^A-Za-z0-9]/g, '')
  if (!COUNTRY_PATTERN.test(normalizedCountry) || !REGISTRY_PATTERN.test(normalizedRegistry)) {
    return NextResponse.json(UNAVAILABLE)
  }

  try {
    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const { response, json } = await fetchJsonWithTimeout(
      `${TITAN_API_URL}/api/v2/valuations/provisional/${normalizedCountry}/${normalizedRegistry}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        credentials: 'include',
      },
      TIMEOUT_MS
    )
    if (!response.ok || !json || typeof json !== 'object') {
      return NextResponse.json(UNAVAILABLE)
    }
    return NextResponse.json(json)
  } catch {
    return NextResponse.json(UNAVAILABLE)
  }
}
