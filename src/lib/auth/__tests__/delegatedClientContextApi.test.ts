import { describe, expect, it, vi } from 'vitest'
import {
  fetchDelegatedClientContext,
  isDelegatedClientContextResponse,
} from '../delegatedClientContextApi'

const timeoutHandle = 42 as unknown as ReturnType<typeof setTimeout>

function makeTimerFns() {
  let scheduledHandler: Parameters<typeof setTimeout>[0] | null = null
  const setTimeoutFn = vi.fn((handler: Parameters<typeof setTimeout>[0]) => {
    scheduledHandler = handler
    return timeoutHandle
  }) as unknown as typeof setTimeout
  const clearTimeoutFn = vi.fn() as unknown as typeof clearTimeout

  return {
    clearTimeoutFn,
    fireTimeout: () => {
      if (typeof scheduledHandler === 'function') {
        scheduledHandler()
      }
    },
    setTimeoutFn,
  }
}

function validContext() {
  return {
    accountantUser: {
      id: 'acc_1',
      email: 'advisor@example.com',
      full_name: 'Advisor',
    },
    clientUser: null,
    relationship: {
      id: 'rel_1',
      customer_name: 'Client BV',
    },
  }
}

describe('delegatedClientContextApi', () => {
  it('fetches and validates delegated client context', async () => {
    const timers = makeTimerFns()
    const fetchImpl = vi.fn(async () => Response.json(validContext())) as unknown as typeof fetch

    const context = await fetchDelegatedClientContext({
      apiUrl: 'https://api.test',
      clearTimeoutFn: timers.clearTimeoutFn,
      clientId: 'rel_1',
      fetchImpl,
      setTimeoutFn: timers.setTimeoutFn,
    })

    expect(context).toEqual(validContext())
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.test/api/v2/auth/get-client-context',
      expect.objectContaining({
        body: JSON.stringify({ clientId: 'rel_1' }),
        credentials: 'include',
        method: 'POST',
      })
    )
    expect(timers.clearTimeoutFn).toHaveBeenCalledWith(timeoutHandle)
  })

  it('clears the timeout when the network rejects before the abort fires', async () => {
    const timers = makeTimerFns()
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('network down')
    }) as unknown as typeof fetch

    await expect(
      fetchDelegatedClientContext({
        clearTimeoutFn: timers.clearTimeoutFn,
        clientId: 'rel_1',
        fetchImpl,
        setTimeoutFn: timers.setTimeoutFn,
      })
    ).rejects.toThrow('network down')

    expect(timers.clearTimeoutFn).toHaveBeenCalledWith(timeoutHandle)
  })

  it('clears the timeout when Titan returns an error response', async () => {
    const timers = makeTimerFns()
    const fetchImpl = vi.fn(async () =>
      Response.json({ message: 'relationship unavailable' }, { status: 403 })
    ) as unknown as typeof fetch

    await expect(
      fetchDelegatedClientContext({
        clearTimeoutFn: timers.clearTimeoutFn,
        clientId: 'rel_1',
        fetchImpl,
        setTimeoutFn: timers.setTimeoutFn,
      })
    ).rejects.toThrow('relationship unavailable')

    expect(timers.clearTimeoutFn).toHaveBeenCalledWith(timeoutHandle)
  })

  it('aborts the request through the scheduled timeout signal', async () => {
    const timers = makeTimerFns()
    let capturedSignal: AbortSignal | null = null
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>(() => {
          capturedSignal = init?.signal instanceof AbortSignal ? init.signal : null
        })
    ) as unknown as typeof fetch

    void fetchDelegatedClientContext({
      clearTimeoutFn: timers.clearTimeoutFn,
      clientId: 'rel_1',
      fetchImpl,
      setTimeoutFn: timers.setTimeoutFn,
      timeoutMs: 1234,
    }).catch(() => undefined)

    expect(timers.setTimeoutFn).toHaveBeenCalledWith(expect.any(Function), 1234)
    timers.fireTimeout()
    expect(capturedSignal?.aborted).toBe(true)
  })

  it('rejects successful responses with unusable context shape', async () => {
    expect(isDelegatedClientContextResponse({ accountantUser: {}, relationship: {} })).toBe(true)
    expect(isDelegatedClientContextResponse({ accountantUser: {} })).toBe(false)

    await expect(
      fetchDelegatedClientContext({
        clientId: 'rel_1',
        fetchImpl: vi.fn(async () => Response.json({ accountantUser: {} })) as unknown as typeof fetch,
      })
    ).rejects.toThrow('Invalid client context structure received')
  })
})
