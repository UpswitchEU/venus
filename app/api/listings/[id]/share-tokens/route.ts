import { type NextRequest, NextResponse } from 'next/server'
import { encodeTitanPathSegment, proxyAgentJsonToTitan } from '../../../_utils/agentActionProxy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const MIN_EXPIRES_IN_DAYS = 1
const MAX_EXPIRES_IN_DAYS = 90
const MIN_MAX_USES = 1
const MAX_MAX_USES = 100
const MAX_LABEL_LENGTH = 80

function pickNumber(body: Record<string, unknown>, camel: string, snake: string) {
  const value = body[camel] ?? body[snake]
  if (value == null) return null
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : Number.NaN
}

function normalizeShareTokenBody(
  body: unknown
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'Invalid JSON body' }
  }
  const record = body as Record<string, unknown>
  const expiresInDays = pickNumber(record, 'expiresInDays', 'expires_in_days')
  if (
    expiresInDays !== null &&
    (!Number.isInteger(expiresInDays) ||
      expiresInDays < MIN_EXPIRES_IN_DAYS ||
      expiresInDays > MAX_EXPIRES_IN_DAYS)
  ) {
    return {
      ok: false,
      message: `expiresInDays must be an integer between ${MIN_EXPIRES_IN_DAYS} and ${MAX_EXPIRES_IN_DAYS}`,
    }
  }

  const maxUses = pickNumber(record, 'maxUses', 'max_uses')
  if (
    maxUses !== null &&
    (!Number.isInteger(maxUses) || maxUses < MIN_MAX_USES || maxUses > MAX_MAX_USES)
  ) {
    return {
      ok: false,
      message: `maxUses must be an integer between ${MIN_MAX_USES} and ${MAX_MAX_USES}`,
    }
  }

  const normalized: Record<string, unknown> = {}
  if (expiresInDays !== null) normalized.expiresInDays = expiresInDays
  if (maxUses !== null) normalized.maxUses = maxUses

  const label = record.label
  if (label != null) {
    if (typeof label !== 'string') return { ok: false, message: 'label must be a string' }
    const trimmed = label.trim()
    if (trimmed.length > MAX_LABEL_LENGTH) {
      return {
        ok: false,
        message: `label must be ${MAX_LABEL_LENGTH} characters or fewer`,
      }
    }
    if (trimmed.length > 0) normalized.label = trimmed
  }

  return { ok: true, value: normalized }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id) {
    return NextResponse.json({ success: false, message: 'Listing ID is required' }, { status: 400 })
  }

  const body = normalizeShareTokenBody(await request.json().catch(() => null))
  if (!body.ok) {
    return NextResponse.json({ success: false, message: body.message }, { status: 400 })
  }

  return proxyAgentJsonToTitan(
    request,
    `/api/v2/listings/${encodeTitanPathSegment(id)}/share-tokens`,
    {
      method: 'POST',
      body: body.value,
      timeoutMs: 10_000,
      successStatus: 201,
    }
  )
}
