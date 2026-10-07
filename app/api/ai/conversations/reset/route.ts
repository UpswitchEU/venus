import { NextRequest, NextResponse } from 'next/server'
import { getTitanAccessTokenFromCookieHeader } from '@/utils/auth/cookieHeader'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { getTitanClientContextHeaders } from '@/utils/titanClientContextHeaders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (typeof body?.reportId !== 'string' || !body.reportId.trim()) {
    return NextResponse.json({ error: 'reportId is required' }, { status: 400 })
  }
  try {
    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const accessToken = getTitanAccessTokenFromCookieHeader(cookieHeader)
    if (!accessToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { response, json } = await fetchJsonWithTimeout(
      `${getTitanApiUrl(request)}/api/v2/ai/conversations/${encodeURIComponent(body.reportId)}/reset`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Cookie: cookieHeader,
          ...getTitanClientContextHeaders(request),
        },
      },
      10_000
    )
    if (!response.ok)
      return NextResponse.json({ error: 'Conversation reset failed' }, { status: response.status })
    if (
      !json ||
      typeof json !== 'object' ||
      !('conversationId' in json) ||
      typeof json.conversationId !== 'string' ||
      !json.conversationId
    ) {
      return NextResponse.json({ error: 'Invalid reset response' }, { status: 502 })
    }
    return NextResponse.json({ success: true, conversationId: json.conversationId })
  } catch {
    return NextResponse.json({ error: 'Conversation reset unavailable' }, { status: 502 })
  }
}
