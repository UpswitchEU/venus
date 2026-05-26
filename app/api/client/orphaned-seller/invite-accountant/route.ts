import { type NextRequest, NextResponse } from 'next/server'
import { proxyAgentJsonToTitan } from '../../../_utils/agentActionProxy'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 90

const MAX_CUSTOM_MESSAGE_LENGTH = 500
const ALLOWED_SURFACES = new Set(['result', 'report', 'card'])
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function optionalTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function normalizeBody(
  body: unknown
): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: 'Invalid JSON body' }
  }

  const record = body as Record<string, unknown>
  const accountantEmail = optionalTrimmedString(record.accountant_email)?.toLowerCase()
  if (!accountantEmail) return { ok: false, message: 'Accountant email is required' }
  if (!EMAIL_REGEX.test(accountantEmail)) {
    return { ok: false, message: 'Enter a valid accountant email address' }
  }

  const customMessage = optionalTrimmedString(record.custom_message)
  if (customMessage && customMessage.length > MAX_CUSTOM_MESSAGE_LENGTH) {
    return {
      ok: false,
      message: `Custom message must be ${MAX_CUSTOM_MESSAGE_LENGTH} characters or fewer`,
    }
  }

  const surface = optionalTrimmedString(record.surface)
  const reportId = optionalTrimmedString(record.report_id)
  const businessName = optionalTrimmedString(record.business_name)

  return {
    ok: true,
    value: {
      accountant_email: accountantEmail,
      surface: surface && ALLOWED_SURFACES.has(surface) ? surface : 'card',
      ...(customMessage ? { custom_message: customMessage } : {}),
      ...(reportId ? { report_id: reportId } : {}),
      ...(businessName ? { business_name: businessName } : {}),
    },
  }
}

export async function POST(request: NextRequest) {
  const body = normalizeBody(await request.json().catch(() => null))
  if (!body.ok) {
    return NextResponse.json({ success: false, message: body.message }, { status: 400 })
  }

  return proxyAgentJsonToTitan(request, '/api/v2/client/orphaned-seller/invite-accountant', {
    method: 'POST',
    body: body.value,
    timeoutMs: 60_000,
  })
}
