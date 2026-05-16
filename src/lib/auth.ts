/**
 * Simplified Authentication Module
 *
 * World-class authentication following Stripe/Auth0 patterns:
 * - Simple, deterministic flow
 * - Minimal logging (errors only)
 * - Fast initialization (<100ms)
 * - No over-engineering
 * - Race condition prevention via promise caching
 *
 * AUTH-FIRST Flow:
 * 1. Check cookie (sync) → If exists, verify with backend
 * 2. Check token in URL → Exchange for cookie
 * 3. No auth → Redirect to login (guest mode no longer supported)
 *
 * @module lib/auth
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { isAccountantTierRole } from '../constants/accountantPlanMethods'
import type { User } from '../contexts/AuthContextTypes'
import { useClientContext } from '../stores/clientContext'
import { removeAuthRelatedSessionStorageKeys } from '../utils/auth/clear-auth-session-storage'
import { fetchWithTimeoutClient } from '../utils/auth-fetch-timeout'
import { fetchWithBySession404Retry } from '../utils/fetchWithBySession404Retry'
import { getApiUrl } from '../utils/getMercuryUrl'
import { isSessionKey, isUuid } from '../utils/identifiers'
import { generalLogger } from '../utils/logger'
import { MERCURY_ADVISOR_URL_MODE } from '../utils/reportMode'
import { authMetrics, logAuthError, trackAuthFailure, trackAuthSuccess } from './authLogger'
import { isLegacyReturnUrl, isSafeMercuryReturnUrlInput } from './return-url'

// Backend API URL - environment-aware (shared utility)
const API_URL = getApiUrl()

/**
 * Simple Auth Cache - Prevents redundant API calls
 * Follows Mercury's pattern with 5-minute TTL
 */
interface CachedAuth {
  user: User | null
  timestamp: number
  expiresAt: number
}

let authCache: CachedAuth | null = null
const AUTH_CACHE_TTL = 3 * 60 * 1000 // 3 minutes (matches Mercury's optimized timing)

function getAuthCache(): User | null {
  if (!authCache) return null
  if (Date.now() > authCache.expiresAt) {
    authCache = null
    return null
  }
  return authCache.user
}

function setAuthCache(user: User | null): void {
  const now = Date.now()
  authCache = {
    user,
    timestamp: now,
    expiresAt: now + AUTH_CACHE_TTL,
  }
}

export function clearAuthCache(): void {
  authCache = null
}

function abortCheckSessionIfLoggingOut(): boolean {
  return typeof window !== 'undefined' && !!window.__isLoggingOut
}

async function broadcastLoginIfNewSession(
  user: User,
  priorUserId: string | null | undefined
): Promise<void> {
  if (typeof window === 'undefined') return
  if (priorUserId != null && priorUserId === user.id) return
  try {
    const { broadcastLogin } = await import('../utils/auth/cross-domain-logout')
    broadcastLogin()
  } catch {
    /* non-fatal */
  }
}

/**
 * BANK GRADE: Request Deduplication Cache
 * Prevents parallel API calls to the same endpoint
 * Critical for preventing race conditions in accountant → client context flow
 */
const requestCache = new Map<string, Promise<any>>()

function getCachedRequest<T>(key: string, factory: () => Promise<T>): Promise<T> {
  const cached = requestCache.get(key)
  if (cached) {
    generalLogger.debug('[Auth] Reusing cached request', { key })
    return cached as Promise<T>
  }

  const promise = factory().finally(() => {
    // Clear from cache after completion (success or failure)
    requestCache.delete(key)
  })

  requestCache.set(key, promise)
  return promise
}

/**
 * SECURITY: Sanitize URL by removing sensitive query parameters
 * Prevents data leakage in:
 * - Browser history
 * - HTTP Referer headers
 * - Analytics tools
 * - Server access logs (for future navigations)
 *
 * @param paramsToRemove - Array of parameter names to remove from URL
 */
function sanitizeUrl(paramsToRemove: string[]): void {
  if (typeof window === 'undefined') return

  try {
    const url = new URL(window.location.href)
    let modified = false

    for (const param of paramsToRemove) {
      if (url.searchParams.has(param)) {
        url.searchParams.delete(param)
        modified = true
      }
    }

    if (modified) {
      // Replace current URL without adding to history
      window.history.replaceState({}, '', url.toString())

      // Log sanitization (development only)
      if (process.env.NODE_ENV === 'development') {
        generalLogger.debug('[Security] Sanitized URL parameters', { paramsToRemove })
      }
    }
  } catch (error) {
    generalLogger.error('[Security] URL sanitization failed', { error })
  }
}

/**
 * Promise cache for in-flight auth checks - Prevents race conditions
 * Following Mercury's pattern for concurrent request deduplication
 */
let checkSessionPromise: Promise<User | null> | null = null

/** Prevents double navigational logout + races with checkSession/refresh */
let venusLogoutNavigationPending = false

import { broadcastLogout as broadcastLogoutNow } from '../utils/auth/cross-domain-logout'
import {
  clearLastRefreshAt,
  markRefreshCompleted,
  wasRefreshedRecently,
} from '../utils/auth/cross-tab-refresh'
import { getLogoutAbortSignal, triggerLogoutAbort } from '../utils/auth/logout-abort'
// Token refresh uses the shared mutex in utils/auth/refreshMutex.ts
// so that checkSession() and useTokenRefresh don't fire concurrent
// refresh requests (which would fail under strict token rotation).
import { getActiveRefreshPromise, setActiveRefreshPromise } from '../utils/auth/refreshMutex'

/**
 * Promise cache for initialization - Prevents multiple simultaneous initializations.
 * Once initialization succeeds, initCompleted prevents any further calls from
 * re-running (avoids auth store loading=true/false thrashing on re-invocation).
 */
let initPromise: Promise<void> | null = null
let initCompleted = false

const INIT_SUCCESS_KEY = 'venus_init_ok_at'
const INIT_THROTTLE_MS = 10_000

function wasRecentlyInitialized(): boolean {
  try {
    const ts = parseInt(sessionStorage.getItem(INIT_SUCCESS_KEY) || '0', 10)
    return Date.now() - ts < INIT_THROTTLE_MS
  } catch {
    return false
  }
}

