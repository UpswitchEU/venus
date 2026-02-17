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
import { getSessionSyncManager } from '../utils/auth/sessionSync'
import { getApiUrl } from '../utils/getMercuryUrl'

const API_URL = getApiUrl()
const CHECK_INTERVAL = 5 * 60 * 1000 // Check every 5 minutes (more frequent for proactive refresh)
const REFRESH_THRESHOLD = 0.8 // Refresh at 80% of TTL (proactive)

interface TokenPayload {
  sub: string
  email: string
  role: string
  iat: number
  exp?: number
}

interface RefreshOptions {
  onRefreshSuccess?: () => void
  onRefreshFailure?: (error: Error) => void
  onTokenExpired?: () => void
}

// Global refresh promise for mutex pattern (shared across all hook instances)
let globalRefreshPromise: Promise<boolean> | null = null

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
      // MUTEX PATTERN: If refresh already in progress globally, wait for it
      if (globalRefreshPromise) {
        console.log('Token refresh already in progress (global mutex), waiting...')
        return globalRefreshPromise
      }

      // Prevent concurrent refresh attempts in this component
      if (isRefreshingRef.current) {
        console.log('Token refresh already in progress (local), skipping...')
        return false
      }

      // Rate limiting: Don't attempt refresh more than once per minute
      const now = Date.now()
      if (now - lastRefreshAttemptRef.current < 60 * 1000) {
        console.log('Token refresh rate limited, skipping...')
        return false
      }

      isRefreshingRef.current = true
      lastRefreshAttemptRef.current = now

      // Create global refresh promise for mutex
      globalRefreshPromise = (async () => {
        try {
          console.log('🔄 Attempting to refresh access token (dual-token system)...')

          // Use local API proxy route which forwards to Titan with cookies
          const response = await axios.post(
            '/api/auth/refresh',
            {},
            {
              withCredentials: true, // Important: Include cookies (upswitch_refresh_token)
              timeout: 10000, // 10 second timeout
            }
          )

          // Backend returns new access_token + refresh_token in Set-Cookie headers
          if (response.data && response.data.user) {
            console.log('✅ Access token refreshed successfully (token rotation complete)')
            onRefreshSuccess?.()
            return true
          } else {
            throw new Error('Token refresh failed: Invalid response')
          }
        } catch (error: any) {
          console.error('❌ Token refresh failed:', error)

          // Handle different error cases
          if (error.response?.status === 401) {
            // Refresh token is invalid or expired - user needs to re-login
            console.warn('⚠️ Refresh token expired or invalid, user needs to re-login')
            onTokenExpired?.()
            return false
          }

          // Network error or server error - retry with exponential backoff
          if (retryCount < 3) {
            const delay = Math.pow(2, retryCount) * 1000 // 1s, 2s, 4s
            console.log(`Retrying token refresh in ${delay}ms (attempt ${retryCount + 1}/3)...`)

            await new Promise((resolve) => setTimeout(resolve, delay))
            return refreshToken(retryCount + 1)
          }

          // Max retries exceeded
          console.error('Token refresh failed after 3 attempts')
          onRefreshFailure?.(error)
          return false
        } finally {
          isRefreshingRef.current = false
          globalRefreshPromise = null // Clear global mutex when done
        }
      })()

      return globalRefreshPromise
    },
    [onRefreshSuccess, onRefreshFailure, onTokenExpired]
  )

  /**
   * Check if token needs refresh
   */
  const checkAndRefresh = useCallback(async () => {
    try {
      // Proactively refresh access token before it expires
      // Access tokens expire in 15 minutes, we check every 5 minutes
      console.log('🔄 Proactive token refresh check (dual-token system)...')
      await refreshToken()

      // Broadcast session refresh to other tabs AFTER successful refresh
      const syncManager = getSessionSyncManager()
      syncManager.broadcastSessionRefresh(window.location.hostname)
    } catch (error: any) {
      if (error.response?.status === 401) {
        // User is not authenticated, stop checking
        console.log('User not authenticated, stopping token refresh checks')
        onTokenExpired?.()

        // Clear interval
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      } else {
        // Network error, will retry on next interval
        console.warn('Auth check failed (network error), will retry:', error.message)
      }
    }
  }, [refreshToken, onTokenExpired])

  /**
   * Start token refresh checks
   */
  useEffect(() => {
    console.log(
      '🔐 Starting token refresh checks (interval: 5 minutes, access token TTL: 15 minutes)'
    )

    // Initial check after 5 seconds (give app time to initialize)
    const initialTimeout = setTimeout(() => {
      checkAndRefresh()
    }, 5000)

    // Set up periodic checks
    intervalRef.current = setInterval(() => {
      checkAndRefresh()
    }, CHECK_INTERVAL)

    // Cleanup
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
      clearTimeout(initialTimeout)
      console.log('🔐 Stopped token refresh checks')
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
    // MUTEX PATTERN: If refresh already in progress globally, wait for it
    if (globalRefreshPromise) {
      console.log('Token refresh already in progress (global mutex), waiting...')
      return globalRefreshPromise
    }

    if (isRefreshingRef.current) {
      console.log('Token refresh already in progress (local)')
      return false
    }

    isRefreshingRef.current = true

    // Create global refresh promise for mutex
    globalRefreshPromise = (async () => {
      try {
        // Use local API proxy route which forwards to Titan with cookies
        const response = await axios.post(
          '/api/auth/refresh',
          {},
          {
            withCredentials: true, // Include upswitch_refresh_token cookie
            timeout: 10000,
          }
        )

        // Backend returns new access_token + refresh_token in Set-Cookie headers
        if (response.data && response.data.user) {
          console.log('✅ Manual token refresh successful (dual-token rotation complete)')
          return true
        } else {
          throw new Error('Token refresh failed: Invalid response')
        }
      } catch (error) {
        console.error('❌ Manual token refresh failed:', error)
        return false
      } finally {
        isRefreshingRef.current = false
        globalRefreshPromise = null // Clear global mutex when done
      }
    })()

    return globalRefreshPromise
  }, [])

  return {
    refreshToken,
    isRefreshing: isRefreshingRef.current,
  }
}
