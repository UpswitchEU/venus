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
const AUTH_CACHE_TTL = 5 * 60 * 1000 // 5 minutes like Mercury

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
            if (process.env.NODE_ENV === 'development') {
              console.log('🔄 [Auth] Access token expired, attempting refresh...')
            }
            
            try {
              // Use local API proxy route which forwards to Titan with cookies
              const refreshResponse = await fetch('/api/auth/refresh', {
                method: 'POST',
                credentials: 'include', // Send refresh token cookie
                headers: {
                  'Accept': 'application/json',
                },
              })
              
              if (refreshResponse.ok) {
                if (process.env.NODE_ENV === 'development') {
                  console.log('✅ [Auth] Token refreshed, retrying session check...')
                }
                
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
                  const user = data.success ? (data.data?.user || data.data) : data.user
                  
                  if (user) {
                    get().setUser(user)
                    trackAuthSuccess(user.id, 'cookie')
                    authMetrics.recordSuccess()
                    return user
                  }
                }
              } else {
                if (process.env.NODE_ENV === 'development') {
                  console.log('ℹ️ [Auth] Token refresh failed, user needs to re-login')
                }
              }
            } catch (refreshError) {
              if (process.env.NODE_ENV === 'development') {
                console.warn('⚠️ [Auth] Token refresh error:', refreshError)
              }
            }
            
            // Refresh failed or retry failed - user is not authenticated
            get().setUser(null)
            return null
          }

          if (response.ok) {
            const data = await response.json()
            const user = data.success ? (data.data?.user || data.data) : data.user
            
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
                  if (process.env.NODE_ENV === 'development') {
                    console.log('🔄 [Auth] Found guest session with active user, migrating...', {
                      guestSessionId: guestSessionId.substring(0, 15) + '...',
                      userId: user.id.substring(0, 8) + '...',
                    })
                  }
                  
                  const { backendAPI } = await import('../services/backendApi')
                  const migrationResult = await backendAPI.migrateGuestData(guestSessionId)
                  
                  if (process.env.NODE_ENV === 'development') {
                    console.log('✅ [Auth] Guest data migrated', {
                      migratedReports: migrationResult.migratedReports,
                      migratedSessions: migrationResult.migratedSessions,
                    })
                  }
                  
                  clearSession()
                  if (process.env.NODE_ENV === 'development') {
                    console.log('🧹 [Auth] Guest session cleared')
                  }
                }
              } catch (migrationError) {
                // Non-fatal - don't block authentication
                if (process.env.NODE_ENV === 'development') {
                  console.warn('⚠️ [Auth] Guest migration check failed (non-fatal):', migrationError)
                }
              }
              
              // Cache successful auth result (like Mercury)
              setAuthCache(user)
              
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

      // Logout (clears cookies and state)
      logout: async () => {
        try {
          // 1. Clear local state first (optimistic)
          set({ user: null, loading: false, error: null })
          clearAuthCache()
          
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
          
          // 4. Broadcast to same-origin tabs only (secure)
          if (typeof window !== 'undefined') {
            window.postMessage(
              { type: 'upswitch-logout', timestamp: Date.now() },
              window.location.origin
            )
          }
          
          // DO NOT clear cookies client-side (server does it with HttpOnly)
          // DO NOT use setTimeout (use proper await)
          
        } catch (error) {
          console.warn('[Venus Auth] Logout failed (non-fatal):', error)
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
 */
async function initializeAuth(): Promise<void> {
  const { setLoading, checkSession, exchangeToken, setUser } = useAuthStore.getState()

  // Enhanced logging for cross-subdomain auth debugging (development only)
  if (process.env.NODE_ENV === 'development') {
    console.log('🔐 [Auth] Initializing authentication...')
    console.log('🔐 [Auth] Environment:', {
      hostname: window.location.hostname,
      isSubdomain: window.location.hostname.includes('valuation.'),
      pathname: window.location.pathname,
      usingProxyRoutes: true, // Using Venus proxy routes for auth
    })
    console.log('🔐 [Auth] Using dual-token system (HttpOnly cookies): access_token (15min) + refresh_token (7d)')
    console.log('🔐 [Auth] Note: Auth cookies are HttpOnly and invisible to JavaScript')
    console.log('🔐 [Auth] The browser automatically sends them in HTTP requests')
    console.log('🔐 [Auth] Testing backend /api/auth/me to verify authentication...')
  }

  try {
    setLoading(true)

    // ========================================================================
    // STEP 1: Cookie-based auth (Primary method, <50ms)
    // ========================================================================
    // Note: We always check the session with the backend because HttpOnly cookies
    // are invisible to JavaScript. The browser automatically sends them in requests.
    if (process.env.NODE_ENV === 'development') {
      console.log('🍪 [Auth] Checking session with backend (HttpOnly cookies sent automatically)...')
    }
    
    const user = await checkSession()
    
    if (user) {
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ [Auth] Cookie session valid', { 
          userId: user.id, 
          email: user.email 
        })
      }
      trackAuthSuccess(user.id, 'cookie')
      authMetrics.recordSuccess()
      return
    }
    
    // No valid session from cookie - try token exchange
    if (process.env.NODE_ENV === 'development') {
      console.log('ℹ️ [Auth] No valid session from cookie, checking for token exchange...')
    }

    // ========================================================================
    // STEP 2: Client Context Token Exchange (Accountant → Client handoff)
    // ========================================================================
    const params = new URLSearchParams(window.location.search)
    const clientToken = params.get('clientToken')
    
    if (clientToken) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔗 [Auth] Client context token detected, exchanging...')
      }
      
      try {
        const response = await fetch(`${API_URL}/api/v2/auth/exchange-client-context`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token: clientToken }),
        })
        
        if (response.ok) {
          const context = await response.json()
          
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
            
            if (process.env.NODE_ENV === 'development') {
              console.log('✅ [Auth] Client context established', {
                accountant: context.accountantUser.email,
                client: context.clientUser.full_name,
                hasPrefilledQuery: url.searchParams.has('prefilledQuery'),
              })
            }
            
            return
          }
        }
      } catch (error) {
        console.error('❌ [Auth] Client context exchange failed:', error)
      }
    }

    // ========================================================================
    // STEP 3: Token exchange (Subdomain auth handoff, <200ms)
    // ========================================================================
    const token = params.get('token')

    if (token) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🎟️ [Auth] Token detected in URL, exchanging...', {
          tokenLength: token.length,
          tokenPrefix: token.substring(0, 10) + '...',
        })
      }
      
      try {
        const user = await exchangeToken(token)
        
        if (user) {
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ [Auth] Token exchange successful', { 
              userId: user.id, 
              email: user.email 
            })
          }
          trackAuthSuccess(user.id, 'token')
          authMetrics.recordSuccess()
          
          // CRITICAL: Migrate guest data to authenticated user
          try {
            const { useGuestSessionStore } = await import('../store/useGuestSessionStore')
            const { getSessionId, clearSession } = useGuestSessionStore.getState()
            const guestSessionId = getSessionId()
            
            if (guestSessionId) {
              if (process.env.NODE_ENV === 'development') {
                console.log('🔄 [Auth] Migrating guest data to user account...', {
                  guestSessionId: guestSessionId.substring(0, 15) + '...',
                  userId: user.id.substring(0, 8) + '...',
                })
              }
              
              // Call migration API
              const { backendAPI } = await import('../services/backendApi')
              const migrationResult = await backendAPI.migrateGuestData(guestSessionId)
              
              if (process.env.NODE_ENV === 'development') {
                console.log('✅ [Auth] Guest migration complete', {
                  migratedReports: migrationResult.migratedReports,
                  migratedSessions: migrationResult.migratedSessions,
                })
              }
              
              // Clear guest session so future requests use user_id from cookie
              clearSession()
              if (process.env.NODE_ENV === 'development') {
                console.log('🧹 [Auth] Guest session cleared')
              }
              
              // Refresh reports list to show migrated reports
              const { useReportsStore } = await import('../store/useReportsStore')
              useReportsStore.getState().fetchReports(user.id)
            }
          } catch (migrationError) {
            // Log but don't fail login - migration is non-critical
            if (process.env.NODE_ENV === 'development') {
              console.warn('⚠️ [Auth] Guest migration failed (non-fatal):', migrationError)
            }
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
      
      if (process.env.NODE_ENV === 'development') {
        console.log('🧹 [Auth] Token removed from URL')
      }
      
      return
    }

    // ========================================================================
    // STEP 4: Guest mode (Still functional!)
    // ========================================================================
    if (process.env.NODE_ENV === 'development') {
      console.log('👤 [Auth] No authentication found, entering guest mode')
    }
    
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
  }
}

// Initialize on module load (browser only)
if (typeof window !== 'undefined') {
  initializeAuth()
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

