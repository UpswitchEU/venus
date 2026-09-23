/**
 * Terminal refusals from Titan's `POST /api/v2/auth/exchange-client-context`.
 *
 * Since titan #231 (2026-09-23) the exchange never mints or switches a
 * session: a deep link is context, not a credential. It refuses with
 *   - 403 `CLIENT_CONTEXT_IDENTITY_MISMATCH` when the browser is signed in as
 *     a different user than the advisor the link was issued to, and
 *   - 401 `Authentication required` when the browser has no session.
 * Neither is transient, so retrying is pointless, and the generic "Unable to
 * load client context" copy hid what the advisor must do next.
 *
 * Both messages contain "valuation link" so AuthGate treats them as
 * actionable (error card with Log in / Go back), not as a silent eject.
 */

export class ClientContextExchangeRefusal extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ClientContextExchangeRefusal'
    this.status = status
  }
}

export const IDENTITY_MISMATCH_MESSAGE =
  'This valuation link was opened for a different account than the one signed in. Log in with the right account and reopen the client from Upswitch.'

export const NOT_SIGNED_IN_MESSAGE =
  'You are not signed in. Log in and reopen the valuation link from the client page.'

type UnknownRecord = Record<string, unknown>

function field(body: unknown, key: string): string | undefined {
  if (!body || typeof body !== 'object') return undefined
  const value = (body as UnknownRecord)[key]
  return typeof value === 'string' ? value : undefined
}

/** Returns a terminal refusal for a 401/403, or null for anything retryable. */
export function toClientContextExchangeRefusal(
  status: number,
  body: unknown
): ClientContextExchangeRefusal | null {
  if (status !== 401 && status !== 403) return null

  const code = field(body, 'code')
  const message = field(body, 'message') ?? ''

  if (
    status === 403 &&
    (code === 'CLIENT_CONTEXT_IDENTITY_MISMATCH' || message.includes('different account'))
  ) {
    return new ClientContextExchangeRefusal(status, IDENTITY_MISMATCH_MESSAGE)
  }

  if (status === 401 && message === 'Authentication required') {
    return new ClientContextExchangeRefusal(status, NOT_SIGNED_IN_MESSAGE)
  }

  return new ClientContextExchangeRefusal(
    status,
    message || 'Client context token expired or invalid. Please try creating a new valuation.'
  )
}
