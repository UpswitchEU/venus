type ChatRole = 'assistant' | 'user'
type UnknownRecord = Record<string, unknown>

interface TitanChatMessage {
  role: ChatRole
  content: string
}

interface NormalizationItem {
  category?: unknown
  status?: unknown
}

export interface TitanAiChatProxyPlan {
  context: Record<string, unknown>
  payload: Record<string, unknown>
  useStream: boolean
}

export type TitanAiChatProxyPlanResult =
  | { ok: true; plan: TitanAiChatProxyPlan }
  | {
      ok: false
      status: number
      body: { success: false; error: string; fallback: true }
    }

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeChatRole(value: unknown): ChatRole | null {
  return value === 'user' || value === 'assistant' ? value : null
}

function normalizeHistory(history: unknown): TitanChatMessage[] {
  if (!Array.isArray(history)) return []
  return history.flatMap((item) => {
    if (!isRecord(item)) return []
    const role = normalizeChatRole(item.role)
    const content = nonEmptyString(item.content)
    return role && content ? [{ role, content }] : []
  })
}

function normalizeLocale(value: unknown): string | undefined {
  const locale = nonEmptyString(value)
  return locale ? locale.slice(0, 8) : undefined
}

function resolveAudience(raw: unknown): 'advisor' | 'owner' {
  return raw === 'advisor' || raw === 'owner' ? raw : 'owner'
}

function hasProvidedValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim().length > 0
  return Boolean(value)
}

export function buildTitanAiChatProxyPlan(body: unknown): TitanAiChatProxyPlanResult {
  if (!isRecord(body)) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: 'Invalid AI chat request body',
        fallback: true,
      },
    }
  }

  const message = nonEmptyString(body.message)
  if (!message) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: 'message is required',
        fallback: true,
      },
    }
  }

  const formData = isRecord(body.formData) ? body.formData : undefined
  const fieldContext = isRecord(body.fieldContext) ? body.fieldContext : undefined
  const normalizations: NormalizationItem[] = Array.isArray(body.normalizations)
    ? (body.normalizations as NormalizationItem[])
    : []

  const messages: TitanChatMessage[] = [
    ...normalizeHistory(body.history),
    { role: 'user', content: message },
  ]

  const context = {
    sessionId: nonEmptyString(body.sessionId) ?? '',
    companyName: body.companyName,
    industry: formData?.industry,
    countryCode: formData?.country_code || formData?.country,
    locale: normalizeLocale(body.locale),
    focusedField: fieldContext?.field,
    reportId: body.reportId || body.sessionId,
    hasRevenue: hasProvidedValue(formData?.revenue),
    hasEbitda: hasProvidedValue(formData?.ebitda),
    hasOwnerSalary: normalizations.some((item) => item.category === 'salary'),
    needsNormalization: normalizations.some((item) => item.status === 'pending'),
  }

  const payload: Record<string, unknown> = {
    messages,
    context,
    audience: resolveAudience(body.audience),
  }
  const conversationId = nonEmptyString(body.conversationId)
  if (conversationId) payload.conversationId = conversationId
  if (formData) payload.formData = formData
  if (Array.isArray(body.normalizations)) payload.normalizations = body.normalizations

  return {
    ok: true,
    plan: {
      useStream: body.stream !== false,
      context,
      payload,
    },
  }
}

function getStringField(obj: Record<string, unknown>, key: string): string | null {
  const raw = obj[key]
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null
}

export function buildTitanErrorEnvelope(errorData: unknown): Record<string, unknown> {
  const errorObject = isRecord(errorData) ? errorData : {}
  const errorMessage =
    getStringField(errorObject, 'message') ||
    getStringField(errorObject, 'error') ||
    'AI service unavailable'

  return {
    ...errorObject,
    success: false,
    error: errorMessage,
    fallback: true,
  }
}
