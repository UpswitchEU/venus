/**
 * Transient auth-failure classification (2026-06-10 pool-pressure incident).
 *
 * A 503/504/timeout on /api/auth/me is the auth SERVICE being unavailable —
 * not a verdict on the user's cookies. The resolver must never convert it
 * into an "unauthenticated" identity (which downstream gates read as logged
 * out and answer with a Mercury login redirect, ejecting a cookie-valid
 * advisor mid-valuation). Policy mirrors the auth store's checkSession:
 * keep the already-verified store user; with no cached user, fail transient.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchWithTimeoutClient: vi.fn(),
  authState: {
    user: null as null | { id: string; email: string; name: string },
  },
  clientContextState: {
    contextGateResolved: true,
    isActingAsClient: false,
    accountant: null as null | { id: string },
    relationshipId: null as null | string,
    client: null,
  },
}))

vi.mock('@/utils/auth-fetch-timeout', () => ({
  CLIENT_AUTH_ME_FETCH_TIMEOUT_MS: 12_000,
  CLIENT_AUTH_REFRESH_FETCH_TIMEOUT_MS: 12_000,
  fetchWithTimeoutClient: mocks.fetchWithTimeoutClient,
}))

vi.mock('@/lib/auth/store', () => ({
  isTransientAuthCheckStatus: (status: number) =>
    status === 408 || status === 429 || (status >= 500 && status < 600),
}))

vi.mock('../../../auth', () => {
  const useAuthStore = () => mocks.authState
  useAuthStore.getState = () => mocks.authState
  return { useAuthStore }
})

vi.mock('../../../../stores/clientContext', () => {
  const useClientContext = () => mocks.clientContextState
  useClientContext.getState = () => mocks.clientContextState
  return { useClientContext }
})

vi.mock('@/utils/auth/mercury-auth-bootstrap', () => ({
  awaitMercuryAuthBootstrap: vi.fn().mockResolvedValue(null),
  getCapturedMercuryAuthBootstrap: vi.fn().mockReturnValue(null),
  installMercuryAuthBootstrapListener: vi.fn(),
}))

vi.mock('@/utils/auth/logout-abort', () => ({
  getLogoutAbortSignal: () => undefined,
}))

vi.mock('@/utils/auth/cross-tab-refresh', () => ({
  markRefreshCompleted: vi.fn(),
  wasRefreshedRecently: () => false,
}))

vi.mock('@/utils/auth/refreshMutex', () => ({
  getActiveRefreshPromise: () => null,
  setActiveRefreshPromise: vi.fn(),
}))

vi.mock('@/utils/getMercuryUrl', () => ({
  getApiUrl: () => 'https://api-staging.upswitch.app',
  getMercuryUrl: () => 'https://preview.upswitch.app',
}))

import { AuthResolver, AuthenticationRequiredError } from '../AuthResolver'
import type { BootstrapContext, BootstrapHints } from '../../types'

function makeContext(): BootstrapContext {
  return {
    url: 'https://preview.valuation.upswitch.app/nl/reports/new',
    locale: 'nl',
  } as BootstrapContext
}

function makeHints(): BootstrapHints {
  return {
    hasClientToken: false,
    hasReportId: false,
    isNewReport: true,
    isEmbedded: false,
  } as BootstrapHints
}

function jsonResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response
}

describe('AuthResolver transient failure classification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authState.user = null
  })

  it('keeps the authenticated store user when /api/auth/me 503s (pool pressure)', async () => {
    mocks.authState.user = {
      id: 'advisor-uuid',
      email: 'advisor@example.com',
      name: 'Ada Advisor',
    }
    mocks.fetchWithTimeoutClient.mockResolvedValue(jsonResponse(503))

    const resolver = new AuthResolver()
    const result = await resolver.resolve(makeContext(), makeHints())

    expect(result.success).toBe(true)
    expect(result.source).toBe('auth_store_cache')
    expect(result.transient).toBe(true)
    expect(result.data).toMatchObject({
      type: 'authenticated',
      userId: 'advisor-uuid',
      email: 'advisor@example.com',
      firstName: 'Ada',
      lastName: 'Advisor',
    })
  })

  it('returns a transient failure (no login redirect) when /api/auth/me 503s with no cached user', async () => {
    mocks.fetchWithTimeoutClient.mockResolvedValue(jsonResponse(503))

    const resolver = new AuthResolver()
    const result = await resolver.resolve(makeContext(), makeHints())

    expect(result.success).toBe(false)
    expect(result.transient).toBe(true)
    // DEFAULT_IDENTITY fallback: no userId — nothing to act on, but the
    // transient flag tells consumers this is "retry", not "login".
    expect(result.data.userId).toBeUndefined()
    expect(result.error).toMatch(/temporarily unavailable/i)
  })

  it('keeps the store user when the auth probe throws (network drop / timeout abort)', async () => {
    mocks.authState.user = {
      id: 'advisor-uuid',
      email: 'advisor@example.com',
      name: 'Ada',
    }
    mocks.fetchWithTimeoutClient.mockRejectedValue(new TypeError('Failed to fetch'))

    const resolver = new AuthResolver()
    const result = await resolver.resolve(makeContext(), makeHints())

    expect(result.success).toBe(true)
    expect(result.source).toBe('auth_store_cache')
    expect(result.data).toMatchObject({ type: 'authenticated', userId: 'advisor-uuid' })
  })

  it('still treats a definitive 401 (after failed refresh) as unauthenticated', async () => {
    mocks.authState.user = {
      id: 'stale-uuid',
      email: 'stale@example.com',
      name: 'Stale User',
    }
    // /api/auth/me → 401, then tryRefreshToken's POST /api/auth/refresh → 401.
    mocks.fetchWithTimeoutClient.mockResolvedValue(jsonResponse(401))

    const resolver = new AuthResolver()
    const result = await resolver.resolve(makeContext(), makeHints())

    // Definitive verdict: do NOT fall back to the cached user.
    expect(result.success).toBe(false)
    expect(result.transient).not.toBe(true)
    expect(result.error).toContain('Please sign in')
  })

  it('AuthenticationRequiredError carries the Mercury login redirect (sanity)', () => {
    const err = new AuthenticationRequiredError('msg', 'https://mercury/login')
    expect(err.redirectUrl).toBe('https://mercury/login')
  })
})
