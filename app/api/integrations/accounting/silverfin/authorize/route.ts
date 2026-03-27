import { NextRequest, NextResponse } from 'next/server'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie') || ''
    const redirectUri = request.nextUrl.searchParams.get('redirect_uri') || ''
    const titanApiUrl = getTitanApiUrl(request)
    const targetUrl = `${titanApiUrl}/integrations/accounting/silverfin/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`

    const response = await fetchWithTimeout(
      targetUrl,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
      },
      15_000,
    )

    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      return NextResponse.json(
        {
          message:
            (typeof data?.message === 'string' && data.message) ||
            'Failed to get Silverfin authorize URL',
        },
        { status: response.status },
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[Venus Silverfin authorize route]', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
