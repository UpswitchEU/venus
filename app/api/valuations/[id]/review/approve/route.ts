import { encodeTitanPathSegment } from '../../../../_utils/agentActionProxy'
import { proxyTitanReviewJsonRoute } from '../../../../_utils/proxyTitanReviewJson'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 35

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!id) {
    return NextResponse.json(
      { success: false, message: 'Valuation ID is required' },
      { status: 400 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const notes = typeof body?.notes === 'string' ? body.notes.slice(0, 4000) : undefined
  const encodedId = encodeTitanPathSegment(id)
  const titanApiUrl = getTitanApiUrl(request)

  return proxyTitanReviewJsonRoute(
    request,
    `${titanApiUrl}/api/v2/valuations/${encodedId}/approve`,
    {
      method: 'POST',
      body: JSON.stringify({ notes }),
    },
    { defaultErrorMessage: 'Failed to approve valuation' }
  )
}
