import { API_URL } from './config'

type DelegatedClientUser = {
  id: string
  email: string
  full_name: string
  avatar_url: string | null
} | null
type NormalizedClientUser = DelegatedClientUser | 'invalid'

export type DelegatedClientContextResponse = {
  accountantUser: {
    id: string
    email: string
    full_name: string
  }
  clientUser: DelegatedClientUser
  relationship: {
    id: string
    customer_name: string
  }
}

type FetchDelegatedClientContextInput = {
  clientId: string
  apiUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
}

const DEFAULT_TIMEOUT_MS = 8000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getErrorMessage(value: unknown): string | null {
  if (!isRecord(value)) return null
  const message = value.message
  return typeof message === 'string' && message.trim() ? message : null
}

function readRequiredString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function readOptionalString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : ''
}

function normalizeClientUser(value: unknown): NormalizedClientUser {
  if (value == null) return null
  if (!isRecord(value)) return 'invalid'

  const id = readRequiredString(value, 'id')
  const email = readRequiredString(value, 'email')
  const fullName = readRequiredString(value, 'full_name')

  if (!id || !email || !fullName) return 'invalid'

  return {
    id,
    email,
    full_name: fullName,
    avatar_url: typeof value.avatar_url === 'string' ? value.avatar_url : null,
  }
}

function normalizeDelegatedClientContextResponse(
  value: unknown
): DelegatedClientContextResponse | null {
  if (!isRecord(value)) return null
  if (!isRecord(value.accountantUser) || !isRecord(value.relationship)) return null

  const accountantId = readRequiredString(value.accountantUser, 'id')
  const accountantEmail = readRequiredString(value.accountantUser, 'email')
  const accountantFullName = readRequiredString(value.accountantUser, 'full_name')
  const relationshipId = readRequiredString(value.relationship, 'id')

  if (!accountantId || !accountantEmail || !accountantFullName || !relationshipId) {
    return null
  }

  const clientUser = normalizeClientUser(value.clientUser)
  if (clientUser === 'invalid') return null

  return {
    accountantUser: {
      id: accountantId,
      email: accountantEmail,
      full_name: accountantFullName,
    },
    clientUser,
    relationship: {
      id: relationshipId,
      customer_name: readOptionalString(value.relationship, 'customer_name'),
    },
  }
}

export function isDelegatedClientContextResponse(
  value: unknown
): value is DelegatedClientContextResponse {
  return normalizeDelegatedClientContextResponse(value) !== null
}

export async function fetchDelegatedClientContext({
  apiUrl = API_URL,
  clearTimeoutFn = clearTimeout,
  clientId,
  fetchImpl = fetch,
  setTimeoutFn = setTimeout,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: FetchDelegatedClientContextInput): Promise<DelegatedClientContextResponse> {
  const controller = new AbortController()
  const timeout = setTimeoutFn(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(`${apiUrl}/api/v2/auth/get-client-context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ clientId }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        getErrorMessage(errorData) || `Failed to fetch client context (${response.status})`
      )
    }

    const context = normalizeDelegatedClientContextResponse(await response.json())
    if (!context) {
      throw new Error('Invalid client context structure received')
    }

    return context
  } finally {
    clearTimeoutFn(timeout)
  }
}
