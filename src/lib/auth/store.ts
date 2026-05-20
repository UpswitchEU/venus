import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { User } from '../../contexts/AuthContextTypes'
import { useClientContext } from '../../stores/clientContext'
import { removeAuthRelatedSessionStorageKeys } from '../../utils/auth/clear-auth-session-storage'
import { broadcastLogout as broadcastLogoutNow } from '../../utils/auth/cross-domain-logout'
import {
  clearLastRefreshAt,
  markRefreshCompleted,
  wasRefreshedRecently,
} from '../../utils/auth/cross-tab-refresh'
import { getLogoutAbortSignal, triggerLogoutAbort } from '../../utils/auth/logout-abort'
import { extractAuthMeUserPayload } from '../../utils/auth/parse-auth-me-response'
import { getActiveRefreshPromise, setActiveRefreshPromise } from '../../utils/auth/refreshMutex'
import {
  CLIENT_AUTH_REFRESH_FETCH_TIMEOUT_MS,
  fetchWithTimeoutClient,
} from '../../utils/auth-fetch-timeout'
import { generalLogger } from '../../utils/logger'
import { authMetrics, logAuthError, trackAuthFailure, trackAuthSuccess } from '../authLogger'
import { clearAuthCache, getAuthCache, setAuthCache } from './authCache'
import { API_URL } from './config'
import { clearInitThrottle } from './initGuards'
import { resetAuthInitializationRuntime } from './initRuntime'

interface AuthState {
  user: User | null
  loading: boolean
  error: string | null
  /**
   * Tracks when initializeAuth() is running. AuthGate waits for both
   * loading=false and isInitializing=false before checking client context.
   */
  isInitializing: boolean
  /**
   * Tracks when token refresh is in flight (401 -> refresh -> retry).
   */
  isRefreshing: boolean
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setIsInitializing: (isInitializing: boolean) => void
  setIsRefreshing: (isRefreshing: boolean) => void
  checkSession: () => Promise<User | null>
  exchangeToken: (token: string) => Promise<User | null>
  logout: (options?: { postLogoutUrl?: string }) => void
}

let checkSessionPromise: Promise<User | null> | null = null
let venusLogoutNavigationPending = false

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
    const { broadcastLogin } = await import('../../utils/auth/cross-domain-logout')
    broadcastLogin()
  } catch {
    /* non-fatal */
  }
}

