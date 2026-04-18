import { describe, expect, it, vi } from 'vitest'

import {
  CLIENT_AUTH_ME_FETCH_TIMEOUT_MS,
  CLIENT_AUTH_REFRESH_FETCH_TIMEOUT_MS,
  fetchWithTimeoutClient,
} from './auth-fetch-timeout'

/** Mirrors `AUTH_FETCH_TIMEOUT_AUTH_ME_MS` in `bffAuthProxy.ts` (avoid importing server modules in tests). */
const BFF_AUTH_ME_MS = 9_000

describe('auth-fetch-timeout', () => {
  it('keeps client /api/auth/me budget above sequential BFF refresh + me', () => {
    expect(CLIENT_AUTH_ME_FETCH_TIMEOUT_MS).toBeGreaterThan(BFF_AUTH_ME_MS)
    expect(CLIENT_AUTH_ME_FETCH_TIMEOUT_MS).toBeGreaterThan(2 * BFF_AUTH_ME_MS)
  })

  it('keeps refresh client budget above default BFF upstream timeout (10s)', () => {
    expect(CLIENT_AUTH_REFRESH_FETCH_TIMEOUT_MS).toBeGreaterThan(10_000)
  })

  it('rejects when request exceeds timeout', async () => {
    vi.mocked(global.fetch).mockImplementation(
      (_: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const s = init?.signal
          if (!s) {
            reject(new Error('expected AbortSignal'))
            return
          }
          if (s.aborted) {
            reject(s.reason ?? new DOMException('Aborted', 'AbortError'))
            return
          }
          s.addEventListener('abort', () => {
            reject(s.reason ?? new DOMException('Aborted', 'AbortError'))
          })
        }),
    )

    const requestPromise = fetchWithTimeoutClient('/api/auth/me', { timeoutMs: 50 })
    await expect(requestPromise).rejects.toMatchObject({ name: 'AbortError' })
  })
})
