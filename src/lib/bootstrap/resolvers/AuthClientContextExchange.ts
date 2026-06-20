import type { ClientContext, IdentityState, ResolverResult } from '../types'
import { DEFAULT_IDENTITY } from '../types'

type UnknownRecord = Record<string, unknown>

type ClientTokenExchangeParams = {
  apiUrl: string
  clientToken: string
  fetchImpl?: typeof fetch
  now?: () => number
}

/**
 * Captures the most recent /exchange-client-context failure so the AuthGate
 * error overlay can render the Titan correlation id.
 */
export interface ClientTokenExchangeFailure {
  /** HTTP status from Titan (0 for network error). */
  status: number
  /** Titan-issued correlation id (response header). */
  correlationId: string | null
  /** Human-readable reason (Titan body or thrown error). */
  reason: string
  /** Performance.now() when captured. */
  at: number
}

let lastClientTokenExchangeFailure: ClientTokenExchangeFailure | null = null

export function getLastClientTokenExchangeFailure(): ClientTokenExchangeFailure | null {
  return lastClientTokenExchangeFailure
}

export function clearLastClientTokenExchangeFailure(): void {
  lastClientTokenExchangeFailure = null
}

function fallbackIdentity(): IdentityState {
  return {
    ...DEFAULT_IDENTITY,
  }
}

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function getRecordValue(value: unknown, key: string): unknown {
  return isUnknownRecord(value) ? value[key] : undefined
}

function getRecord(value: unknown, key: string): UnknownRecord | null {
  const field = getRecordValue(value, key)
  return isUnknownRecord(field) ? field : null
}

function getString(value: unknown, key: string): string | undefined {
  const field = getRecordValue(value, key)
  return typeof field === 'string' ? field : undefined
}

function captureExchangeFailure({
  correlationId,
  now,
  reason,
  status,
}: {
  correlationId: string | null
  now: () => number
  reason: string
  status: number
}): void {
  lastClientTokenExchangeFailure = {
    status,
    correlationId,
    reason,
    at: now(),
  }
}

function buildFailureResult({
  durationMs,
  error,
}: {
  durationMs: number
  error: string
}): ResolverResult<IdentityState> {
  return {
    success: false,
    data: fallbackIdentity(),
    error,
    durationMs,
  }
}

export function buildClientTokenIdentity(contextData: unknown): IdentityState | null {
  const accountantUser = getRecord(contextData, 'accountantUser')
  const relationship = getRecord(contextData, 'relationship')
  if (!accountantUser || !relationship) return null

  const accountantUserId = getString(accountantUser, 'id')
  const relationshipId = getString(relationship, 'id')
  if (!accountantUserId || !relationshipId) return null

  const clientUser = getRecord(contextData, 'clientUser')
  const clientUserId = clientUser ? getString(clientUser, 'id') || null : null

  const clientContext: ClientContext = {
    clientUserId,
    clientEmail: clientUser ? (getString(clientUser, 'email') ?? null) : null,
    clientCompanyName:
      (clientUser ? getString(clientUser, 'company_name') : undefined) ??
      getString(relationship, 'customer_name'),
    accountantUserId,
    accountantEmail: getString(accountantUser, 'email'),
    relationshipId,
    permissions: {
      canCreateValuations: true,
      canViewReports: true,
      canEditReports: true,
    },
  }

  return {
    type: 'accountant_for_client',
    userId: clientUserId ?? accountantUserId,
    clientContext,
    email: getString(accountantUser, 'email'),
    firstName: getString(accountantUser, 'first_name'),
    lastName: getString(accountantUser, 'last_name'),
  }
}

export async function resolveClientTokenIdentity({
  apiUrl,
  clientToken,
  fetchImpl = fetch,
  now = performance.now.bind(performance),
}: ClientTokenExchangeParams): Promise<ResolverResult<IdentityState>> {
  const startTime = now()

  try {
    const response = await fetchImpl(`${apiUrl}/api/v2/auth/exchange-client-context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ token: clientToken }),
    })

    const correlationId = response.headers.get('x-correlation-id')

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const reason = getString(errorData, 'message') || `Token exchange failed (${response.status})`
      captureExchangeFailure({
        status: response.status,
        correlationId,
        reason,
        now,
      })
      return buildFailureResult({
        error: reason,
        durationMs: now() - startTime,
      })
    }

    const identity = buildClientTokenIdentity(await response.json())

    if (!identity) {
      const reason = 'Invalid client context structure'
      captureExchangeFailure({
        status: response.status,
        correlationId,
        reason,
        now,
      })
      return buildFailureResult({
        error: reason,
        durationMs: now() - startTime,
      })
    }

    lastClientTokenExchangeFailure = null

    return {
      success: true,
      data: identity,
      source: 'client_token',
      durationMs: now() - startTime,
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Network error'
    captureExchangeFailure({
      status: 0,
      correlationId: null,
      reason,
      now,
    })
    return buildFailureResult({
      error: reason,
      durationMs: now() - startTime,
    })
  }
}
