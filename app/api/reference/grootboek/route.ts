/**
 * Grootboek Reference Data Proxy
 *
 * Proxies Belgian MAR grootboek code requests to Titan's
 * ReferenceDataController. Public reference data — no auth required.
 *
 * @module api/reference/grootboek
 */

import { NextResponse } from 'next/server'
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

const TITAN_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://api.upswitch.app'

const TIMEOUT_MS = 10_000

/**
 * GET /api/reference/grootboek
 *
 * Returns Belgian grootboek codes for normalization UI.
 */
export async function GET() {
  try {
    const { response: titanResponse, json: data } = await fetchJsonWithTimeout(
      `${TITAN_API_URL}/api/v2/reference-data/grootboek`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        next: { revalidate: 3600 },
      },
      TIMEOUT_MS
    )

    if (!titanResponse.ok) {
      return NextResponse.json(
        { success: false, error: 'Grootboek reference data unavailable' },
        { status: titanResponse.status }
      )
    }

    return NextResponse.json(data ?? { success: false })
  } catch (error) {
    const isTimeout =
      error instanceof Error &&
      (error.name === 'AuthUpstreamTimeoutError' || error.message.includes('timeout'))
    if (isTimeout) {
      return NextResponse.json({ success: false, error: 'Request timeout' }, { status: 504 })
    }

    return NextResponse.json(
      { success: false, error: 'Failed to fetch grootboek data' },
      { status: 502 }
    )
  }
}