function markInitSuccess(): void {
  try {
    sessionStorage.setItem(INIT_SUCCESS_KEY, String(Date.now()))
  } catch { /* ignore non-critical failure */ }
}

export function clearInitThrottle(): void {
  try {
    sessionStorage.removeItem(INIT_SUCCESS_KEY)
  } catch { /* ignore non-critical failure */ }
}

// ---------------------------------------------------------------------------
// Reload-loop circuit breaker
// If the page reloads more than MAX times within WINDOW ms, stop retrying
// and surface an error. This breaks redirect loops (e.g. Venus→Mercury→Venus).
// ---------------------------------------------------------------------------
const RELOAD_COUNT_KEY = 'venus_reload_count'
const RELOAD_WINDOW_KEY = 'venus_reload_window_start'
const MAX_RELOADS_IN_WINDOW = 4
const RELOAD_WINDOW_MS = 30_000

function isReloadLooping(): boolean {
  try {
    const now = Date.now()
    const windowStart = parseInt(sessionStorage.getItem(RELOAD_WINDOW_KEY) || '0', 10)
    let count = parseInt(sessionStorage.getItem(RELOAD_COUNT_KEY) || '0', 10)

    if (now - windowStart > RELOAD_WINDOW_MS) {
      sessionStorage.setItem(RELOAD_WINDOW_KEY, String(now))
      count = 0
    }
    count++
    sessionStorage.setItem(RELOAD_COUNT_KEY, String(count))
    return count > MAX_RELOADS_IN_WINDOW
  } catch {
    return false
  }
}

export function clearReloadCounter(): void {
  try {
    sessionStorage.removeItem(RELOAD_COUNT_KEY)
    sessionStorage.removeItem(RELOAD_WINDOW_KEY)
  } catch { /* ignore non-critical failure */ }
}

/**
 * BANK GRADE: Client Context Initialization Tracking
 * Uses deferred promise pattern to prevent race conditions where API requests
 * fire before client context is loaded.
 *
 * Key improvement: waitForClientContext() now checks if clientToken is in URL
 * and creates a promise that will be resolved when exchange completes.
 * This prevents the race where waitForClientContext() returns Promise.resolve()
 * before initializeAuth() has set clientContextPromise.
 */
let clientContextInitialized = false
let clientContextPromise: Promise<void> | null = null
let clientContextResolver: (() => void) | null = null
let clientContextRejecter: ((error: Error) => void) | null = null

/**
 * Initialize the client context promise (deferred pattern)
 * Called when we detect clientToken in URL to ensure promise exists before any waits
 */
function initClientContextPromise(): Promise<void> {
  if (!clientContextPromise) {
    clientContextPromise = new Promise<void>((resolve, reject) => {
      clientContextResolver = resolve
      clientContextRejecter = reject
    })
  }
  return clientContextPromise
}

/**
 * Resolve the client context promise (called on successful exchange)
 */
function resolveClientContext(): void {
  clientContextInitialized = true
  if (clientContextResolver) {
    clientContextResolver()
    clientContextResolver = null
    clientContextRejecter = null
  }
}

/**
 * Reject the client context promise (called on failed exchange)
 */
function rejectClientContext(error: Error): void {
  clientContextInitialized = false
  if (clientContextRejecter) {
    clientContextRejecter(error)
    clientContextResolver = null
    clientContextRejecter = null
  }
}

/**
 * Check if client context initialization is complete
 * Used by HTTP interceptor to determine if guest session tracking is needed
 */
export function isClientContextReady(): boolean {
  return clientContextInitialized
}

/**
 * Wait for client context initialization to complete
 *
 * BANK GRADE: Uses deferred promise pattern to ensure this never returns
 * prematurely. If clientToken is in URL, this creates/returns a promise
 * that will be resolved when the exchange completes.
 *
 * @returns Promise that resolves when client context is ready (or immediately if not needed)
 */
export function waitForClientContext(): Promise<void> {
  // If already initialized, return immediately
  if (clientContextInitialized) {
    return Promise.resolve()
  }

  // If promise already exists, return it
  if (clientContextPromise) {
    return clientContextPromise
  }

  // Check if we're expecting client context (clientToken in URL)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    if (params.get('clientToken')) {
      // Create deferred promise that will be resolved by initializeAuth
      return initClientContextPromise()
    }
  }

  // No client context expected - return resolved immediately
  return Promise.resolve()
}

/**
 * Auth state interface
 */
interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  /**
   * RACE CONDITION FIX: Tracks when initializeAuth() is running.
   * AuthGate should wait for both loading=false AND isInitializing=false
   * before checking client context. This prevents the race where
   * checkSession() sets loading=false but initializeAuth() hasn't
   * finished fetching client context yet.
   */
  isInitializing: boolean
  /**
   * RELOAD LOOP FIX: Tracks when token refresh is in flight (401 → refresh → retry).
   * AuthGate must NOT redirect while refresh is in progress, or we redirect before
   * the user is restored and cause a redirect loop.
   */
  isRefreshing: boolean

  // Actions
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setIsInitializing: (isInitializing: boolean) => void
  setIsRefreshing: (isRefreshing: boolean) => void
  checkSession: () => Promise<User | null>
  exchangeToken: (token: string) => Promise<User | null>
  logout: (options?: { postLogoutUrl?: string }) => void
}

/**
 * Auth Store - Single source of truth
 * Using Zustand for atomic updates and React integration
 */
