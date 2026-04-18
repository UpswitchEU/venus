/**
 * Token Refresh Hook (Valuation Tester)
 *
 * Automatically refreshes JWT tokens before they expire to ensure
 * users are never logged out unexpectedly
 *
 * Dual-Token System:
 * - Access Token: 15 minutes (used for API authentication)
 * - Refresh Token: 7 days (used to get new access token)
 * - Both tokens are HTTP-only cookies on domain .upswitch.app
 *
 * Strategy:
 * - Proactive refresh every 5 minutes (before 15min access token expires)
 * - Background refresh without user interruption
 * - Silent refresh with exponential backoff
 * - Token rotation: Each refresh returns new access + refresh tokens
 * - Fallback to re-login if refresh token is invalid/expired
 */

import axios from 'axios'
import { useCallback, useEffect, useRef } from 'react'
import { useAuthStore } from '../lib/auth'
import {
  markRefreshCompleted,
  RECENT_REFRESH_WINDOW_MS,
  subscribeRefreshCompleted,
  wasRefreshedRecently,
} from '../utils/auth/cross-tab-refresh'
import { getLogoutAbortSignal } from '../utils/auth/logout-abort'
import { getActiveRefreshPromise, setActiveRefreshPromise } from '../utils/auth/refreshMutex'
import { getSessionSyncManager } from '../utils/auth/sessionSync'
import { CLIENT_AUTH_REFRESH_FETCH_TIMEOUT_MS } from '../utils/auth-fetch-timeout'
import { generalLogger } from '../utils/logger'

const CHECK_INTERVAL = 5 * 60 * 1000
/** Spread interval fires across tabs to make thundering-herd refresh impossible. */
const CHECK_INTERVAL_JITTER_MS = 30_000

function jitteredInterval(): number {
  return CHECK_INTERVAL + Math.floor(Math.random() * CHECK_INTERVAL_JITTER_MS)
}

interface RefreshOptions {
  onRefreshSuccess?: () => void
  onRefreshFailure?: (error: Error) => void
  onTokenExpired?: () => void
}

