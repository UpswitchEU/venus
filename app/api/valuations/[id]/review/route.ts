import { encodeTitanPathSegment } from '../../../_utils/agentActionProxy'
import { proxyTitanReviewJsonRoute } from '../../../_utils/proxyTitanReviewJson'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 35

export async function GET(
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

  const encodedId = encodeTitanPathSegment(id)
  const titanApiUrl = getTitanApiUrl(request)

  return proxyTitanReviewJsonRoute(
    request,
    `${titanApiUrl}/api/v2/valuations/${encodedId}/review`,
    { method: 'GET' },
    { defaultErrorMessage: 'Failed to load review state' }
  )
}
