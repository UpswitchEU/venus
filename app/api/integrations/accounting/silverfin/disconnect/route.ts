import { NextRequest, NextResponse } from 'next/server'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function DELETE(request: NextRequest) {
  try {
    const cookieHeader = request.headers.get('cookie') || ''
    const titanApiUrl = getTitanApiUrl(request)

    const response = await fetchWithTimeout(
      `${titanApiUrl}/integrations/accounting/silverfin`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
      },
      15_000
    )

    if (!response.ok && response.status !== 204) {
      const data = await response.json().catch(() => ({}))
      return NextResponse.json(
        {
          message:
            (typeof (data as { message?: string }).message === 'string' &&
              (data as { message: string }).message) ||
            'Failed to disconnect Silverfin',
        },
        { status: response.status }
      )
    }

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('[Venus Silverfin disconnect route]', error)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}
