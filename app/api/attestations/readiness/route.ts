import { type NextRequest, NextResponse } from 'next/server'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const titanApiUrl = getTitanApiUrl()
    const { response, json } = await fetchJsonWithTimeout(
      `${titanApiUrl}/api/v2/attestations/readiness`,
      {
        method: 'GET',
        headers: cookieHeader ? { Cookie: cookieHeader } : {},
        credentials: 'include',
      },
      10_000
    )
    return NextResponse.json(json ?? {}, {
      status: response.ok ? 200 : response.status,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Attestation readiness check failed'
    return NextResponse.json({ enabled: false, message }, { status: 500 })
  }
}
