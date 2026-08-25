import { type NextRequest, NextResponse } from 'next/server'
import { encodeTitanPathSegment, proxyAgentJsonToTitan } from '../../../../_utils/agentActionProxy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params
  if (!clientId) {
    return NextResponse.json({ success: false, message: 'Client ID is required' }, { status: 400 })
  }
  return proxyAgentJsonToTitan(
    request,
    `/valuations/clients/${encodeTitanPathSegment(clientId)}/readiness`,
    { method: 'GET', timeoutMs: 20_000 }
  )
}
