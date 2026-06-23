import { API_URL } from './config'

type DelegatedClientUser = {
  id: string
  email: string
  full_name: string
  avatar_url?: string | null
} | null

export type DelegatedClientContextResponse = {
  accountantUser: {
    id: string
    email: string
    full_name: string
  }
  clientUser?: DelegatedClientUser
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

export function isDelegatedClientContextResponse(
  value: unknown
): value is DelegatedClientContextResponse {
  if (!isRecord(value)) return false
  return isRecord(value.accountantUser) && isRecord(value.relationship)
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

    const context = await response.json()
    if (!isDelegatedClientContextResponse(context)) {
      throw new Error('Invalid client context structure received')
    }

    return context
  } finally {
    clearTimeoutFn(timeout)
  }
}
