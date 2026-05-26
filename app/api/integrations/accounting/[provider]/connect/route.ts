import { type NextRequest, NextResponse } from 'next/server'
import { encodeTitanPathSegment, proxyAgentJsonToTitan } from '../../../../_utils/agentActionProxy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 35

const SECURE_CREDENTIAL_PROVIDERS = new Set(['yuki', 'bizzcontrol', 'octopus'])

function normalizeCredentialBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const record = { ...(body as Record<string, unknown>) }
  if (typeof record.apiKey === 'string' && typeof record.api_key !== 'string') {
    record.api_key = record.apiKey
    delete record.apiKey
  }
  if (typeof record.administrationId === 'string' && typeof record.administration_id !== 'string') {
    record.administration_id = record.administrationId
    delete record.administrationId
  }
  if (typeof record.domainId === 'string' && typeof record.domain_id !== 'string') {
    record.domain_id = record.domainId
    delete record.domainId
  }
  if (typeof record.apiBaseUrl === 'string' && typeof record.api_base_url !== 'string') {
    record.api_base_url = record.apiBaseUrl
    delete record.apiBaseUrl
  }
  return record
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  const normalizedProvider = provider.trim().toLowerCase()
  if (!SECURE_CREDENTIAL_PROVIDERS.has(normalizedProvider)) {
    return NextResponse.json(
      { success: false, message: 'Unsupported credential provider' },
      { status: 400 }
    )
  }

  const body = normalizeCredentialBody(await request.json().catch(() => null))
  if (!body) {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 })
  }

  return proxyAgentJsonToTitan(
    request,
    `/integrations/accounting/${encodeTitanPathSegment(normalizedProvider)}/connect`,
    {
      method: 'POST',
      body,
      timeoutMs: 30_000,
    }
  )
}
