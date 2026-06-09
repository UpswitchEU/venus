import { encodeTitanPathSegment } from '../../../../_utils/agentActionProxy'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 15

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json(
        { success: false, message: 'Valuation ID is required' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const notes =
      typeof body?.notes === 'string' ? body.notes.slice(0, 4000) : undefined
    const encodedId = encodeTitanPathSegment(id)
    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const titanApiUrl = getTitanApiUrl()
    const { response, json } = await fetchJsonWithTimeout(
      `${titanApiUrl}/api/v2/valuations/${encodedId}/approve`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ notes }),
      },
      10_000
    )

    if (!response.ok) {
      const message =
        typeof json === 'object' &&
        json &&
        'message' in json &&
        typeof json.message === 'string'
          ? json.message
          : 'Failed to approve valuation'
      return NextResponse.json({ success: false, message }, { status: response.status })
    }

    return NextResponse.json({ success: true, data: json })
  } catch (error) {
    const isTimeout = error instanceof Error && error.message.includes('timeout')
    return NextResponse.json(
      {
        success: false,
        message: isTimeout ? 'Request timed out' : 'An unexpected error occurred',
      },
      { status: isTimeout ? 504 : 500 }
    )
  }
}
