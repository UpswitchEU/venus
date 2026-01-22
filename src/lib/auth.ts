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
import type { User } from '../contexts/AuthContextTypes'
import { authMetrics, logAuthError, trackAuthFailure, trackAuthSuccess } from './authLogger'

// Backend API URL
const API_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://api.upswitch.app'

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

function clearAuthCache(): void {
  authCache = null
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
    console.log('[Auth] Reusing cached request:', key)
    return cached as Promise<T>
  }

  const promise = factory()
    .finally(() => {
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
        console.log('[Security] Sanitized URL parameters:', paramsToRemove)
      }
    }
  } catch (error) {
    console.error('[Security] URL sanitization failed:', error)
  }
}

/**
 * Promise cache for in-flight auth checks - Prevents race conditions
 * Following Mercury's pattern for concurrent request deduplication
 */
let checkSessionPromise: Promise<User | null> | null = null

/**
 * Promise cache for in-flight refresh calls - Prevents race conditions
 * Multiple components might try to refresh simultaneously when token expires
 */
let refreshPromise: Promise<boolean> | null = null

/**
 * Promise cache for initialization - Prevents multiple simultaneous initializations
 */
let initPromise: Promise<void> | null = null

/**
 * BANK GRADE FIX: Client Context Initialization Tracking
 * Prevents race conditions where API requests fire before client context is loaded
 * Following Stripe/Klarna patterns for initialization gates
 */
let clientContextInitialized = false
let clientContextPromise: Promise<void> | null = null

/**
 * Check if client context initialization is complete
 * Used by HTTP interceptor to determine if guest session tracking is needed
 */
export function isClientContextReady(): boolean {
  return clientContextInitialized
}

/**
 * Wait for client context initialization to complete
 * Returns immediately if no client context is being loaded
 * Used by HTTP interceptor to prevent race conditions
 */
export function waitForClientContext(): Promise<void> {
  return clientContextPromise || Promise.resolve()
}

/**
 * Auth state interface
 */
interface AuthState {
  user: User | null
  loading: boolean
  error: string | null

  // Actions
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  checkSession: () => Promise<User | null>
  exchangeToken: (token: string) => Promise<User | null>
  logout: () => void
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