export const useAuthStore = create<AuthState>()(
  devtools(
    (set, get) => ({
      // Initial state
      user: null,
      loading: true,
      error: null,
      isInitializing: true, // RACE CONDITION FIX: Start as true, set false when initializeAuth completes
      isRefreshing: false, // RELOAD LOOP FIX: True when 401 triggered refresh is in flight

      // Set user
      setUser: (user: User | null) => {
        const prior = get().user
        // Clear stale accountant client-context only on sign-out and on real identity
        // switches — NOT on the first `null → user` transition (checkSession, OAuth),
        // or we would tear down context before the clientToken handshake and fight persist rehydration.
        const shouldClearClientContext =
          (user == null && prior?.id != null) ||
          (user != null && prior?.id != null && prior.id !== user.id)
        if (shouldClearClientContext) {
          try {
            useClientContext.getState().clearClientContext()
          } catch (e) {
            generalLogger.warn('[Auth] clearClientContext on identity change failed', { e })
          }
        }
        set({ user, loading: false, error: null })
      },

      // Set loading
      setLoading: (loading: boolean) => {
        set({ loading })
      },

      // Set error
      setError: (error: string | null) => {
        set({ error, loading: false })
      },

      // RACE CONDITION FIX: Set initialization state
      setIsInitializing: (isInitializing: boolean) => {
        set({ isInitializing })
      },

      // RELOAD LOOP FIX: Set refresh-in-progress state
      setIsRefreshing: (isRefreshing: boolean) => {
        set({ isRefreshing })
      },

      // Check session with cookie (supports dual-token system with auto-refresh)
      checkSession: async (): Promise<User | null> => {
        if (typeof window !== 'undefined' && window.__isLoggingOut) {
          return null
        }
        // CRITICAL: Check cache first (like Mercury)
        const cached = getAuthCache()
        if (cached) {
          // RACE CONDITION FIX: Don't set loading: false here!
          // Let initializeAuth() manage loading state in its finally block.
          // Setting loading: false here causes AuthGate to run checkAuth()
          // before initializeAuth() has finished setting up client context.
          set({ user: cached, error: null })
          return cached
        }

        // CRITICAL: Deduplicate concurrent requests (like Mercury)
        // If already checking session, return the existing promise
        if (checkSessionPromise) {
          return checkSessionPromise
        }

        // Create new check session promise
        checkSessionPromise = (async () => {
          try {
            // Try to get user with access token
            // Use Venus proxy route for same-origin request (no CORS issues)
            // Pass logout signal: /api/auth/me may BFF-refresh and return
            // rotated `Set-Cookie` that would otherwise undo a concurrent logout.
            const response = await fetchWithTimeoutClient('/api/auth/me', {
              method: 'GET',
              credentials: 'include', // Send cookies (upswitch_access_token, upswitch_refresh_token)
              headers: {
                Accept: 'application/json',
              },
              signal: getLogoutAbortSignal(),
            })

            if (abortCheckSessionIfLoggingOut()) return null

            // If access token expired (401), try to refresh automatically
            if (response.status === 401) {
              if (abortCheckSessionIfLoggingOut()) return null
              // RELOAD LOOP FIX: Signal refresh in progress so AuthGate doesn't redirect prematurely
              get().setIsRefreshing(true)
              try {
                // CRITICAL: Deduplicate concurrent refresh attempts
                // If already refreshing, wait for that promise
                if (!getActiveRefreshPromise()) {
                  const promise = (async () => {
                    try {
                      // Cross-tab dedup: another tab may have refreshed in the
                      // last few minutes; if so, the new cookies are already
                      // in our jar — retry /me directly instead of racing a
                      // POST /refresh against the now-rotated refresh token.
                      if (wasRefreshedRecently()) {
                        return true
                      }
                      const refreshResponse = await fetch('/api/auth/refresh', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { Accept: 'application/json' },
                        signal: getLogoutAbortSignal(),
                      })

                      if (!refreshResponse.ok) {
                        const errorData = await refreshResponse.json().catch(() => ({}))
                        const errorMessage = errorData.message || 'Token refresh failed'

                        if (refreshResponse.status === 401 || refreshResponse.status === 403) {
                          logAuthError('Token refresh failed - refresh token expired', {
                            status: refreshResponse.status,
                            message: errorMessage,
                          })
                          return false
                        }

                        logAuthError('Token refresh failed - server error', {
                          status: refreshResponse.status,
                          message: errorMessage,
                        })
                        return false
                      }

                      markRefreshCompleted()
                      return true
                    } catch (refreshError) {
                      logAuthError('Token refresh failed - network error', {
                        error:
                          refreshError instanceof Error
                            ? refreshError.message
                            : String(refreshError),
                      })
                      return false
                    } finally {
                      setActiveRefreshPromise(null)
                    }
                  })()
                  setActiveRefreshPromise(promise)
                }

                const refreshSuccess = await getActiveRefreshPromise()!

                if (abortCheckSessionIfLoggingOut()) return null

                if (refreshSuccess) {
                  // Retry with new access token
                  // Use Venus proxy route for same-origin request (no CORS issues)
                  const retryResponse = await fetchWithTimeoutClient('/api/auth/me', {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                      Accept: 'application/json',
                    },
                    signal: getLogoutAbortSignal(),
                  })

                  if (retryResponse.ok) {
                    const data = await retryResponse.json()
                    const user = data.success ? data.data?.user || data.data : data.user || data

                    if (user) {
                      if (abortCheckSessionIfLoggingOut()) return null
                      const priorUserId = get().user?.id ?? null
                      get().setUser(user)
                      trackAuthSuccess(user.id, 'cookie')
                      authMetrics.recordSuccess()
                      // Cache successful auth result
                      setAuthCache(user)

                      // Clear any previous errors
                      get().setError(null)

                      await broadcastLoginIfNewSession(user, priorUserId)
                      return user
                    }
                  } else {
                    // Retry failed even after refresh - might be a different issue
                    logAuthError('Auth check failed after token refresh', {
                      status: retryResponse.status,
                    })
                  }
                } else {
                  // AUTH-FIRST: Refresh failed - authentication required
                  logAuthError('Token refresh failed - authentication required', {})
                }

                // AUTH-FIRST: Refresh failed or retry failed - user needs to re-authenticate
                // Clear auth state and return null (BootstrapProvider will redirect to login)
                get().setUser(null)
                clearAuthCache()

                return null
              } finally {
                get().setIsRefreshing(false)
              }
            }

            if (response.ok) {
              const data = await response.json()
              // Handle different response formats (Mercury wraps, Titan returns directly)
              const user = data.success ? data.data?.user || data.data : data.user || data

              if (user) {
                if (abortCheckSessionIfLoggingOut()) return null
                // Capture before setUser — getState().user is the new user after setUser.
                const priorUserId = get().user?.id ?? null
                get().setUser(user)
                trackAuthSuccess(user.id, 'cookie')
                authMetrics.recordSuccess()

                // AUTH-FIRST: Guest migration no longer needed
                // Cache successful auth result (like Mercury)
                setAuthCache(user)

                await broadcastLoginIfNewSession(user, priorUserId)

                return user
              }
            }

            // AUTH-FIRST: No active session - user needs to authenticate
            // BootstrapProvider will redirect to login
            get().setUser(null)
            clearAuthCache() // Clear cache when no user
            return null
          } catch (error) {
            // Log and track errors
            const errorMessage = error instanceof Error ? error.message : 'Network error'
            logAuthError('Session check failed', { error: errorMessage })
            trackAuthFailure(errorMessage, { method: 'cookie' })
            authMetrics.recordFailure()

            // setUser(null) clears error — set error after so network/session failures surface
            get().setUser(null)
            get().setError(errorMessage)
            clearAuthCache() // Clear cache on error
            return null
          } finally {
            // CRITICAL: Clear promise cache so next call can make a fresh request
            checkSessionPromise = null
          }
        })()

        return checkSessionPromise
      },

      // Exchange token for session
      exchangeToken: async (token: string): Promise<User | null> => {
        try {
          // Exchange token for dual-token cookies (access + refresh)
          const exchangeResponse = await fetch(`${API_URL}/api/v2/auth/exchange-token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ token }),
          })

          if (!exchangeResponse.ok) {
            throw new Error('Token exchange failed')
          }

          // Verify session was set with new cookies
          const user = await get().checkSession()
          if (user) {
            trackAuthSuccess(user.id, 'token')
            authMetrics.recordSuccess()
          }
          return user
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Token exchange failed'
          logAuthError('Token exchange failed', { error: errorMessage })
          trackAuthFailure(errorMessage, { method: 'token' })
          authMetrics.recordFailure()

          // setUser(null) clears error — set error after so token failures surface
          get().setUser(null)
          get().setError('Invalid authentication token')
          return null
        }
      },

      // Logout: synchronous local clear + navigational BFF logout (Mercury-grade).
      //
      // PERF CONTRACT: this function is intentionally synchronous up to the
      // `window.location.assign()` call. Every dynamic import / await before
      // navigation was a measurable spinner-frame on slower devices. All
      // optional cleanup (auxiliary store resets) is fire-and-forget AFTER
      // navigation is scheduled — the browser keeps the JS context alive
      // long enough for those microtasks to run, and any that don't finish
      // simply die with the document, which is fine.
      logout: (options?: { postLogoutUrl?: string }) => {
        if (typeof window === 'undefined') return
        if (venusLogoutNavigationPending) return
        venusLogoutNavigationPending = true
        window.__isLoggingOut = true

        // 1) Abort in-flight refreshes BEFORE we touch cookies. A refresh
        // response arriving after this point would otherwise install fresh
        // `Set-Cookie: upswitch_access_token=...` headers and undo the
        // logout. Aborting the fetch makes the browser drop the response
        // (including its Set-Cookie) per spec.
        triggerLogoutAbort()

        try {
          // 2) Synchronous in-memory + storage cleanup. No awaits.
          set({ user: null, loading: false, error: null })
          clearAuthCache()

          checkSessionPromise = null
          setActiveRefreshPromise(null)
          initCompleted = false
          initPromise = null
          clearInitThrottle()

          localStorage.removeItem('upswitch_has_session')
          localStorage.removeItem('upswitch_user')
          // Cross-tab refresh marker is per-session; the next sign-in must
          // start with a clean slate or the first proactive refresh might
          // be deferred by the previous user's "we just refreshed" hint.
          clearLastRefreshAt()
          removeAuthRelatedSessionStorageKeys()

          // 3) Synchronous broadcast (statically imported — no chunk hop).
          try {
            broadcastLogoutNow()
          } catch {
            /* non-fatal */
          }

          // 4) Defense-in-depth: fire a keepalive POST to /api/auth/logout
          // BEFORE the navigation. Browsers keep these requests open across
          // navigation and apply their Set-Cookie clears to the cookie jar
          // even if the original tab is gone. This guarantees cookies are
          // cleared even if the navigation below is cancelled mid-flight.
          try {
            void fetch('/api/auth/logout', {
              method: 'POST',
              credentials: 'include',
              cache: 'no-store',
              keepalive: true,
              headers: { 'Content-Type': 'application/json' },
              body: '{}',
            }).catch(() => {
              /* keepalive failures are non-fatal */
            })
          } catch {
            /* ignore */
          }

          // 5) Notify in-page listeners that cookies are about to be cleared.
          // This event is part of the public auth contract used by
          // auth-provider / LogoutListener equivalents.
          try {
            window.dispatchEvent(new Event('upswitch-logout-cookies-cleared'))
          } catch {
            /* ignore */
          }

          // 6) Schedule the navigation. From here on the page is on its way
          // out; everything below is best-effort cleanup that may or may
          // not flush before unload — we don't await it.
          const url = new URL('/api/auth/logout', window.location.origin)
          url.searchParams.set('fallback', '1')
          if (options?.postLogoutUrl) {
            url.searchParams.set('post_logout', options.postLogoutUrl)
          }
          window.location.assign(url.toString())

          // 7) Fire-and-forget auxiliary cleanup. These modules form
          // import cycles with auth.ts (AuthGate / BootstrapProvider /
          // SessionBootstrapService all import from this file), so they
          // MUST stay dynamic. Running them after assign() means the
          // user-perceived logout latency is the network round-trip,
          // not the chunk-load + module-init time.
          import('../stores/clientContext')
            .then(({ useClientContext }) => {
              useClientContext.getState().clearClientContext()
            })
            .catch(() => undefined)

          import('./bootstrap/SessionBootstrapService')
            .then(({ bootstrapService }) => {
              bootstrapService.clearCache()
            })
            .catch(() => undefined)

          import('../components/AuthGate')
            .then(({ resetAuthGateGuard }) => {
              resetAuthGateGuard()
            })
            .catch(() => undefined)

          import('./bootstrap/BootstrapProvider')
            .then(({ resetBootstrapGuard }) => {
              resetBootstrapGuard()
            })
            .catch(() => undefined)

          import('../services/session/SessionEngineFactory')
            .then(({ resetSessionEngine }) => {
              resetSessionEngine()
            })
            .catch(() => undefined)
        } catch (error) {
          generalLogger.warn('[Venus Auth] Logout failed (non-fatal)', { error })
          venusLogoutNavigationPending = false
          window.__isLoggingOut = false
          try {
            broadcastLogoutNow()
          } catch {
            /* non-fatal */
          }
        }

        authMetrics.recordLogout()
      },
    }),
    { name: 'AuthStore' }
  )
)

/**
 * BANK GRADE: Generate trace ID for unified logging across initialization flow
 * Format: init_{timestamp}_{random}
 */
function generateTraceId(): string {
  return `init_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
}

// Current trace ID - exported for use by AuthGate and Bootstrap
let currentTraceId: string | null = null

/**
 * Get the current initialization trace ID
 * Returns null if no initialization is in progress
 */
export function getInitTraceId(): string | null {
  return currentTraceId
}

/**
 * Initialize authentication
 * Called once on app load
 * Prevents race conditions by deduplicating concurrent initialization calls
 */
async function initializeAuth(): Promise<void> {
  if (initCompleted) {
    return
  }

  if (typeof window !== 'undefined' && window.__isLoggingOut) {
    useAuthStore.getState().setLoading(false)
    useAuthStore.getState().setIsInitializing(false)
    return
  }

  // Circuit breaker: if the page has reloaded too many times in a short
  // window, stop trying and surface an error to break redirect loops.
  if (isReloadLooping()) {
    generalLogger.error('[Auth] Reload loop detected — breaking cycle')
    useAuthStore.getState().setLoading(false)
    useAuthStore.getState().setIsInitializing(false)
    useAuthStore
      .getState()
      .setError(
        'Unable to sign in. The page kept reloading. Please close this tab, reopen it, and try again.'
      )
    initCompleted = true
    return
  }

  // Survives module re-evaluation (e.g. dynamic import GC / page soft-reload).
  // If init succeeded within the last 10 s, hydrate from the existing auth store
  // user (which Zustand persists in memory) and skip the full flow.
  // IMPORTANT: Never skip when clientToken is in the URL — the accountant→client
  // context exchange MUST run even if auth recently succeeded.
  const hasClientToken =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('clientToken')

  if (!hasClientToken && wasRecentlyInitialized()) {
    const existing = useAuthStore.getState().user
    if (existing) {
      generalLogger.debug('[Auth] Skipping init — recently succeeded (sessionStorage throttle)')
      initCompleted = true
      useAuthStore.getState().setLoading(false)
      useAuthStore.getState().setIsInitializing(false)
      return
    }
    // User is null (page reload cleared Zustand) but init succeeded recently.
    // The full init flow will run but this is expected — sessionStorage
    // throttle only short-circuits when the in-memory user is still present.
    generalLogger.debug(
      '[Auth] SessionStorage throttle active but Zustand user is null (page reload)'
    )
  }

  if (initPromise) {
    return initPromise
  }

  // BANK GRADE: Generate trace ID for this initialization flow
  currentTraceId = generateTraceId()
  const traceId = currentTraceId

  initPromise = (async () => {
    const { setLoading, checkSession, exchangeToken, setUser, setIsInitializing } =
      useAuthStore.getState()

    generalLogger.info(`[Auth:${traceId}] Starting initialization flow`)

    try {
      setLoading(true)
      // RACE CONDITION FIX: Ensure isInitializing is true at start
      // This prevents AuthGate from checking client context prematurely
      setIsInitializing(true)

      // ========================================================================
      // STEP 1: Client Context Token Exchange (Highest Priority - Accountant → Client)
      // Check for clientToken FIRST to avoid unnecessary cookie checks
      // ========================================================================
      const params = new URLSearchParams(window.location.search)
      const clientToken = params.get('clientToken')

      // If clientToken is present, prioritize its exchange (skip cookie check)
      // This prevents guest session creation and ensures immediate authenticated state

      // ========================================================================
      // STEP 2.5: Parse and Store Return URL for Mercury Integration
      // ========================================================================
      const returnUrl = params.get('return_url')
      const sourceApp = params.get('source')

      if (isSafeMercuryReturnUrlInput(returnUrl)) {
        // Store in sessionStorage for later use when user wants to return (always overwrite stale values)
        sessionStorage.setItem('upswitch_return_url', returnUrl.trim())
        if (sourceApp) {
          sessionStorage.setItem('upswitch_source', sourceApp)
        }
        if (process.env.NODE_ENV === 'development') {
          generalLogger.debug('[Auth] Return URL captured', {
            returnUrl,
            source: sourceApp,
          })
        }
      } else {
        // No return_url, or legacy route (accountant_listings etc.): clear to prevent 404 on "Continue"
        sessionStorage.removeItem('upswitch_return_url')
        sessionStorage.removeItem('upswitch_source')
      }

      if (clientToken) {
        generalLogger.info(`[Auth:${traceId}] Client token detected - starting context exchange`)

        // BANK GRADE: Initialize deferred promise IMMEDIATELY when clientToken detected
        // This ensures waitForClientContext() always has a promise to wait for
        initClientContextPromise()

        // Validate token format before attempting exchange
        if (clientToken.length < 20 || !/^[A-Za-z0-9._-]+$/.test(clientToken)) {
          generalLogger.warn(`[Auth:${traceId}] Invalid client token format - skipping exchange`)
          // Continue to normal auth flow - don't block user
          // SECURITY: Clean up invalid token and sensitive parameters from URL
          sanitizeUrl(['clientToken', 'client_id', 'prefilledQuery', 'autoSend'])
          // BANK GRADE: Resolve promise since invalid token = no client context expected
          resolveClientContext()
        } else {
          // Clear persisted client context - prevents stale rehydration from overwriting fresh exchange result
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.removeItem('client-context')
              localStorage.removeItem('client-context-version')
            }
          } catch {
            /* ignore */
          }
          // BANK GRADE: Execute client context exchange
          // Using IIFE to run async code, but resolving/rejecting the DEFERRED promise
          // (not creating a new promise - initClientContextPromise already did that)
          ;(async () => {
            try {
              // SECURITY: Extract token, then IMMEDIATELY sanitize URL
              // This prevents token from being logged in analytics/history
              const tokenForExchange = clientToken

              // CRITICAL: Strip ALL sensitive params before exchange
              sanitizeUrl([
                'clientToken', // JWT contains sensitive claims
                'client_id', // UUID exposure
                'prefilledQuery', // Business name exposure
                'autoSend', // Behavioral data
              ])
              // Attempt exchange with retry logic
              let lastError: Error | null = null
              const maxRetries = 3
              const baseDelay = 500 // 500ms base delay

              for (let attempt = 0; attempt < maxRetries; attempt++) {
                try {
                  // BANK GRADE: Deduplicate parallel exchange-client-context requests
                  // Use token as cache key to prevent race conditions
                  const cacheKey = `exchange-client-context:${tokenForExchange.substring(0, 20)}`

                  const response = await getCachedRequest(cacheKey, async () => {
                    // Add 5-second timeout per attempt
                    const controller = new AbortController()
                    const timeoutId = setTimeout(() => controller.abort(), 5000)

                    const res = await fetch(`${API_URL}/api/v2/auth/exchange-client-context`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ token: tokenForExchange }),
                      signal: controller.signal,
                    })

                    clearTimeout(timeoutId)
                    return res
                  })

                  if (response.ok) {
                    const context = await response.json()

                    // Validate context structure (clientUser null when invitation not accepted)
                    if (!context.accountantUser || !context.relationship) {
                      throw new Error('Invalid client context structure received')
                    }

                    // ✅ FIX: Set auth user FIRST before setting client context
                    // This ensures user is authenticated when client context is set
                    // This prevents the rehydration check from clearing context prematurely
                    const user = await checkSession()
                    if (!user) {
                      throw new Error('Failed to authenticate after client context exchange')
                    }

                    // Set user before setting client context
                    setUser(user)

                    // Now set client context (user is already authenticated)
                    const { useClientContext } = await import('../stores/clientContext')
                    useClientContext.getState().setClientContext(context)

                    // SECURITY: Clean URL immediately after processing sensitive parameters
                    // Remove clientToken, client_id, and prefilledQuery from URL
                    const url = new URL(window.location.href)
                    url.searchParams.delete('clientToken')
                    url.searchParams.delete('client_id') // Remove if present (redundant)
                    url.searchParams.delete('prefilledQuery') // Remove if present (stored in session data)
                    // Clean URL completely - sensitive data should not remain in URL
                    window.history.replaceState({}, '', url.pathname + (url.search || ''))

                    // BANK GRADE: Mark initialization as complete using deferred promise pattern
                    generalLogger.info(`[Auth:${traceId}] Client context exchange successful`)
                    resolveClientContext()

                    return
                  } else {
                    // Handle specific error cases
                    const errorData = await response.json().catch(() => ({}))
                    const status = response.status

                    if (status === 401 || status === 403) {
                      // Token expired or invalid - don't retry
                      throw new Error(
                        errorData.message ||
                          'Client context token expired or invalid. Please try creating a new valuation.'
                      )
                    } else if (status >= 500 && attempt < maxRetries - 1) {
                      // Server error - retry with exponential backoff
                      const delay = baseDelay * Math.pow(2, attempt)
                      await new Promise((resolve) => setTimeout(resolve, delay))
                      continue
                    } else {
                      throw new Error(
                        errorData.message || `Failed to exchange client context token (${status})`
                      )
                    }
                  }
                } catch (error) {
                  lastError = error instanceof Error ? error : new Error(String(error))

                  // Don't retry on validation errors or auth errors
                  if (
                    lastError.message.includes('expired') ||
                    lastError.message.includes('invalid') ||
                    lastError.message.includes('Invalid client context')
                  ) {
                    break
                  }

                  // Retry on network errors or server errors
                  if (attempt < maxRetries - 1) {
                    const delay = baseDelay * Math.pow(2, attempt)
                    // Silent - only log in development
                    if (process.env.NODE_ENV === 'development') {
                      generalLogger.warn(
                        `[Auth] Client context exchange failed, retrying in ${delay}ms...`,
                        {
                          attempt: attempt + 1,
                          maxRetries,
                          error: lastError.message,
                        }
                      )
                    }
                    await new Promise((resolve) => setTimeout(resolve, delay))
                  }
                }
              }

              // If we got here, all retries failed
              if (lastError) {
                throw lastError
              }
            } catch (error) {
              // BANK GRADE: Mark as failed using deferred promise pattern
              rejectClientContext(error instanceof Error ? error : new Error(String(error)))
              throw error
            }
          })()

          // BANK GRADE FIX: Await the client context exchange before proceeding
          // This ensures client context is fully loaded before any API requests are made
          try {
            await clientContextPromise
            // CRITICAL: Success - user and client context are set, don't fall through to setUser(null)
            return
          } catch (error) {
            // Client context exchange failed - log and continue to normal auth flow
            const lastError = error instanceof Error ? error : new Error(String(error))
            generalLogger.error(`[Auth:${traceId}] Client context exchange failed`, {
              message: lastError.message,
            })

            // Show user-friendly error message
            const errorMessage = lastError.message.includes('expired')
              ? 'The valuation link has expired. Please create a new valuation from the client page.'
              : lastError.message.includes('invalid')
                ? 'Invalid valuation link. Please create a new valuation from the client page.'
                : 'Unable to load client context. Please try again or create a new valuation.'

            // Set error in auth store for UI to display
            useAuthStore.getState().setError(errorMessage)

            // SECURITY: Clean up invalid token and sensitive parameters from URL
            const url = new URL(window.location.href)
            url.searchParams.delete('clientToken')
            url.searchParams.delete('client_id') // Remove if present
            url.searchParams.delete('prefilledQuery') // Remove if present
            window.history.replaceState({}, '', url.pathname + (url.search || ''))

            // Stop here — do NOT fall through to setUser(null) which would
            // clear this error via set({ error: null }). AuthGate will pick
            // up the error and show it to the user.
            return
          }
        }
      }

      // ========================================================================
      // STEP 2: Cookie-based auth (Fallback if no clientToken, <50ms)
      // ========================================================================
      // Note: We always check the session with the backend because HttpOnly cookies
      // are invisible to JavaScript. The browser automatically sends them in requests.
      if (!clientToken) {
        const user = await checkSession()

        if (user) {
          trackAuthSuccess(user.id, 'cookie')
          authMetrics.recordSuccess()

          // ========================================================================
          // STEP 2.5: Fetch client context for accountant viewing existing report
          // ========================================================================
          // When mode=accountant and clientId are present (but no clientToken),
          // we need to fetch the client context using the authenticated session.
          // This happens when an accountant clicks on an existing valuation in Mercury.
          const mode = params.get('mode')
          const clientIdParam = params.get('clientId')

          // Use the shared advisor-tier predicate so Expert / Enterprise / Admin
          // viewers get the same client-context fetch path as base `accountant`
          // role. Without this, an Expert advisor opening a client report via
          // `?mode=accountant&clientId=X` was silently skipped here, landed on
          // AuthGate without client context, and bounced to the generic
          // "Failed to establish client context" error.
          if (
            mode === MERCURY_ADVISOR_URL_MODE &&
            clientIdParam &&
            isAccountantTierRole(user.role)
          ) {
            generalLogger.info(
              `[Auth:${traceId}] Advisor-tier mode with clientId - fetching client context`
            )

            // Initialize deferred promise for client context
            initClientContextPromise()

            try {
              const ctxAbort = new AbortController()
              const ctxTimeout = setTimeout(() => ctxAbort.abort(), 8000)
              const response = await fetch(`${API_URL}/api/v2/auth/get-client-context`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ clientId: clientIdParam }),
                signal: ctxAbort.signal,
              })
              clearTimeout(ctxTimeout)

              if (response.ok) {
                const context = await response.json()

                // Validate context structure (clientUser null when invitation not accepted)
                if (!context.accountantUser || !context.relationship) {
                  throw new Error('Invalid client context structure received')
                }

                // Set client context in store
                const { useClientContext } = await import('../stores/clientContext')
                useClientContext.getState().setClientContext(context)

                generalLogger.info(`[Auth:${traceId}] Client context established via clientId`)
                resolveClientContext()
              } else {
                const errorData = await response.json().catch(() => ({}))
                throw new Error(
                  errorData.message || `Failed to fetch client context (${response.status})`
                )
              }
            } catch (error) {
              generalLogger.error(`[Auth:${traceId}] Failed to fetch client context`, {
                error: error instanceof Error ? error.message : String(error),
              })
              // Don't block auth - user is authenticated, just missing client context
              // AuthGate will show an appropriate error
              rejectClientContext(error instanceof Error ? error : new Error(String(error)))

              const errorMessage =
                error instanceof Error ? error.message : 'Failed to establish client context'
              useAuthStore.getState().setError(errorMessage)
            }
          }

          // ========================================================================
          // STEP 2.6: Restore client context from report metadata (if no clientId in URL)
          // ========================================================================
          // When accountant returns to existing report page, restore context from report's accountant_customer_id
          // This handles the case where clientToken was cleaned from URL but report still needs context
          // Same shared advisor-tier predicate as the clientId branch above.
          // Without this, an Expert/Enterprise/Admin viewer returning to an
          // existing client report (URL already cleaned of `clientId=`) would
          // never restore client context from the report's
          // `accountant_customer_id` and would render the calculator without
          // the "Acting on behalf of …" toolbar identity.
          if (!clientIdParam && isAccountantTierRole(user.role)) {
            // Check if we're viewing an existing report (reportId in pathname)
            const reportIdMatch = window.location.pathname.match(/\/reports\/([^/]+)/)
            const reportId = reportIdMatch ? reportIdMatch[1] : null

            // Check if reportId is valid (session key format or UUID)
            if (reportId && (isSessionKey(reportId) || isUuid(reportId))) {
              // Check if client context already exists
              const { useClientContext } = await import('../stores/clientContext')
              const contextState = useClientContext.getState()

              if (!contextState.isActingAsClient) {
                generalLogger.debug(
                  `[Auth:${traceId}] Checking report for accountant_customer_id to restore context`
                )

                try {
                  const reportEndpoint = isSessionKey(reportId)
                    ? `${API_URL}/api/v2/valuations/reports/by-session/${reportId}`
                    : `${API_URL}/api/v2/valuations/reports/${reportId}`

                  const reportResponse = await fetchWithBySession404Retry(
                    reportEndpoint,
                    {
                      method: 'GET',
                      credentials: 'include',
                      headers: { Accept: 'application/json' },
                    },
                    {
                      perAttemptTimeoutMs: 8000,
                      log: (message, context) =>
                        generalLogger.debug(`[Auth:${traceId}] ${message}`, context),
                    }
                  )

                  if (reportResponse.ok) {
                    const reportData = await reportResponse.json()
                    const report = reportData.data || reportData
                    const accountantCustomerId = report.accountant_customer_id

                    if (accountantCustomerId) {
                      generalLogger.info(
                        `[Auth:${traceId}] Found accountant_customer_id in report, restoring client context`
                      )

                      // Initialize deferred promise for client context
                      initClientContextPromise()

                      const ctxAbort2 = new AbortController()
                      const ctxTimeout2 = setTimeout(() => ctxAbort2.abort(), 5000)
                      const contextResponse = await fetch(
                        `${API_URL}/api/v2/auth/get-client-context`,
                        {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ clientId: accountantCustomerId }),
                          signal: ctxAbort2.signal,
                        }
                      )
                      clearTimeout(ctxTimeout2)

                      if (contextResponse.ok) {
                        const context = await contextResponse.json()

                        // Validate context structure (clientUser null when invitation not accepted)
                        if (context.accountantUser && context.relationship) {
                          // Set client context in store
                          useClientContext.getState().setClientContext(context)

                          generalLogger.info(
                            `[Auth:${traceId}] Client context restored from report`
                          )
                          resolveClientContext()
                        } else {
                          generalLogger.warn(
                            `[Auth:${traceId}] Invalid client context structure from report`
                          )
                        }
                      } else {
                        const errorData = await contextResponse.json().catch(() => ({}))
                        generalLogger.warn(
                          `[Auth:${traceId}] Failed to fetch client context from report`,
                          {
                            message: errorData.message || contextResponse.status,
                          }
                        )
                      }
                    } else {
                      generalLogger.debug(
                        `[Auth:${traceId}] Report has no accountant_customer_id - not an accountant-client report`
                      )
                    }
                  } else {
                    // Report not found or access denied - this is OK, might be a new report
                    generalLogger.debug(
                      `[Auth:${traceId}] Report not found or inaccessible (${reportResponse.status}) - may be new report`
                    )
                  }
                } catch (error) {
                  generalLogger.warn(
                    `[Auth:${traceId}] Failed to restore client context from report (non-critical)`,
                    {
                      error: error instanceof Error ? error.message : String(error),
                    }
                  )
                  // Don't block auth - user is authenticated, just missing client context
                  // AuthGate will handle this gracefully
                }
              }
            }
          }

          return
        }
      }

      // ========================================================================
      // STEP 3: Token exchange (Subdomain auth handoff, <200ms)
      // ========================================================================
      const token = params.get('token')

      if (token) {
        try {
          const user = await exchangeToken(token)

          if (user) {
            trackAuthSuccess(user.id, 'token')
            authMetrics.recordSuccess()
            // AUTH-FIRST: Guest migration no longer needed
          }
        } catch (tokenError) {
          generalLogger.error('[Auth] Token exchange failed', {
            error: tokenError instanceof Error ? tokenError.message : String(tokenError),
          })
          trackAuthFailure(
            tokenError instanceof Error ? tokenError.message : 'Token exchange failed',
            { method: 'token-exchange' }
          )
          authMetrics.recordFailure()
        }

        // Clean URL after token exchange (success or failure)
        const url = new URL(window.location.href)
        url.searchParams.delete('token')
        window.history.replaceState({}, '', url.toString())

        return
      }

      // ========================================================================
      // STEP 4: AUTH-FIRST - No authentication found
      // ========================================================================
      // BootstrapProvider will handle redirect to login
      setUser(null)
      // Note: Not recording as success - user needs to authenticate
    } catch (error) {
      generalLogger.error(`[Auth:${traceId}] Initialization failed`, {
        error: error instanceof Error ? error.message : String(error),
      })
      logAuthError('Auth initialization failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      trackAuthFailure(error instanceof Error ? error.message : 'Initialization failed', {
        method: 'init',
      })
      authMetrics.recordFailure()

      // AUTH-FIRST: Clear user on error - BootstrapProvider will redirect to login
      setUser(null)
    } finally {
      generalLogger.info(`[Auth:${traceId}] Initialization complete`)
      setLoading(false)
      setIsInitializing(false)
      initCompleted = true
      initPromise = null
      if (useAuthStore.getState().user) {
        markInitSuccess()
      }
    }
  })()

  return initPromise
}

