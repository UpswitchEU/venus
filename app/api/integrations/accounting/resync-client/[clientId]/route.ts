import { type NextRequest, NextResponse } from 'next/server'
import { encodeTitanPathSegment, proxyAgentJsonToTitan } from '../../../../_utils/agentActionProxy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 35

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params
  if (!clientId) {
    return NextResponse.json({ success: false, message: 'Client ID is required' }, { status: 400 })
  }

  const incoming = (await request.json().catch(() => ({}))) as { force?: boolean }
  return proxyAgentJsonToTitan(
    request,
    `/integrations/accounting/resync-client/${encodeTitanPathSegment(clientId)}`,
    {
      method: 'POST',
      body: incoming?.force === true ? { force: true } : {},
      timeoutMs: 30_000,
    }
  )
}