      // Set user
      setUser: (user: User | null) => {
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

      // Check session with cookie (supports dual-token system with auto-refresh)
      checkSession: async (): Promise<User | null> => {
        // CRITICAL: Check cache first (like Mercury)
        const cached = getAuthCache()
        if (cached) {
          set({ user: cached, loading: false, error: null })
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
            const response = await fetch('/api/auth/me', {
              method: 'GET',
              credentials: 'include', // Send cookies (upswitch_access_token, upswitch_refresh_token)
              headers: {
                Accept: 'application/json',
              },
            })

            // If access token expired (401), try to refresh automatically
            if (response.status === 401) {
              // CRITICAL: Deduplicate concurrent refresh attempts
              // If already refreshing, wait for that promise
              if (!refreshPromise) {
                refreshPromise = (async () => {
                  try {
                    // Use local API proxy route which forwards to Titan with cookies
                    const refreshResponse = await fetch('/api/auth/refresh', {
                      method: 'POST',
                      credentials: 'include', // Send refresh token cookie
                      headers: {
                        Accept: 'application/json',
                      },
                    })

                    if (!refreshResponse.ok) {
                      const errorData = await refreshResponse.json().catch(() => ({}))
                      const errorMessage = errorData.message || 'Token refresh failed'

                      // Classify error for better handling
                      if (refreshResponse.status === 401 || refreshResponse.status === 403) {
                        // Refresh token expired - user needs to re-login
                        logAuthError('Token refresh failed - refresh token expired', {
                          status: refreshResponse.status,
                          message: errorMessage,
                        })
                        return false
                      }

                      // Other errors - might be temporary
                      logAuthError('Token refresh failed - server error', {
                        status: refreshResponse.status,
                        message: errorMessage,
                      })
                      return false
                    }

                    return true
                  } catch (refreshError) {
                    // Network error during refresh
                    logAuthError('Token refresh failed - network error', {
                      error:
                        refreshError instanceof Error ? refreshError.message : String(refreshError),
                    })
                    return false
                  } finally {
                    // Clear promise cache after completion
                    refreshPromise = null
                  }
                })()
              }

              const refreshSuccess = await refreshPromise

              if (refreshSuccess) {
                // Retry with new access token
                // Use Venus proxy route for same-origin request (no CORS issues)
                const retryResponse = await fetch('/api/auth/me', {
                  method: 'GET',
                  credentials: 'include',
                  headers: {
                    Accept: 'application/json',
                  },
                })

                if (retryResponse.ok) {
                  const data = await retryResponse.json()
                  const user = data.success ? data.data?.user || data.data : data.user || data

                  if (user) {
                    get().setUser(user)
                    trackAuthSuccess(user.id, 'cookie')
                    authMetrics.recordSuccess()
                    // Cache successful auth result
                    setAuthCache(user)

                    // Clear any previous errors
                    get().setError(null)

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
            }

            if (response.ok) {
              const data = await response.json()
              // Handle different response formats (Mercury wraps, Titan returns directly)
              const user = data.success ? data.data?.user || data.data : data.user || data

              if (user) {
                get().setUser(user)
                trackAuthSuccess(user.id, 'cookie')
                authMetrics.recordSuccess()

                // AUTH-FIRST: Guest migration no longer needed
                // Cache successful auth result (like Mercury)
                setAuthCache(user)

                // Broadcast login event to other tabs ONLY if this is a new login
                // (not just a session check - avoid unnecessary broadcasts)
                const previousUser = useAuthStore.getState().user
                if (
                  typeof window !== 'undefined' &&
                  (!previousUser || previousUser.id !== user.id)
                ) {
                  try {
                    const { broadcastLogin } = await import('../utils/auth/cross-domain-logout')
                    broadcastLogin()
                  } catch (error) {
                    // Non-fatal
                  }
                }

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

            get().setError(errorMessage)
            get().setUser(null)
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

          get().setError('Invalid authentication token')
          get().setUser(null)
          return null
        }
      },

      // Logout (clears cookies and state) - Idempotent and race-condition safe
      logout: async () => {
        // Idempotency check - prevent concurrent logout calls
        if (get().loading === false && !get().user) {
          // Already logged out, skip
          return
        }

        try {
          // 1. Clear local state IMMEDIATELY (optimistic UI)
          set({ user: null, loading: false, error: null })
          clearAuthCache()

          // Clear client context on logout
          import('../stores/clientContext').then(({ useClientContext }) => {
            useClientContext.getState().clearClientContext()
          }).catch(() => {
            // Non-critical
          })

          // CRITICAL: Clear all promise caches to prevent stale auth state
          checkSessionPromise = null
          refreshPromise = null
          // Note: Don't clear initPromise - it's fine to let it complete

          // 2. Clear localStorage/sessionStorage
          if (typeof window !== 'undefined') {
            localStorage.removeItem('upswitch_has_session')
            localStorage.removeItem('upswitch_user')
            sessionStorage.clear()
          }

          // 3. Call backend to clear cookies (AWAIT it properly)
          await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'include',
            headers: { Accept: 'application/json' },
          })

          // 4. Broadcast to same-origin tabs AFTER backend succeeds
          if (typeof window !== 'undefined') {
            const { broadcastLogout } = await import('../utils/auth/cross-domain-logout')
            broadcastLogout()
          }

          // DO NOT clear cookies client-side (server does it with HttpOnly)
          // DO NOT use setTimeout (use proper await)
        } catch (error) {
          console.warn('[Venus Auth] Logout failed (non-fatal):', error)

          // Still broadcast logout on error (graceful degradation)
          if (typeof window !== 'undefined') {
            try {
              const { broadcastLogout } = await import('../utils/auth/cross-domain-logout')
              broadcastLogout()
            } catch (broadcastError) {
              // Non-fatal
            }
          }

          // State already cleared, user can continue
        }

        // Track logout
        authMetrics.recordLogout()
      },
    }),
    { name: 'AuthStore' }
  )
)

/**
 * Initialize authentication
 * Called once on app load
 * Prevents race conditions by deduplicating concurrent initialization calls
 */
async function initializeAuth(): Promise<void> {
  // CRITICAL: Deduplicate concurrent initialization calls
  // If already initializing, return the existing promise
  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    const { setLoading, checkSession, exchangeToken, setUser } = useAuthStore.getState()

    // Minimal logging (errors only)

    try {
      setLoading(true)

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

      if (returnUrl) {
        // Store in sessionStorage for later use when user wants to return
        sessionStorage.setItem('upswitch_return_url', returnUrl)
        if (sourceApp) {
          sessionStorage.setItem('upswitch_source', sourceApp)
        }
        // Silent - only log in development
        if (process.env.NODE_ENV === 'development') {
          console.log('[Auth] Return URL captured:', {
            returnUrl,
            source: sourceApp,
          })
        }
      }

      if (clientToken) {
        // Validate token format before attempting exchange
        if (clientToken.length < 20 || !/^[A-Za-z0-9._-]+$/.test(clientToken)) {
          // Silent - only log in development
          if (process.env.NODE_ENV === 'development') {
            console.warn('[Auth] Invalid client token format:', {
              length: clientToken.length,
              preview: clientToken.substring(0, 10) + '...',
            })
          }
          // Continue to normal auth flow - don't block user
          // SECURITY: Clean up invalid token and sensitive parameters from URL
          sanitizeUrl(['clientToken', 'client_id', 'prefilledQuery', 'autoSend'])
        } else {
          // BANK GRADE FIX: Wrap client context exchange in promise for race condition prevention
          clientContextPromise = (async () => {
            try {
              // SECURITY: Extract token, then IMMEDIATELY sanitize URL
              // This prevents token from being logged in analytics/history
              const tokenForExchange = clientToken
              
              // CRITICAL: Strip ALL sensitive params before exchange
              sanitizeUrl([
                'clientToken',      // JWT contains sensitive claims
                'client_id',        // UUID exposure
                'prefilledQuery',   // Business name exposure
                'autoSend',         // Behavioral data
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

                    // Validate context structure
                    if (!context.accountantUser || !context.clientUser || !context.relationship) {
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

                    // BANK GRADE FIX: Mark initialization as complete
                    clientContextInitialized = true

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
                      console.warn(`[Auth] Client context exchange failed, retrying in ${delay}ms...`, {
                        attempt: attempt + 1,
                        maxRetries,
                        error: lastError.message,
                      })
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
              // BANK GRADE FIX: Mark as failed (not initialized)
              clientContextInitialized = false
              throw error
            }
          })()
          
          // BANK GRADE FIX: Await the client context exchange before proceeding
          // This ensures client context is fully loaded before any API requests are made
          try {
            await clientContextPromise
          } catch (error) {
            // Client context exchange failed - log and continue to normal auth flow
            const lastError = error instanceof Error ? error : new Error(String(error))
            console.error('[Auth] Client context exchange failed after retries:', lastError)

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
          console.error('[Auth] Token exchange failed:', tokenError)
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
      console.error('[Auth] Initialization failed:', error)
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
      setLoading(false)
      // CRITICAL: Clear promise cache after completion
      initPromise = null
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
          country_code: user.country || 'BE',
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
