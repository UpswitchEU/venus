import { type NextRequest, NextResponse } from 'next/server'
import { encodeTitanPathSegment, proxyAgentJsonToTitan } from '../../../../_utils/agentActionProxy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; tokenId: string }> }
) {
  const { id, tokenId } = await params
  if (!id || !tokenId) {
    return NextResponse.json(
      { success: false, message: 'Listing ID and token ID are required' },
      { status: 400 }
    )
  }

  return proxyAgentJsonToTitan(
    request,
    `/api/v2/listings/${encodeTitanPathSegment(id)}/share-tokens/${encodeTitanPathSegment(
      tokenId
    )}`,
    {
      method: 'DELETE',
      body: {},
      timeoutMs: 10_000,
    }
  )
}
