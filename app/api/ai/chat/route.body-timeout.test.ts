/**
 * BFF tests for POST /api/ai/chat (body timeout).
 *
 * Keeps the fake-timer body-read timeout in a dedicated static-hoist file.
 */

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AI_CHAT_PROXY_TIMEOUT_MS } from './chat-proxy'

const mocks = vi.hoisted(() => ({
  getBffCookieHeaderForTitan: vi.fn(),
  apiLogger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/utils/bffAuthProxy', () => ({
  getBffCookieHeaderForTitan: mocks.getBffCookieHeaderForTitan,
}))

vi.mock('@/utils/logger', () => ({
  apiLogger: mocks.apiLogger,
}))

import { POST } from './route'

function request(body: unknown): NextRequest {
  return new NextRequest('https://valuation.upswitch.app/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      cookie: 'upswitch_access_token=jwt-token-here',
    },
  })
}

beforeEach(() => {
  mocks.getBffCookieHeaderForTitan.mockReset()
  mocks.apiLogger.warn.mockReset()
  mocks.apiLogger.error.mockReset()
  mocks.getBffCookieHeaderForTitan.mockImplementation(
    async (requestLike: Pick<Request, 'headers'>) => ({
      cookieHeader: requestLike.headers.get('cookie') || '',
      cookieSource: requestLike.headers.get('cookie') ? 'header' : 'cookieStore',
    })
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('body timeout', () => {
  it('returns 504 when a non-streaming JSON body stalls after headers arrive', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: vi.fn(
          () =>
            new Promise(() => {
              // Intentionally never resolves; the body timeout must win.
            })
        ),
      } as unknown as Response)
    )

    const responsePromise = POST(request({ message: 'hi', stream: false }))
    await Promise.resolve()
    await Promise.resolve()

    const assertion = expect(responsePromise.then((res) => res.status)).resolves.toBe(504)
    await vi.advanceTimersByTimeAsync(AI_CHAT_PROXY_TIMEOUT_MS + 1)

    await assertion
  })
})
