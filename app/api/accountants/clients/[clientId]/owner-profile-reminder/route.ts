import { type NextRequest, NextResponse } from 'next/server'
import { encodeTitanPathSegment, proxyAgentJsonToTitan } from '../../../../_utils/agentActionProxy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 90

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params
  if (!clientId) {
    return NextResponse.json({ success: false, message: 'Client ID is required' }, { status: 400 })
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const customMessage =
    typeof body.custom_message === 'string' && body.custom_message.trim()
      ? body.custom_message.trim()
      : undefined

  if (customMessage && customMessage.length > 1000) {
    return NextResponse.json(
      { success: false, message: 'Custom message must be 1000 characters or fewer' },
      { status: 400 }
    )
  }

  return proxyAgentJsonToTitan(
    request,
    `/api/v2/accountants/clients/${encodeTitanPathSegment(clientId)}/owner-profile-reminder`,
    {
      method: 'POST',
      body: customMessage ? { custom_message: customMessage } : {},
      timeoutMs: 72_000,
    }
  )
}
