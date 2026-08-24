import { type NextRequest, NextResponse } from 'next/server'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { encodeTitanPathSegment } from '../../../../_utils/agentActionProxy'
import { proxyTitanReviewJsonRoute } from '../../../../_utils/proxyTitanReviewJson'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 35

const PREFLIGHT_CHECKS = [
  'scope',
  'identity',
  'closed_periods',
  'normalizations',
  'business_type',
  'method',
  'benchmark',
  'balance_sheet',
  'net_debt',
] as const

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) {
    return NextResponse.json(
      { success: false, message: 'Valuation ID is required' },
      { status: 400 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const source =
    body?.reviewChecklist && typeof body.reviewChecklist === 'object'
      ? (body.reviewChecklist as Record<string, unknown>)
      : {}
  const reviewChecklist = Object.fromEntries(
    PREFLIGHT_CHECKS.map((key) => [key, source[key] === true])
  )
  const encodedId = encodeTitanPathSegment(id)
  const titanApiUrl = getTitanApiUrl(request)

  return proxyTitanReviewJsonRoute(
    request,
    `${titanApiUrl}/api/v2/valuations/${encodedId}/approval-candidate`,
    {
      method: 'POST',
      body: JSON.stringify({ reviewChecklist }),
    },
    { defaultErrorMessage: 'Failed to prepare the approval PDF' }
  )
}