export const useTokenRefresh = (options: RefreshOptions = {}) => {
  const { onRefreshSuccess, onRefreshFailure, onTokenExpired } = options

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isRefreshingRef = useRef(false)
  const lastRefreshAttemptRef = useRef<number>(0)

  /**
   * Refresh token with exponential backoff and mutex pattern
   * Mutex ensures only one refresh happens at a time across all tabs/components
   */
  const refreshToken = useCallback(
    async (retryCount = 0): Promise<boolean> => {
      if (typeof window !== 'undefined' && window.__isLoggingOut) {
        return false
      }
      // MUTEX: if a refresh is already in-flight (from here OR from checkSession),
      // wait for it instead of sending a duplicate request.
      const existing = getActiveRefreshPromise()
      if (existing) {
        return existing
      }

      if (isRefreshingRef.current) {
        return false
      }

      const now = Date.now()
      if (now - lastRefreshAttemptRef.current < 60 * 1000) {
        return false
      }

      // Cross-tab dedup: if any other tab refreshed inside the recency
      // window, the rotated cookies are already in the shared `.upswitch.app`
      // jar. Skip our attempt so we don't race the now-rotated refresh token.
      if (wasRefreshedRecently()) {
        lastRefreshAttemptRef.current = now
        return true
      }

      isRefreshingRef.current = true
      lastRefreshAttemptRef.current = now

      const promise = (async () => {
        try {
          const response = await axios.post(
            '/api/auth/refresh',
            {},
            {
              withCredentials: true,
              timeout: CLIENT_AUTH_REFRESH_FETCH_TIMEOUT_MS,
              // Abort if logout fires; otherwise the response Set-Cookie
              // would write rotated tokens AFTER cookies were cleared.
              signal: getLogoutAbortSignal(),
            }
          )

          const user = response.data?.user ?? response.data?.data?.user
          const success = response.data?.success === true || !!user
          if (success) {
            markRefreshCompleted()
            onRefreshSuccess?.()
            return true
          } else {
            throw new Error('Token refresh failed: Invalid response')
          }
        } catch (error: any) {
          generalLogger.error('Token refresh failed', { error })

          if (error.response?.status === 401 || error.response?.status === 403) {
            const { isInitializing, loading } = useAuthStore.getState()
            if (isInitializing || loading) {
              generalLogger.debug(
                'Token refresh 401 during auth init — deferring to initializeAuth()'
              )
              return false
            }
            if (typeof window !== 'undefined' && window.__isLoggingOut) {
              return false
            }
            // Refresh token truly expired. Clear auth state IMMEDIATELY and
            // stop the polling interval. Waiting for a subsequent /me call
            // allowed UI to keep showing a logged-in shell while background
            // fetches piled up against an expired session.
            generalLogger.warn('Refresh token expired or invalid, user needs to re-login')
            try {
              useAuthStore.setState({ user: null, error: null })
            } catch {
              /* non-fatal */
            }
            if (intervalRef.current) {
              clearInterval(intervalRef.current)
              intervalRef.current = null
            }
            onTokenExpired?.()
            return false
          }

          if (retryCount < 3) {
            const delay = Math.pow(2, retryCount) * 1000
            generalLogger.debug(
              `Retrying token refresh in ${delay}ms (attempt ${retryCount + 1}/3)`
            )
            await new Promise((resolve) => setTimeout(resolve, delay))
            return refreshToken(retryCount + 1)
          }

          generalLogger.error('Token refresh failed after 3 attempts')
          onRefreshFailure?.(error)
          return false
        } finally {
          isRefreshingRef.current = false
          setActiveRefreshPromise(null)
        }
      })()

      setActiveRefreshPromise(promise)
      return promise
    },
    [onRefreshSuccess, onRefreshFailure, onTokenExpired]
  )

  /**
   * Check if token needs refresh
   */
  const checkAndRefresh = useCallback(async () => {
    if (typeof window !== 'undefined' && window.__isLoggingOut) {
      return
    }
    try {
      // Proactively refresh access token before it expires
      // Access tokens expire in 15 minutes, we check every 5 minutes
      generalLogger.debug('Proactive token refresh check (dual-token system)')
      const ok = await refreshToken()
      if (!ok) {
        return
      }

      // Broadcast session refresh to other tabs only after a successful rotation
      const syncManager = getSessionSyncManager()
      syncManager.broadcastSessionRefresh(window.location.hostname)
    } catch (error: any) {
      if (error.response?.status === 401) {
        // User is not authenticated, stop checking
        generalLogger.debug('User not authenticated, stopping token refresh checks')
        onTokenExpired?.()

        // Clear interval
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } else {
        // Network error, will retry on next interval
        generalLogger.warn('Auth check failed (network error), will retry', {
          error: error.message,
        })
      }
    }
  }, [refreshToken, onTokenExpired])

  /**
   * Start token refresh checks
   */
  useEffect(() => {
    generalLogger.debug(
      'Starting token refresh checks (initial: 60s, interval: 5 min, access token TTL: 15 min)'
    )

    // Initial check after 60s. On a fresh page load the access token was
    // just validated by initializeAuth(), so refreshing immediately is
    // wasteful and dangerous: a 401 from the refresh endpoint would trigger
    // onTokenExpired → redirect to Mercury → Mercury redirects back → loop.
    const initialTimeout = setTimeout(() => {
      const { isInitializing, loading } = useAuthStore.getState()
      if (isInitializing || loading) {
        generalLogger.debug('Deferring initial token refresh — auth still initializing')
        return
      }
      checkAndRefresh()
    }, 60_000)

    // Set up periodic checks (jittered so multi-tab fires spread out)
    intervalRef.current = setInterval(() => {
      checkAndRefresh()
    }, jitteredInterval())

    // When another tab refreshes, treat that as a successful refresh here
    // so our 60s-spam guard and the cross-tab window both shift correctly.
    const unsubscribeBroadcast = subscribeRefreshCompleted((at) => {
      lastRefreshAttemptRef.current = at
    })

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      clearTimeout(initialTimeout)
      unsubscribeBroadcast()
      generalLogger.debug('Stopped token refresh checks')
    }
  }, [checkAndRefresh])

  // Return refresh function for manual triggering
  return {
    refreshToken,
    isRefreshing: isRefreshingRef.current,
  }
}

/**
 * Hook for manually refreshing token
 * Useful for "Refresh Session" buttons or triggered refresh
 *
 * Dual-Token System: Sends upswitch_refresh_token cookie to get new
 * upswitch_access_token and upswitch_refresh_token (token rotation)
 */
export const useManualTokenRefresh = () => {
  const isRefreshingRef = useRef(false)

  const refreshToken = useCallback(async (): Promise<boolean> => {
    if (typeof window !== 'undefined' && window.__isLoggingOut) {
      return false
    }
    const existing = getActiveRefreshPromise()
    if (existing) {
      generalLogger.debug('Token refresh already in progress (shared mutex), waiting')
      return existing
    }

    if (isRefreshingRef.current) {
      generalLogger.debug('Token refresh already in progress (local)')
      return false
    }

    isRefreshingRef.current = true

    const promise = (async () => {
      try {
        const response = await axios.post(
          '/api/auth/refresh',
          {},
          {
            withCredentials: true,
            timeout: CLIENT_AUTH_REFRESH_FETCH_TIMEOUT_MS,
            signal: getLogoutAbortSignal(),
          }
        )

        const user = response.data?.user ?? response.data?.data?.user
        const success = response.data?.success === true || !!user
        if (success) {
          markRefreshCompleted()
          generalLogger.debug('Manual token refresh successful (dual-token rotation complete)')
          return true
        } else {
          throw new Error('Token refresh failed: Invalid response')
        }
      } catch (error) {
        generalLogger.error('Manual token refresh failed', { error })
        return false
      } finally {
        isRefreshingRef.current = false
        setActiveRefreshPromise(null)
      }
    })()

    setActiveRefreshPromise(promise)
    return promise
  }, [])

  return {
    refreshToken,
    isRefreshing: isRefreshingRef.current,
  }
}