export const useAuthStore = create<AuthState>()(
  devtools(
    (set, get) => ({
      user: null,
      loading: true,
      error: null,
      isInitializing: true,
      isRefreshing: false,

      setUser: (user: User | null) => {
        const prior = get().user
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

      setLoading: (loading: boolean) => {
        set({ loading })
      },

      setError: (error: string | null) => {
        set({ error, loading: false })
      },

      setIsInitializing: (isInitializing: boolean) => {
        set({ isInitializing })
      },

      setIsRefreshing: (isRefreshing: boolean) => {
        set({ isRefreshing })
      },

      checkSession: async (): Promise<User | null> => {
        if (typeof window !== 'undefined' && window.__isLoggingOut) {
          return null
        }

        const cached = getAuthCache()
        if (cached) {
          set({ user: cached, error: null })
          return cached
        }

        if (checkSessionPromise) {
          return checkSessionPromise
        }

        checkSessionPromise = (async () => {
          try {
            const response = await fetchWithTimeoutClient('/api/auth/me', {
              method: 'GET',
              credentials: 'include',
              headers: {
                Accept: 'application/json',
              },
              signal: getLogoutAbortSignal(),
            })

            if (abortCheckSessionIfLoggingOut()) return null

            if (response.status === 401) {
              if (abortCheckSessionIfLoggingOut()) return null
              get().setIsRefreshing(true)

              try {
                if (!getActiveRefreshPromise()) {
                  const promise = (async () => {
                    try {
                      if (wasRefreshedRecently()) {
                        return true
                      }

                      const refreshResponse = await fetchWithTimeoutClient('/api/auth/refresh', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { Accept: 'application/json' },
                        signal: getLogoutAbortSignal(),
                        timeoutMs: CLIENT_AUTH_REFRESH_FETCH_TIMEOUT_MS,
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

                const activeRefreshPromise = getActiveRefreshPromise()
                const refreshSuccess = activeRefreshPromise ? await activeRefreshPromise : false

                if (abortCheckSessionIfLoggingOut()) return null

                if (refreshSuccess) {
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
                    const user = extractAuthMeUserPayload(data) as User | null

                    if (user) {
                      if (abortCheckSessionIfLoggingOut()) return null
                      const priorUserId = get().user?.id ?? null
                      get().setUser(user)
                      trackAuthSuccess(user.id, 'cookie')
                      authMetrics.recordSuccess()
                      setAuthCache(user)
                      get().setError(null)

                      await broadcastLoginIfNewSession(user, priorUserId)
                      return user
                    }
                  } else {
                    logAuthError('Auth check failed after token refresh', {
                      status: retryResponse.status,
                    })
                  }
                } else {
                  logAuthError('Token refresh failed - authentication required', {})
                }

                get().setUser(null)
                clearAuthCache()

                return null
              } finally {
                get().setIsRefreshing(false)
              }
            }

            if (response.ok) {
              const data = await response.json()
              const user = extractAuthMeUserPayload(data) as User | null

              if (user) {
                if (abortCheckSessionIfLoggingOut()) return null
                const priorUserId = get().user?.id ?? null
                get().setUser(user)
                trackAuthSuccess(user.id, 'cookie')
                authMetrics.recordSuccess()
                setAuthCache(user)

                await broadcastLoginIfNewSession(user, priorUserId)

                return user
              }
            }

            get().setUser(null)
            clearAuthCache()
            return null
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Network error'
            logAuthError('Session check failed', { error: errorMessage })
            trackAuthFailure(errorMessage, { method: 'cookie' })
            authMetrics.recordFailure()

            get().setUser(null)
            get().setError(errorMessage)
            clearAuthCache()
            return null
          } finally {
            checkSessionPromise = null
          }
        })()

        return checkSessionPromise
      },

      exchangeToken: async (token: string): Promise<User | null> => {
        try {
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

          get().setUser(null)
          get().setError('Invalid authentication token')
          return null
        }
      },

      logout: (options?: { postLogoutUrl?: string }) => {
        if (typeof window === 'undefined') return
        if (venusLogoutNavigationPending) return
        venusLogoutNavigationPending = true
        window.__isLoggingOut = true

        triggerLogoutAbort()

        try {
          set({ user: null, loading: false, error: null })
          clearAuthCache()

          checkSessionPromise = null
          setActiveRefreshPromise(null)
          resetAuthInitializationRuntime()
          clearInitThrottle()

          localStorage.removeItem('upswitch_has_session')
          localStorage.removeItem('upswitch_user')
          clearLastRefreshAt()
          removeAuthRelatedSessionStorageKeys()

          try {
            broadcastLogoutNow()
          } catch {
            /* non-fatal */
          }

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

          try {
            window.dispatchEvent(new Event('upswitch-logout-cookies-cleared'))
          } catch {
            /* ignore */
          }

          const url = new URL('/api/auth/logout', window.location.origin)
          url.searchParams.set('fallback', '1')
          if (options?.postLogoutUrl) {
            url.searchParams.set('post_logout', options.postLogoutUrl)
          }
          window.location.assign(url.toString())

          import('../../stores/clientContext')
            .then(({ useClientContext }) => {
              useClientContext.getState().clearClientContext()
            })
            .catch(() => undefined)

          import('../bootstrap/SessionBootstrapService')
            .then(({ bootstrapService }) => {
              bootstrapService.clearCache()
            })
            .catch(() => undefined)

          import('../../components/AuthGate')
            .then(({ resetAuthGateGuard }) => {
              resetAuthGateGuard()
            })
            .catch(() => undefined)

          import('../bootstrap/BootstrapProvider')
            .then(({ resetBootstrapGuard }) => {
              resetBootstrapGuard()
            })
            .catch(() => undefined)

          import('../../services/session/SessionEngineFactory')
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
