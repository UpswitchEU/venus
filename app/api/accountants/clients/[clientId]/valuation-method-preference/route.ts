import { type NextRequest, NextResponse } from 'next/server'
import { encodeTitanPathSegment, proxyAgentJsonToTitan } from '../../../../_utils/agentActionProxy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * PUT /api/accountants/clients/[clientId]/valuation-method-preference
 *
 * Conversational mirror of the manual Mercury per-client method override.
 * Body: `{ value: string | null }`; `null` clears the override.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params
  if (!clientId) {
    return NextResponse.json({ success: false, message: 'Client ID is required' }, { status: 400 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (!Object.hasOwn(body, 'value')) {
    return NextResponse.json(
      { success: false, message: 'Value is required; use null to clear the override' },
      { status: 400 }
    )
  }

  const incoming = body.value
  if (incoming !== null && typeof incoming !== 'string') {
    return NextResponse.json(
      { success: false, message: 'Value must be a valuation method key or null' },
      { status: 400 }
    )
  }

  return proxyAgentJsonToTitan(
    request,
    `/api/v2/accountants/clients/${encodeTitanPathSegment(clientId)}/valuation-method-preference`,
    {
      method: 'PUT',
      body: { value: incoming },
      timeoutMs: 20_000,
    }
  )
}
