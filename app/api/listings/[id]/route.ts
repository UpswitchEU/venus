import { type NextRequest, NextResponse } from 'next/server'
import { encodeTitanPathSegment, proxyAgentJsonToTitan } from '../../_utils/agentActionProxy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ success: false, message: 'Listing ID is required' }, { status: 400 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const visibility = body.visibility
  if (visibility !== 'public' && visibility !== 'private') {
    return NextResponse.json(
      { success: false, message: "Visibility must be 'public' or 'private'" },
      { status: 400 }
    )
  }

  return proxyAgentJsonToTitan(request, `/api/v2/listings/${encodeTitanPathSegment(id)}`, {
    method: 'PATCH',
    body: { visibility },
  })
}