// Initialize on module load (browser only)
if (typeof window !== 'undefined') {
  initializeAuth()

  // Note: Auth watcher removed from here - handled by LogoutListener component
  // This prevents duplicate watchers and keeps logic in one place
}

/**
 * Helper to compute business card from user
 */
function getIndustry(user: User): string {
  if (user.industry) return user.industry

  const businessTypeToIndustry: Record<string, string> = {
    restaurant: 'hospitality',
    saas: 'technology',
    software: 'technology',
    ecommerce: 'retail',
    retail: 'retail',
    consulting: 'services',
    // Add more mappings as needed
  }

  return businessTypeToIndustry[user.business_type?.toLowerCase() || ''] || 'services'
}

function resolveBusinessCardCountry(user: User): string {
  const candidates = [user.firm_country_code, user.country]
  for (const candidate of candidates) {
    const normalized = candidate?.trim().toUpperCase()
    if (normalized === 'BE' || normalized === 'NL') {
      return normalized
    }
  }

  return 'BE'
}

/**
 * Infer employee count from range string
 * Phase 1.3: Enhanced inference using typical midpoints
 *
 * Maps common employee range strings to representative counts.
 * Uses midpoints for ranges, with special handling for open-ended ranges.
 *
 * @param range - Employee count range string (e.g., "10-50", "1-10", "500+")
 * @returns Inferred employee count or undefined if cannot parse
 */
