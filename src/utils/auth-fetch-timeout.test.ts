import { describe, expect, it, vi } from 'vitest'
import authTimeoutContract from '../../../../tests/contracts/auth-fetch-timeout-contract.json'

import {
  CLIENT_AUTH_ME_FETCH_TIMEOUT_MS,
  CLIENT_AUTH_REFRESH_FETCH_TIMEOUT_MS,
  fetchWithTimeoutClient,
} from './auth-fetch-timeout'

const { venus } = authTimeoutContract

describe('auth-fetch-timeout', () => {
  it('keeps client /api/auth/me budget above the single BFF me-or-refresh hop', () => {
    expect(CLIENT_AUTH_ME_FETCH_TIMEOUT_MS).toBe(venus.authMeClientTimeoutMs)
    expect(CLIENT_AUTH_ME_FETCH_TIMEOUT_MS).toBeGreaterThan(venus.authMeUpstreamTimeoutMs)
    expect(CLIENT_AUTH_ME_FETCH_TIMEOUT_MS).toBeGreaterThan(
      venus.authMeTitanHopCount * venus.authMeUpstreamTimeoutMs
    )
    expect(CLIENT_AUTH_ME_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(
      venus.authMeRouteMaxDurationSeconds * 1000
    )
  })

  it('keeps refresh client budget above default BFF upstream timeout (10s)', () => {
    expect(CLIENT_AUTH_REFRESH_FETCH_TIMEOUT_MS).toBe(venus.authRefreshClientTimeoutMs)
    expect(CLIENT_AUTH_REFRESH_FETCH_TIMEOUT_MS).toBeGreaterThan(venus.defaultBffUpstreamTimeoutMs)
    expect(CLIENT_AUTH_REFRESH_FETCH_TIMEOUT_MS).toBeLessThanOrEqual(
      venus.authRefreshRouteMaxDurationSeconds * 1000
    )
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
        })
    )

    const requestPromise = fetchWithTimeoutClient('/api/auth/me', { timeoutMs: 50 })
    await expect(requestPromise).rejects.toMatchObject({ name: 'AbortError' })
  })
})
