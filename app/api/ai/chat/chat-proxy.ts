export const AI_CHAT_PROXY_TIMEOUT_MS = 60_000
export const AI_CHAT_ADD_CLIENT_PROXY_TIMEOUT_MS = 120_000

import {
  isAdvisorWorkspaceClientTurn,
  isAdvisorWorkspaceSurfaceIntent,
} from '@upswitch/ai-actions'

const MAX_CORRELATION_ID_LENGTH = 128

export function normalizeCorrelationId(value: string | null | undefined): string | null {
  const normalized = value
    ?.trim()
    .replace(/[^A-Za-z0-9_.:-]/g, '_')
    .slice(0, MAX_CORRELATION_ID_LENGTH)
  return normalized || null
}

/** Generate or capture a correlation id from the inbound request. */
export function getOrCreateCorrelationId(req: { headers: Headers }): string {
  const normalized =
    normalizeCorrelationId(req.headers.get('x-correlation-id')) ??
    normalizeCorrelationId(req.headers.get('x-request-id'))
  if (normalized) return normalized
  return `bff_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
}

export function getTitanResponseCorrelationId(
  response: Response,
  fallbackCorrelationId: string
): string {
  return normalizeCorrelationId(response.headers.get('x-correlation-id')) ?? fallbackCorrelationId
}

type ChatRole = 'assistant' | 'user'
type UnknownRecord = Record<string, unknown>

export function isTitanAiProxyTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * Fetch with timeout for AI BFF proxy routes. Clears the timer once headers
 * arrive so streaming bodies are not aborted mid-read.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number = AI_CHAT_PROXY_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

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
  proxyTimeoutMs?: number
  /** Server-side only: BFF sets X-Ai-Stream-Recovery on the Titan request. */
  streamTurnRecovery?: boolean
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

  const surfaceIntentFromBody = nonEmptyString(body.surfaceIntent)
  const assistantIntentFromBody = nonEmptyString(body.assistantIntent)
  const sessionId = nonEmptyString(body.sessionId)
  const isWorkspaceClientIntent = isAdvisorWorkspaceClientTurn({
    surfaceIntent: surfaceIntentFromBody,
    sessionId,
  })
  const resolvedSurfaceIntent =
    isWorkspaceClientIntent && isAdvisorWorkspaceSurfaceIntent(surfaceIntentFromBody)
      ? surfaceIntentFromBody
      : surfaceIntentFromBody

  const workspaceMessages: TitanChatMessage[] = isWorkspaceClientIntent
    ? [{ role: 'user', content: message }]
    : messages

  const context = {
    sessionId: sessionId ?? '',
    companyName: isWorkspaceClientIntent ? undefined : body.companyName,
    viewingCompanyName: isWorkspaceClientIntent ? undefined : body.viewingCompanyName,
    viewingClientId: isWorkspaceClientIntent ? undefined : body.viewingClientId,
    pageRoute: isWorkspaceClientIntent ? undefined : body.pageRoute,
    surfaceIntent: resolvedSurfaceIntent ?? undefined,
    assistantIntent: isWorkspaceClientIntent ? undefined : assistantIntentFromBody ?? undefined,
    industry: isWorkspaceClientIntent ? undefined : formData?.industry,
    countryCode: isWorkspaceClientIntent
      ? nonEmptyString(body.countryCode) || formData?.country_code || formData?.country
      : formData?.country_code || formData?.country,
    locale: normalizeLocale(body.locale),
    focusedField: isWorkspaceClientIntent ? undefined : fieldContext?.field,
    reportId: isWorkspaceClientIntent ? sessionId ?? '' : body.reportId || body.sessionId,
    hasRevenue: isWorkspaceClientIntent ? false : hasProvidedValue(formData?.revenue),
    hasEbitda: isWorkspaceClientIntent ? false : hasProvidedValue(formData?.ebitda),
    hasOwnerSalary: isWorkspaceClientIntent
      ? false
      : normalizations.some((item) => item.category === 'salary'),
    needsNormalization: isWorkspaceClientIntent
      ? false
      : normalizations.some((item) => item.status === 'pending'),
  }

  const payload: Record<string, unknown> = {
    messages: workspaceMessages,
    context,
    audience: resolveAudience(body.audience),
  }
  const conversationId = nonEmptyString(body.conversationId)
  if (conversationId && !isWorkspaceClientIntent) payload.conversationId = conversationId
  if (formData && !isWorkspaceClientIntent) payload.formData = formData
  if (Array.isArray(body.normalizations) && !isWorkspaceClientIntent) {
    payload.normalizations = body.normalizations
  }

  const streamTurnRecovery =
    body.stream === false && body.recoverFromStreamTurn === true

  const proxyTimeoutMs = isWorkspaceClientIntent
    ? AI_CHAT_ADD_CLIENT_PROXY_TIMEOUT_MS
    : AI_CHAT_PROXY_TIMEOUT_MS

  return {
    ok: true,
    plan: {
      useStream: body.stream !== false,
      context,
      payload,
      streamTurnRecovery,
      proxyTimeoutMs,
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

function isLocalTitanEndpoint(titanApiUrl: string): boolean {
  return /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(titanApiUrl.trim())
}

export function buildTitanNetworkErrorEnvelope({
  isTimeout,
  titanApiUrl,
}: {
  isTimeout: boolean
  titanApiUrl: string
}): Record<string, unknown> {
  if (isTimeout) {
    return {
      success: false,
      code: 'AI_BACKEND_TIMEOUT',
      error: 'AI request timed out',
      fallback: true,
    }
  }

  const local = isLocalTitanEndpoint(titanApiUrl)
  return {
    success: false,
    code: 'AI_BACKEND_UNREACHABLE',
    error: local
      ? `AI backend is not reachable at ${titanApiUrl}. Start Titan locally and make sure apps/titan-api/.env contains the required auth variables from .env.example.`
      : 'Failed to connect to AI service',
    fallback: true,
    ...(local
      ? {
          recovery: 'Run `pnpm start:dev` in apps/titan-api, then retry the assistant.',
        }
      : {}),
  }
}
