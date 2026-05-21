import { NextRequest, NextResponse } from 'next/server'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { PRIVATE_BFF_JSON_HEADERS } from '@/utils/bffResponseHeaders'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

// Force dynamic rendering - this route uses cookies() which is dynamic
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const REPORT_DELETE_TIMEOUT_MS = 10_000

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const titanApiUrl = getTitanApiUrl(request)
    const { reportId } = await params

    if (!reportId) {
      return NextResponse.json(
        { success: false, message: 'Report ID is required' },
        { status: 400, headers: PRIVATE_BFF_JSON_HEADERS }
      )
    }

    const { cookieHeader } = await getBffCookieHeaderForTitan(request)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (cookieHeader) headers.Cookie = cookieHeader

    const guestSessionId = request.headers.get('x-guest-session-id')
    if (guestSessionId) {
      headers['x-guest-session-id'] = guestSessionId
    }

    const response = await fetchWithTimeout(
      `${titanApiUrl}/api/v2/valuations/reports/${encodeURIComponent(reportId)}`,
      {
        method: 'DELETE',
        headers,
        credentials: 'include',
      },
      REPORT_DELETE_TIMEOUT_MS
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to delete report' }))
      return NextResponse.json(
        {
          success: false,
          message: errorData.message || 'Failed to delete report',
        },
        { status: response.status, headers: PRIVATE_BFF_JSON_HEADERS }
      )
    }

    const data = await response.json().catch(() => ({ success: true }))
    return NextResponse.json(data, { headers: PRIVATE_BFF_JSON_HEADERS })
  } catch (error) {
    console.error('[Venus /api/reports/[reportId]] Error:', error)
    const isTimeout = error instanceof Error && error.message.includes('timeout')
    return NextResponse.json(
      { error: isTimeout ? 'Request timed out' : 'Internal server error' },
      { status: isTimeout ? 504 : 500, headers: PRIVATE_BFF_JSON_HEADERS }
    )
  }
}
