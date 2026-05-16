import { NextRequest, NextResponse } from 'next/server'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie') || ''
    const body = await request.json()
    const titanApiUrl = getTitanApiUrl(request)

    const response = await fetchWithTimeout(
      `${titanApiUrl}/integrations/accounting/silverfin/callback`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        body: JSON.stringify(body),
      },
      15_000
    )

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            (typeof data?.message === 'string' && data.message) || 'Failed to connect Silverfin',
        },
        { status: response.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[Venus Silverfin callback route]', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
