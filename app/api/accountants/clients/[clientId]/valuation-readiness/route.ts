import { type NextRequest, NextResponse } from 'next/server'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params
  if (!clientId) {
    return NextResponse.json({ success: false, message: 'Client ID is required' }, { status: 400 })
  }
  try {
    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const { response, json } = await fetchJsonWithTimeout(
      `${getTitanApiUrl(request)}/valuations/clients/${encodeURIComponent(clientId)}/readiness`,
      {
        method: 'GET',
        headers: cookieHeader ? { Cookie: cookieHeader } : {},
        credentials: 'include',
      },
      20_000
    )
    return NextResponse.json(json ?? {}, {
      status: response.status,
      headers: { 'Cache-Control': 'private, no-store' },
    })
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : 'Readiness check failed' },
      { status: 502 }
    )
  }
}
