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
 * Flow:
 * 1. Check cookie (sync) → If exists, verify with backend
 * 2. Check token in URL → Exchange for cookie
 * 3. Guest mode → Continue without auth
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
              'Accept': 'application/json',
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
                  'Accept': 'application/json',
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
                    error: refreshError instanceof Error ? refreshError.message : String(refreshError),
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
                    'Accept': 'application/json',
                  },
                })
                
                if (retryResponse.ok) {
                  const data = await retryResponse.json()
                const user = data.success ? (data.data?.user || data.data) : data.user || data
                  
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
              // Refresh failed - clear auth state gracefully
              logAuthError('Token refresh failed, falling back to guest mode', {})
            }
            
            // Refresh failed or retry failed - user is not authenticated
            // Graceful fallback: clear user but don't show error (allows guest mode)
            get().setUser(null)
            clearAuthCache()
            
            // Only set error if it's not a normal expiration (401 is expected when not logged in)
            // Don't show error for guest users
            return null
          }

          if (response.ok) {
            const data = await response.json()
            // Handle different response formats (Mercury wraps, Titan returns directly)
            const user = data.success ? (data.data?.user || data.data) : data.user || data
            
            if (user) {
              get().setUser(user)
              trackAuthSuccess(user.id, 'cookie')
              authMetrics.recordSuccess()
              
              // CRITICAL: Check if we need to migrate guest data
              // This handles case where user navigates directly to subdomain while already logged in
              try {
                const { useGuestSessionStore } = await import('../store/useGuestSessionStore')
                const { getSessionId, clearSession } = useGuestSessionStore.getState()
                const guestSessionId = getSessionId()
                
                if (guestSessionId) {
                  const { backendAPI } = await import('../services/backendApi')
                  await backendAPI.migrateGuestData(guestSessionId)
                  clearSession()
                }
              } catch (migrationError) {
                // Non-fatal - don't block authentication
                console.warn('[Auth] Guest migration check failed (non-fatal):', migrationError)
              }
              
              // Cache successful auth result (like Mercury)
              setAuthCache(user)
              
              // Broadcast login event to other tabs ONLY if this is a new login
              // (not just a session check - avoid unnecessary broadcasts)
              const previousUser = useAuthStore.getState().user
              if (typeof window !== 'undefined' && (!previousUser || previousUser.id !== user.id)) {
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
          
          // No active session - not an error, just guest mode
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
          return;
        }

        try {
          // 1. Clear local state IMMEDIATELY (optimistic UI)
          set({ user: null, loading: false, error: null })
          clearAuthCache()
          
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
            headers: { 'Accept': 'application/json' },
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
    // STEP 1: Cookie-based auth (Primary method, <50ms)
    // ========================================================================
    // Note: We always check the session with the backend because HttpOnly cookies
    // are invisible to JavaScript. The browser automatically sends them in requests.
    const user = await checkSession()
    
    if (user) {
      trackAuthSuccess(user.id, 'cookie')
      authMetrics.recordSuccess()
      return
    }

    // ========================================================================
    // STEP 2: Client Context Token Exchange (Accountant → Client handoff)
    // Enhanced with validation, retry logic, and better error handling
    // ========================================================================
    const params = new URLSearchParams(window.location.search)
    const clientToken = params.get('clientToken')
    
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
      if (clientToken.length < 20 || !/^[A-Za-z0-9_-]+$/.test(clientToken)) {
        // Silent - only log in development
        if (process.env.NODE_ENV === 'development') {
          console.warn('[Auth] Invalid client token format:', {
            length: clientToken.length,
            preview: clientToken.substring(0, 10) + '...',
          })
        }
        // Continue to normal auth flow - don't block user
        // Just clean up invalid token from URL
        const url = new URL(window.location.href)
        url.searchParams.delete('clientToken')
        window.history.replaceState({}, '', url.toString())
      } else {
        // Attempt exchange with retry logic
        let lastError: Error | null = null
        const maxRetries = 3
        const baseDelay = 500 // 500ms base delay
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(`${API_URL}/api/v2/auth/exchange-client-context`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token: clientToken }),
        })
        
        if (response.ok) {
          const context = await response.json()
              
              // Validate context structure
              if (!context.accountantUser || !context.clientUser || !context.relationship) {
                throw new Error('Invalid client context structure received')
              }
          
          // Set client context
          const { useClientContext } = await import('../stores/clientContext')
          useClientContext.getState().setClientContext(context)
          
          // Set auth user (accountant)
          const user = await checkSession()
          if (user) {
            setUser(user)
            
            // Clean URL but preserve prefilledQuery parameter for HomePage
            const url = new URL(window.location.href)
            url.searchParams.delete('clientToken')
            // Preserve prefilledQuery if present (used by HomePage)
            if (!url.searchParams.has('prefilledQuery')) {
              // Only clean URL completely if no prefilledQuery
              window.history.replaceState({}, '', url.pathname + (url.search || ''))
            } else {
              window.history.replaceState({}, '', url.toString())
            }
            
                return
              } else {
                throw new Error('Failed to authenticate after client context exchange')
              }
            } else {
              // Handle specific error cases
              const errorData = await response.json().catch(() => ({}))
              const status = response.status
              
              if (status === 401 || status === 403) {
                // Token expired or invalid - don't retry
                throw new Error(errorData.message || 'Client context token expired or invalid. Please try creating a new valuation.')
              } else if (status >= 500 && attempt < maxRetries - 1) {
                // Server error - retry with exponential backoff
                const delay = baseDelay * Math.pow(2, attempt)
                await new Promise(resolve => setTimeout(resolve, delay))
                continue
              } else {
                throw new Error(errorData.message || `Failed to exchange client context token (${status})`)
              }
            }
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error))
            
            // Don't retry on validation errors or auth errors
            if (lastError.message.includes('expired') || 
                lastError.message.includes('invalid') ||
                lastError.message.includes('Invalid client context')) {
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
              await new Promise(resolve => setTimeout(resolve, delay))
          }
        }
        }
        
        // If we get here, all retries failed
        if (lastError) {
          console.error('[Auth] Client context exchange failed after retries:', lastError)
          
          // Show user-friendly error message
          const errorMessage = lastError.message.includes('expired') 
            ? 'The valuation link has expired. Please create a new valuation from the client page.'
            : lastError.message.includes('invalid')
            ? 'Invalid valuation link. Please create a new valuation from the client page.'
            : 'Unable to load client context. Please try again or create a new valuation.'
          
          // Set error in auth store for UI to display
          useAuthStore.getState().setError(errorMessage)
          
          // Clean up invalid token from URL
          const url = new URL(window.location.href)
          url.searchParams.delete('clientToken')
          window.history.replaceState({}, '', url.toString())
        }
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
          
          // CRITICAL: Migrate guest data to authenticated user
          try {
            const { useGuestSessionStore } = await import('../store/useGuestSessionStore')
            const { getSessionId, clearSession } = useGuestSessionStore.getState()
            const guestSessionId = getSessionId()
            
            if (guestSessionId) {
              // Call migration API
              const { backendAPI } = await import('../services/backendApi')
              const migrationResult = await backendAPI.migrateGuestData(guestSessionId)
              
              // Clear guest session so future requests use user_id from cookie
              clearSession()
              
              // Refresh reports list to show migrated reports
              const { useReportsStore } = await import('../store/useReportsStore')
              useReportsStore.getState().fetchReports(user.id)
            }
          } catch (migrationError) {
            // Log but don't fail login - migration is non-critical
            console.warn('[Auth] Guest migration failed (non-fatal):', migrationError)
          }
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
    // STEP 4: Guest mode (Still functional!)
    // ========================================================================
    
    setUser(null)
    authMetrics.recordSuccess() // Guest mode is a valid state
    
  } catch (error) {
    console.error('[Auth] Initialization failed:', error)
    logAuthError('Auth initialization failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    trackAuthFailure(
      error instanceof Error ? error.message : 'Initialization failed',
      { method: 'init' }
    )
    authMetrics.recordFailure()
    
    setUser(null) // Continue as guest on error
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

function parseEmployeeCount(range?: string): number | undefined {
  if (!range) return undefined
  const match = range.match(/(\d+)-(\d+)/)
  if (match) {
    return Math.floor((parseInt(match[1]) + parseInt(match[2])) / 2)
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
  const businessCard = user && (user.company_name || user.business_type || user.industry)
    ? {
        company_name: user.company_name || 'Your Company',
        industry: getIndustry(user),
        business_model: user.business_type || 'other',
        founding_year: user.founded_year || new Date().getFullYear() - (user.years_in_operation || 5),
        country_code: user.country || 'BE',
        employee_count: parseEmployeeCount(user.employee_count_range),
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

