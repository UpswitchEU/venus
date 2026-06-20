import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildClientTokenIdentity,
  clearLastClientTokenExchangeFailure,
  getLastClientTokenExchangeFailure,
  resolveClientTokenIdentity,
} from './AuthClientContextExchange'

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  )
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => normalizedHeaders[name.toLowerCase()] ?? null,
    },
    json: async () => body,
  } as unknown as Response
}

function makeFetch(response: Response): typeof fetch {
  return vi.fn(async () => response) as unknown as typeof fetch
}

describe('AuthClientContextExchange', () => {
  beforeEach(() => {
    clearLastClientTokenExchangeFailure()
    vi.clearAllMocks()
  })

  it('builds accountant-owned identity when the client invitation is still pending', () => {
    expect(
      buildClientTokenIdentity({
        accountantUser: {
          id: 'acct_1',
          email: 'advisor@example.com',
          first_name: 'Ada',
          last_name: 'Advisor',
        },
        clientUser: null,
        relationship: {
          id: 'rel_1',
          customer_name: 'Pending Client BV',
        },
      })
    ).toMatchObject({
      type: 'accountant_for_client',
      userId: 'acct_1',
      email: 'advisor@example.com',
      firstName: 'Ada',
      lastName: 'Advisor',
      clientContext: {
        clientUserId: null,
        clientEmail: null,
        clientCompanyName: 'Pending Client BV',
        accountantUserId: 'acct_1',
        accountantEmail: 'advisor@example.com',
        relationshipId: 'rel_1',
      },
    })
  })

  it('captures Titan correlation metadata when token exchange is rejected', async () => {
    const fetchImpl = makeFetch(
      jsonResponse(
        403,
        { message: 'Client context token expired' },
        { 'x-correlation-id': 'corr_123' }
      )
    )

    const result = await resolveClientTokenIdentity({
      apiUrl: 'https://api.test',
      clientToken: 'token_123',
      fetchImpl,
      now: () => 1000,
    })

    expect(result).toMatchObject({
      success: false,
      error: 'Client context token expired',
    })
    expect(getLastClientTokenExchangeFailure()).toEqual({
      status: 403,
      correlationId: 'corr_123',
      reason: 'Client context token expired',
      at: 1000,
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/v2/auth/exchange-client-context',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ token: 'token_123' }),
      })
    )
  })

  it('rejects successful Titan responses that lack a usable accountant relationship', async () => {
    const result = await resolveClientTokenIdentity({
      apiUrl: 'https://api.test',
      clientToken: 'token_123',
      fetchImpl: makeFetch(
        jsonResponse(
          200,
          {
            accountantUser: { id: 'acct_1' },
            relationship: {},
          },
          { 'x-correlation-id': 'corr_bad_shape' }
        )
      ),
      now: () => 500,
    })

    expect(result).toMatchObject({
      success: false,
      error: 'Invalid client context structure',
    })
    expect(getLastClientTokenExchangeFailure()).toEqual({
      status: 200,
      correlationId: 'corr_bad_shape',
      reason: 'Invalid client context structure',
      at: 500,
    })
  })

  it('clears stale failure metadata after a successful exchange', async () => {
    await resolveClientTokenIdentity({
      apiUrl: 'https://api.test',
      clientToken: 'expired',
      fetchImpl: makeFetch(jsonResponse(401, { message: 'Expired' })),
      now: () => 1,
    })
    expect(getLastClientTokenExchangeFailure()).not.toBeNull()

    const result = await resolveClientTokenIdentity({
      apiUrl: 'https://api.test',
      clientToken: 'valid',
      fetchImpl: makeFetch(
        jsonResponse(200, {
          accountantUser: { id: 'acct_2', email: 'advisor@example.com' },
          clientUser: { id: 'client_2', email: 'client@example.com', company_name: 'Client BV' },
          relationship: { id: 'rel_2', customer_name: 'Fallback BV' },
        })
      ),
      now: () => 2,
    })

    expect(result).toMatchObject({
      success: true,
      source: 'client_token',
      data: {
        userId: 'client_2',
        clientContext: {
          clientCompanyName: 'Client BV',
          relationshipId: 'rel_2',
        },
      },
    })
    expect(getLastClientTokenExchangeFailure()).toBeNull()
  })

  it('captures network failures without manufacturing a Titan correlation id', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }) as unknown as typeof fetch

    const result = await resolveClientTokenIdentity({
      apiUrl: 'https://api.test',
      clientToken: 'token_123',
      fetchImpl,
      now: () => 42,
    })

    expect(result).toMatchObject({
      success: false,
      error: 'Failed to fetch',
    })
    expect(getLastClientTokenExchangeFailure()).toEqual({
      status: 0,
      correlationId: null,
      reason: 'Failed to fetch',
      at: 42,
    })
  })
})
