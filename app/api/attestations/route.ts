import { type NextRequest, NextResponse } from 'next/server'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function extractErrorMessage(data: unknown): string {
  if (
    typeof data === 'object' &&
    data &&
    'message' in data &&
    typeof data.message === 'string' &&
    data.message
  ) {
    return data.message
  }
  return 'Failed to create attestation'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const reportId = typeof body?.report_id === 'string' ? body.report_id : null
    if (!reportId) {
      return NextResponse.json(
        { success: false, message: 'report_id is required' },
        { status: 400 }
      )
    }

    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const titanApiUrl = getTitanApiUrl(request)
    const { response, json } = await fetchJsonWithTimeout(
      `${titanApiUrl}/api/v2/attestations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(body),
      },
      55_000
    )

    if (!response.ok) {
      return NextResponse.json(
        { success: false, message: extractErrorMessage(json) },
        { status: response.status }
      )
    }

    return NextResponse.json(
      { success: true, data: json },
      {
        status: 200,
        headers: { 'Cache-Control': 'private, no-store' },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create attestation'
    return NextResponse.json({ success: false, message }, { status: 500 })
  }
}
