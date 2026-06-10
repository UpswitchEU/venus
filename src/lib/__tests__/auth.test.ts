/**
 * Authentication Module Tests
 *
 * Tests for simplified auth implementation
 * Verifies cookie auth, token exchange, and guest flows
 */

import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearLastRefreshAt } from '../../utils/auth/cross-tab-refresh'
import { setActiveRefreshPromise } from '../../utils/auth/refreshMutex'
import { clearAuthCache } from '../auth/authCache'
import { useAuthStore, wasLastSessionCheckTransient } from '../auth/store'
import { useAuth } from '../auth/useAuth'

function fetchMock() {
  return vi.mocked(global.fetch)
}

function responseStub(response: Partial<Response>): Response {
  return response as Response
}

const clearClientContextMock = vi.fn()
vi.mock('../../stores/clientContext', () => ({
  useClientContext: {
    getState: () => ({
      clearClientContext: clearClientContextMock,
    }),
  },
}))

describe('Authentication Module', () => {
  const originalLocation = window.location
  const locationAssignMock = vi.fn()

  beforeEach(() => {
    clearAuthCache()
    clearClientContextMock.mockClear()
    locationAssignMock.mockClear()
    // Reset store state
    useAuthStore.setState({
      user: null,
      loading: false,
      error: null,
      isInitializing: false,
      isRefreshing: false,
    })

    vi.clearAllMocks()
    // vitest clearAllMocks can strip fetch; re-bind a fresh mock every test
    global.fetch = vi.fn() as typeof fetch

    // Reset document.cookie
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    })

    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: {
        ...originalLocation,
        origin: originalLocation.origin,
        assign: locationAssignMock,
      },
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: originalLocation,
    })
    vi.useRealTimers()
  })

  describe('Cookie Authentication', () => {
    it('should authenticate with valid cookie and API response', async () => {
      // Mock cookie
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: 'upswitch_session=valid_token_here',
      })

      // Mock successful API response
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
      }

      fetchMock().mockResolvedValueOnce(
        responseStub({
          ok: true,
          json: async () => ({
            success: true,
            data: { user: mockUser },
          }),
        })
      )

      // Call checkSession
      const { checkSession } = useAuthStore.getState()
      const user = await checkSession()

      // Verify user authenticated
      expect(user).toEqual(mockUser)
      expect(useAuthStore.getState().user).toEqual(mockUser)
      expect(useAuthStore.getState().loading).toBe(false)
      expect(useAuthStore.getState().error).toBeNull()
    })

    it('setUser: does not clear client context on first sign-in (null → user)', () => {
      const { setUser } = useAuthStore.getState()
      setUser({ id: 'u1', email: 'a@b.com', name: 'A', role: 'user' })
      expect(clearClientContextMock).not.toHaveBeenCalled()
    })

    it('setUser: clears client context when switching to a different user', () => {
      const { setUser } = useAuthStore.getState()
      setUser({ id: 'u1', email: 'a@b.com', name: 'A', role: 'user' })
      clearClientContextMock.mockClear()
      setUser({ id: 'u2', email: 'b@b.com', name: 'B', role: 'user' })
      expect(clearClientContextMock).toHaveBeenCalledTimes(1)
    })

    it('setUser: clears client context when user signs out (null)', () => {
      const { setUser } = useAuthStore.getState()
      setUser({ id: 'u1', email: 'a@b.com', name: 'A', role: 'user' })
      clearClientContextMock.mockClear()
      setUser(null)
      expect(clearClientContextMock).toHaveBeenCalledTimes(1)
    })

    it('should handle no active session gracefully', async () => {
      vi.useFakeTimers()

      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: 'upswitch_session=valid_token',
      })

      const unauthorized = responseStub({
        ok: false,
        status: 401,
        json: async () => ({ success: false }),
      })

      // 401 path: auth/me (twice for cookie-propagation retry), then refresh, then me again if refresh succeeded
      fetchMock().mockImplementation((input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : String((input as Request).url)
        if (url.includes('/api/auth/refresh')) {
          return Promise.resolve(
            responseStub({
              ok: false,
              status: 401,
              json: async () => ({}),
            })
          )
        }
        if (url.includes('/api/auth/me')) {
          return Promise.resolve(unauthorized)
        }
        return Promise.resolve(unauthorized)
      })

      const { checkSession } = useAuthStore.getState()
      const sessionPromise = checkSession()
      await vi.advanceTimersByTimeAsync(700)
      const user = await sessionPromise

      expect(user).toBeNull()
      expect(useAuthStore.getState().user).toBeNull()
      expect(useAuthStore.getState().error).toBeNull()
    })

    it('should continue as guest when no cookie', async () => {
      // No cookie
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: '',
      })

      fetchMock().mockResolvedValueOnce(
        responseStub({
          ok: true,
          status: 200,
          json: async () => ({ isAuthenticated: false, user: null }),
        })
      )

      // Call checkSession
      const { checkSession } = useAuthStore.getState()
      const user = await checkSession()

      // Should not call API (no cookie)
      expect(global.fetch).toHaveBeenCalled()
      expect(user).toBeNull()
    })

    it('should handle network errors gracefully', async () => {
      // Mock cookie
      Object.defineProperty(document, 'cookie', {
        writable: true,
        value: 'upswitch_session=valid_token',
      })

      // Mock network error
      fetchMock().mockRejectedValueOnce(new Error('Network error'))

      // Call checkSession
      const { checkSession } = useAuthStore.getState()
      const user = await checkSession()

      // Verify error handled, user still null (guest mode)
      expect(user).toBeNull()
      expect(useAuthStore.getState().error).toBeTruthy()
    })

    it('should preserve current user on transient auth service outage', async () => {
      const currentUser = {
        id: 'user123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
      }

      useAuthStore.setState({
        user: currentUser,
        loading: true,
        error: 'stale auth error',
      })

      fetchMock().mockResolvedValueOnce(
        responseStub({
          ok: false,
          status: 503,
          json: async () => ({
            isAuthenticated: false,
            error: 'service_unavailable',
            message: 'Authentication service temporarily unavailable',
          }),
        })
      )

      const { checkSession } = useAuthStore.getState()
      const user = await checkSession()

      expect(user).toEqual(currentUser)
      expect(useAuthStore.getState().user).toEqual(currentUser)
      expect(useAuthStore.getState().loading).toBe(false)
      expect(useAuthStore.getState().error).toBeNull()
      expect(clearClientContextMock).not.toHaveBeenCalled()
    })
  })

  describe('Token refresh under DB pool pressure (no logout on transient 503)', () => {
    const currentUser = {
      id: 'user123',
      email: 'test@example.com',
      name: 'Test User',
      role: 'user',
    }

    beforeEach(() => {
      // Ensure the on-demand refresh actually fires (not short-circuited by the
      // cross-tab recency window) and the shared mutex starts clean.
      clearLastRefreshAt()
      setActiveRefreshPromise(null)
      useAuthStore.setState({ user: currentUser, loading: true, error: null })
    })

    it('PRESERVES the session when /me 401s and the token refresh hits a transient 503', async () => {
      // The exact 2026-06-10 incident: access token expired (→ /me 401), then
      // POST /refresh hit the exhausted Supavisor pool (503). Pre-fix this cleared
      // the user and bounced them to the Mercury home page. It must now keep the
      // session and let the next check retry once the pool recovers.
      fetchMock()
        .mockResolvedValueOnce(responseStub({ ok: false, status: 401, json: async () => ({}) }))
        .mockResolvedValueOnce(
          responseStub({
            ok: false,
            status: 503,
            json: async () => ({ message: 'Database temporarily unavailable' }),
          })
        )

      const { checkSession } = useAuthStore.getState()
      const user = await checkSession()

      expect(user).toEqual(currentUser)
      expect(useAuthStore.getState().user).toEqual(currentUser)
      expect(useAuthStore.getState().error).toBeNull()
      // A transient refresh failure must NOT clear the identity / client context.
      expect(clearClientContextMock).not.toHaveBeenCalled()
    })

    it('PRESERVES the session when /me 401s and the refresh request throws (timeout/network)', async () => {
      fetchMock()
        .mockResolvedValueOnce(responseStub({ ok: false, status: 401, json: async () => ({}) }))
        .mockRejectedValueOnce(new Error('The operation timed out'))

      const { checkSession } = useAuthStore.getState()
      const user = await checkSession()

      expect(user).toEqual(currentUser)
      expect(useAuthStore.getState().user).toEqual(currentUser)
      expect(clearClientContextMock).not.toHaveBeenCalled()
    })

    it('isolates each refresh outcome — a transient 503 preserves the session even right after a real-401 logout', async () => {
      // Per-attempt isolation regression: the refresh verdict travels WITH the
      // resolved outcome (no shared mutable classification), so a prior real-401
      // logout cannot bleed into a later transient attempt. Attempt 1 is a
      // genuine 401 logout; attempt 2 (after a fresh login) hits a transient 503
      // and MUST preserve — proving the previous attempt's `auth_failed` did not
      // contaminate it.
      fetchMock()
        // Attempt 1: /me 401 → /refresh 401 → genuine logout.
        .mockResolvedValueOnce(responseStub({ ok: false, status: 401, json: async () => ({}) }))
        .mockResolvedValueOnce(
          responseStub({ ok: false, status: 401, json: async () => ({ message: 'expired' }) })
        )
        // Attempt 2: /me 401 → /refresh 503 → preserve.
        .mockResolvedValueOnce(responseStub({ ok: false, status: 401, json: async () => ({}) }))
        .mockResolvedValueOnce(
          responseStub({
            ok: false,
            status: 503,
            json: async () => ({ message: 'Database temporarily unavailable' }),
          })
        )

      await useAuthStore.getState().checkSession()
      expect(useAuthStore.getState().user).toBeNull()

      // Fresh session, then the transient blip.
      clearLastRefreshAt()
      setActiveRefreshPromise(null)
      clearAuthCache()
      useAuthStore.setState({ user: currentUser, loading: true, error: null })

      const user = await useAuthStore.getState().checkSession()

      expect(user).toEqual(currentUser)
      expect(useAuthStore.getState().user).toEqual(currentUser)
    })

    it('STILL logs out when the refresh is genuinely rejected (401 = refresh token expired)', async () => {
      // The one case that must still clear the session: a definitive auth
      // rejection on the refresh itself.
      fetchMock()
        .mockResolvedValueOnce(responseStub({ ok: false, status: 401, json: async () => ({}) }))
        .mockResolvedValueOnce(
          responseStub({
            ok: false,
            status: 401,
            json: async () => ({ message: 'Refresh token expired' }),
          })
        )

      const { checkSession } = useAuthStore.getState()
      const user = await checkSession()

      expect(user).toBeNull()
      expect(useAuthStore.getState().user).toBeNull()
    })
  })

  describe('Session-check transient verdict (wasLastSessionCheckTransient)', () => {
    // AuthGate reads this to tell "temporarily unverifiable" (show a retry)
    // apart from "definitively logged out" (eject to login) when there is no
    // cached user — so a pool-pressure blip never bounces a cookie-valid user.
    beforeEach(() => {
      clearLastRefreshAt()
      setActiveRefreshPromise(null)
      useAuthStore.setState({ user: null, loading: false, error: null })
    })

    it('arms the flag when a cold-load /me 503s with no cached user', async () => {
      fetchMock().mockResolvedValueOnce(
        responseStub({ ok: false, status: 503, json: async () => ({}) })
      )

      const user = await useAuthStore.getState().checkSession()

      expect(user).toBeNull()
      expect(wasLastSessionCheckTransient()).toBe(true)
    })

    it('arms the flag when a cold-load /me throws (network/timeout)', async () => {
      fetchMock().mockRejectedValueOnce(new Error('The operation timed out'))

      const user = await useAuthStore.getState().checkSession()

      expect(user).toBeNull()
      expect(wasLastSessionCheckTransient()).toBe(true)
    })

    it('does NOT arm the flag on a definitive logout (/me 401 → /refresh 401)', async () => {
      fetchMock()
        .mockResolvedValueOnce(responseStub({ ok: false, status: 401, json: async () => ({}) }))
        .mockResolvedValueOnce(
          responseStub({ ok: false, status: 401, json: async () => ({ message: 'expired' }) })
        )

      const user = await useAuthStore.getState().checkSession()

      expect(user).toBeNull()
      // Definitive rejection → AuthGate should eject, not show a retry.
      expect(wasLastSessionCheckTransient()).toBe(false)
    })

    it('does NOT arm the flag on a successful auth, and a later transient supersedes it', async () => {
      const mockUser = { id: 'u1', email: 'a@b.com', name: 'A', role: 'user' }
      fetchMock().mockResolvedValueOnce(
        responseStub({ ok: true, json: async () => ({ success: true, data: { user: mockUser } }) })
      )

      const user = await useAuthStore.getState().checkSession()

      expect(user).toEqual(mockUser)
      expect(wasLastSessionCheckTransient()).toBe(false)

      // A subsequent transient probe re-arms the flag (no stale-false leak).
      clearAuthCache()
      useAuthStore.setState({ user: null })
      fetchMock().mockResolvedValueOnce(
        responseStub({ ok: false, status: 503, json: async () => ({}) })
      )
      await useAuthStore.getState().checkSession()
      expect(wasLastSessionCheckTransient()).toBe(true)
    })
  })

  describe('Token Exchange', () => {
    it('should exchange token for session successfully', async () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
      }

      // Mock successful token exchange
      fetchMock().mockResolvedValueOnce(
        responseStub({
          ok: true,
          json: async () => ({ success: true }),
        })
      )

      // Mock successful session check after exchange
      fetchMock().mockResolvedValueOnce(
        responseStub({
          ok: true,
          json: async () => ({
            success: true,
            data: { user: mockUser },
          }),
        })
      )

      // Call exchangeToken
      const { exchangeToken } = useAuthStore.getState()
      const user = await exchangeToken('test_token_123')

      // Verify user authenticated
      expect(user).toEqual(mockUser)
      expect(useAuthStore.getState().user).toEqual(mockUser)
      expect(global.fetch).toHaveBeenCalledTimes(2)
    })

    it('should handle invalid token', async () => {
      // Mock failed token exchange
      fetchMock().mockResolvedValueOnce(
        responseStub({
          ok: false,
          status: 401,
        })
      )

      // Call exchangeToken
      const { exchangeToken } = useAuthStore.getState()
      const user = await exchangeToken('invalid_token')

      // Verify error handled
      expect(user).toBeNull()
      expect(useAuthStore.getState().error).toBeTruthy()
    })

    it('should handle token exchange network error', async () => {
      // Mock network error
      fetchMock().mockRejectedValueOnce(new Error('Network error'))

      // Call exchangeToken
      const { exchangeToken } = useAuthStore.getState()
      const user = await exchangeToken('test_token')

      // Verify error handled
      expect(user).toBeNull()
      expect(useAuthStore.getState().error).toBe('Invalid authentication token')
    })
  })

  describe('State Management', () => {
    it('should set user correctly', () => {
      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        name: 'Test User',
        role: 'user',
      }

      const { setUser } = useAuthStore.getState()
      setUser(mockUser)

      const state = useAuthStore.getState()
      expect(state.user).toEqual(mockUser)
      expect(state.loading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('should set error correctly', () => {
      const { setError } = useAuthStore.getState()
      setError('Test error message')

      const state = useAuthStore.getState()
      expect(state.error).toBe('Test error message')
      expect(state.loading).toBe(false)
    })

    it('should set loading correctly', () => {
      const { setLoading } = useAuthStore.getState()
      setLoading(true)

      const state = useAuthStore.getState()
      expect(state.loading).toBe(true)
    })

    it('should logout correctly', () => {
      // Set a user first
      const { setUser, logout } = useAuthStore.getState()
      setUser({ id: '1', email: 'test@example.com', name: 'Test', role: 'user' })

      // Logout
      logout()

      // Verify state cleared
      const state = useAuthStore.getState()
      expect(state.user).toBeNull()
      expect(state.loading).toBe(false)
      expect(state.error).toBeNull()
      expect(locationAssignMock).toHaveBeenCalledWith(
        `${originalLocation.origin}/api/auth/logout?fallback=1`
      )
    })
  })

  describe('useAuth Hook', () => {
    it('should provide backward compatible API', () => {
      const { result } = renderHook(() => useAuth())
      const auth = result.current

      // Verify all expected properties exist
      expect(auth).toHaveProperty('user')
      expect(auth).toHaveProperty('loading')
      expect(auth).toHaveProperty('isLoading') // Backward compatible
      expect(auth).toHaveProperty('error')
      expect(auth).toHaveProperty('isAuthenticated')
      expect(auth).toHaveProperty('businessCard')
      expect(auth).toHaveProperty('checkSession')
      expect(auth).toHaveProperty('exchangeToken')
      expect(auth).toHaveProperty('logout')
      expect(auth).toHaveProperty('refreshAuth')
      expect(auth).toHaveProperty('cookieHealth')
    })

    it('should compute businessCard correctly', () => {
      const { setUser } = useAuthStore.getState()

      // Set user with business data
      setUser({
        id: '1',
        email: 'test@example.com',
        name: 'Test',
        role: 'user',
        company_name: 'Test Company',
        business_type: 'saas',
        industry: 'technology',
        founded_year: 2020,
        country: 'BE',
        employee_count_range: '10-50',
      })

      const { result } = renderHook(() => useAuth())

      // Verify businessCard computed
      expect(result.current.businessCard).toBeDefined()
      expect(result.current.businessCard?.company_name).toBe('Test Company')
      expect(result.current.businessCard?.industry).toBe('technology')
      expect(result.current.businessCard?.business_model).toBe('saas')
      expect(result.current.businessCard?.founding_year).toBe(2020)
      expect(result.current.businessCard?.country_code).toBe('BE')
    })

    it('should return null businessCard when no business data', () => {
      const { setUser } = useAuthStore.getState()

      // Set user without business data
      setUser({
        id: '1',
        email: 'test@example.com',
        name: 'Test',
        role: 'user',
      })

      const { result } = renderHook(() => useAuth())

      // Verify businessCard is null
      expect(result.current.businessCard).toBeNull()
    })
  })
})