function parseEmployeeCount(range?: string): number | undefined {
  if (!range) return undefined

  // Normalize the range string
  const normalized = range.trim().toLowerCase()

  // Map common range formats to representative values
  const rangeMap: Record<string, number> = {
    '1-10': 5,
    '10-50': 25,
    '11-25': 18,
    '26-50': 38,
    '50-100': 75,
    '51-100': 75,
    '100-500': 250,
    '101-500': 250,
    '500+': 750,
    '500-1000': 750,
    '1000+': 1500,
  }

  // Check for exact match in map
  if (rangeMap[normalized]) {
    return rangeMap[normalized]
  }

  // Try to parse as range (e.g., "10-50")
  const match = normalized.match(/(\d+)-(\d+)/)
  if (match) {
    const min = parseInt(match[1])
    const max = parseInt(match[2])
    return Math.floor((min + max) / 2)
  }

  // Try to parse as open-ended (e.g., "500+")
  const openMatch = normalized.match(/(\d+)\+/)
  if (openMatch) {
    const min = parseInt(openMatch[1])
    // For open-ended ranges, use 1.5x the minimum as estimate
    return Math.floor(min * 1.5)
  }

  return undefined
}

/**
 * Simple auth hook
 * Use this instead of useAuthStore directly
 * Provides backward compatible API
 */
export function useAuth() {
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)
  const error = useAuthStore((state) => state.error)
  const checkSession = useAuthStore((state) => state.checkSession)
  const exchangeToken = useAuthStore((state) => state.exchangeToken)
  const logout = useAuthStore((state) => state.logout)

  // Compute business card from user
  const businessCard =
    user && (user.company_name || user.business_type || user.industry)
      ? {
          company_name: user.company_name || 'Your Company',
          industry: getIndustry(user),
          business_model: user.business_type || 'other',
          founding_year:
            user.founded_year || new Date().getFullYear() - (user.years_in_operation || 5),
          country_code: resolveBusinessCardCountry(user),
          employee_count: parseEmployeeCount(user.employee_count_range),
          // Phase 1.1: Enhanced KBO registry fields
          kbo_number: user.kbo_number,
          vat_number: user.vat_number,
          city: user.city,
          postal_code: user.postal_code,
          legal_form: user.legal_form,
          nace_code: user.nace_code,
          nace_description: user.nace_description,
        }
      : null

  return {
    user,
    loading,
    isLoading: loading, // Backward compatible alias
    error,
    isAuthenticated: user !== null,
    businessCard,
    checkSession,
    exchangeToken,
    logout,
    refreshAuth: checkSession, // Alias for compatibility
    cookieHealth: null, // Removed complexity, always null
  }
}
