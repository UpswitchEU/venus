'use client'

/**
 * AuthGate Component
 * 
 * Bank-grade authentication gate that ensures auth and client context
 * are fully established BEFORE rendering children.
 * 
 * This component solves the race condition where bootstrap runs before
 * client context exchange completes, resulting in sessions created
 * without proper accountant-client context.
 * 
 * Flow:
 * 1. Check if clientToken/clientId is in URL (accountant flow)
 * 2. Wait for auth to complete
 * 3. If accountant flow: wait for client context exchange to complete
 * 4. Only then render children (BootstrapProvider)
 * 
 * @module components/AuthGate
 */

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle } from 'lucide-react'
import { GlassCard, AuroraButton } from '@/design-system'
import { useAuthStore, getInitTraceId } from '../lib/auth'
import { useClientContext } from '../stores/clientContext'
import { getMercuryUrl, getApiUrl } from '../utils/getMercuryUrl'
import { generalLogger } from '../utils/logger'
import { useLanguageSync } from '../hooks/useLanguageSync'
import type { User } from '../contexts/AuthContextTypes'

// ============================================================================
// Constants - Redirect loop protection
// ============================================================================

const REDIRECT_COUNT_KEY = 'upswitch_venus_redirect_count'
const MAX_REDIRECTS_BEFORE_ERROR = 3

function getRedirectCount(): number {
  try {
    return parseInt(sessionStorage.getItem(REDIRECT_COUNT_KEY) ?? '0', 10) || 0
  } catch {
    return 0
  }
}

function incrementRedirectCount(): number {
  try {
    const next = getRedirectCount() + 1
    sessionStorage.setItem(REDIRECT_COUNT_KEY, String(next))
    return next
  } catch {
    return 1
  }
}

function clearRedirectCount(): void {
  try {
    sessionStorage.removeItem(REDIRECT_COUNT_KEY)
  } catch {
    /* ignore */
  }
}

// ============================================================================
// Types
// ============================================================================

type AuthGateState = 'checking' | 'exchanging' | 'ready' | 'error'

interface AuthGateProps {
  children: React.ReactNode
  /** Called when auth is ready */
  onAuthReady?: (user: User) => void
  /** Called when auth fails */
  onAuthError?: (error: string) => void
  /** Custom loading component */
  loadingComponent?: React.ReactNode
  /** Custom error component */
  errorComponent?: React.ReactNode
  /** Whether a client token is present in URL (triggers wait for client context) */
  hasClientToken?: boolean
  /** Return URL for error state back button */
  returnUrl?: string
  /**
   * Optimistic mode: render children immediately without waiting for auth.
   * Auth still runs in the background; if it fails the user is redirected.
   * Use for Mercury→Venus flows where cookies are already present.
   */
  optimistic?: boolean
}

// ============================================================================
// Default Loading Component
// ============================================================================

function DefaultLoadingState({ state }: { state: AuthGateState }) {
  const t = useTranslations('auth.authGate')
  const getMessage = () => {
    switch (state) {
      case 'checking':
        return t('verifying')
      case 'exchanging':
        return t('settingUpContext')
      default:
        return t('loading')
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <div className="animate-pulse">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-primary/20 to-accent/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-primary animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        </div>
        <p className="text-foreground/50 text-lg">{getMessage()}</p>
      </div>
    </div>
  )
}

// ============================================================================
// Default Error Component
// ============================================================================

function DefaultErrorState({
  error,
  returnUrl,
  onRetry,
}: {
  error: string
  returnUrl?: string
  onRetry: () => void
}) {
  const t = useTranslations('auth.authGate')
  const handleLogIn = () => {
    const currentUrl = window.location.href
    const mercuryUrl = getMercuryUrl()
    const locale = window.location.pathname.match(/^\/(en|nl|fr|de)\//)?.[1] || 'en'
    window.location.href = `${mercuryUrl}/${locale}/auth/login?returnUrl=${encodeURIComponent(currentUrl)}`
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <GlassCard
        variant="default"
        glow="none"
        hover={false}
        className="max-w-md w-full text-center"
      >
        <div className="w-12 h-12 mx-auto mb-4 flex items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="w-6 h-6 text-destructive/70" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold text-foreground mb-2">{t('failed')}</h1>
        <p className="text-sm text-muted-foreground mb-6">{error}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center flex-wrap">
          <AuroraButton
            onClick={handleLogIn}
            variant="primary"
            size="lg"
            className="flex items-center justify-center gap-2"
          >
            {t('logIn')}
          </AuroraButton>
          <AuroraButton
            onClick={onRetry}
            variant="ghost"
            size="lg"
            className="flex items-center justify-center gap-2"
          >
            {t('tryAgain')}
          </AuroraButton>
          {returnUrl && (
            <AuroraButton
              onClick={() => {
                window.location.href = returnUrl
              }}
              variant="ghost"
              size="lg"
              className="flex items-center justify-center gap-2"
            >
              {t('goBack')}
            </AuroraButton>
          )}
        </div>
      </GlassCard>
    </div>
  )
}

// ============================================================================
// Module-level sticky guard
// ============================================================================
// Survives component remounts — once auth is confirmed ready, we never
// re-evaluate until the user explicitly logs out or does a full page reload.
// This is the critical defense against BootstrapProvider unmount/remount
// cycles caused by AuthGate briefly hiding children during transient
// auth store updates.
let wasAuthReady = false

/** Reset the module-level auth ready guard (call on logout) */
export function resetAuthGateGuard() {
  wasAuthReady = false
}

// ============================================================================
// AuthGate Component
// ============================================================================

export function AuthGate({
  children,
  onAuthReady,
  onAuthError,
  loadingComponent,
  errorComponent,
  hasClientToken = false,
  returnUrl,
  optimistic = false,
}: AuthGateProps) {
  const t = useTranslations('auth.authGate')
  const [state, setState] = useState<AuthGateState>(wasAuthReady ? 'ready' : 'checking')
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(wasAuthReady)
  const retryCountRef = useRef(0)
  const maxRetries = 2
  const fallbackAttemptedRef = useRef(false)

  // Stable refs for callback props — avoids useEffect re-runs when parent
  // passes new closure references on every render.
  const onAuthReadyRef = useRef(onAuthReady)
  const onAuthErrorRef = useRef(onAuthError)
  const tRef = useRef(t)
  useEffect(() => { onAuthReadyRef.current = onAuthReady }, [onAuthReady])
  useEffect(() => { onAuthErrorRef.current = onAuthError }, [onAuthError])
  useEffect(() => { tRef.current = t }, [t])

  useLanguageSync()

  // Auth state from store
  const authLoading = useAuthStore((s) => s.loading)
  const authError = useAuthStore((s) => s.error)
  const isInitializing = useAuthStore((s) => s.isInitializing)
  // RELOAD LOOP FIX: Don't redirect while token refresh is in flight (401 → refresh → retry)
  const isRefreshing = useAuthStore((s) => s.isRefreshing)

  const needsClientContext = hasClientToken

  const handleRetry = useCallback(() => {
    wasAuthReady = false
    setState('checking')
    setError(null)
    setIsReady(false)
    retryCountRef.current = 0
    fallbackAttemptedRef.current = false
    clearRedirectCount()
    window.location.reload()
  }, [])

  useEffect(() => {
    // Module-level sticky guard: once auth was confirmed ready in ANY mount,
    // skip the entire effect. This is the primary defense against transient
    // auth store toggles (token refresh, etc.) causing BootstrapProvider
    // remount cycles.
    if (wasAuthReady) {
      return
    }

    let mounted = true
    let authResolved = false
    let maxTimeoutId: NodeJS.Timeout | null = null
    let redirectDebounceId: NodeJS.Timeout | null = null
    const traceId = getInitTraceId() || 'unknown'

    maxTimeoutId = setTimeout(() => {
      if (mounted && !authResolved) {
        generalLogger.error(`[AuthGate:${traceId}] Max timeout exceeded while checking auth`)
        setState('error')
        setError(tRef.current('timeout'))
        onAuthErrorRef.current?.('Authentication timeout')
      }
    }, 30000)

    function checkAuth() {
      if (wasAuthReady) {
        return
      }

      // Step 1: Wait for auth to complete
      // RACE CONDITION FIX: Wait for BOTH loading=false AND isInitializing=false
      // RELOAD LOOP FIX: Also wait for isRefreshing=false so we don't redirect
      // before token refresh (401 → refresh → retry) completes and restores the user
      if (authLoading || isInitializing || isRefreshing) {
        generalLogger.debug(`[AuthGate:${traceId}] Waiting for auth to complete`, { authLoading, isInitializing, isRefreshing })
        setState('checking')
        return
      }

      // Step 2: Check for auth errors
      if (authError) {
        const lowerError = authError.toLowerCase()

        // Client context errors (set by auth.ts) are non-retryable — show immediately.
        // These contain actionable instructions for the user.
        const isClientContextError =
          lowerError.includes('valuation link') ||
          lowerError.includes('client context') ||
          lowerError.includes('insufficient credits')

        // Transient auth errors (token expired, 401) can be retried — the token
        // refresh may still be in-flight and will clear the error shortly.
        const isTransientAuthError = !isClientContextError && (
          authError.includes('401') ||
          lowerError.includes('token') ||
          lowerError.includes('unauthorized') ||
          lowerError.includes('not authenticated') ||
          lowerError.includes('no refresh token')
        )

        if (isTransientAuthError && retryCountRef.current < maxRetries) {
          retryCountRef.current += 1
          generalLogger.debug(`[AuthGate:${traceId}] Transient auth error - retrying`, {
            retry: retryCountRef.current,
            maxRetries,
            error: authError,
          })
          
          setTimeout(() => {
            if (mounted) {
              const currentState = useAuthStore.getState()
              if (!currentState.error && !currentState.loading) {
                checkAuth()
              }
            }
          }, 1000)
          return
        }
        
        // Client context errors are actionable — show error UI so the user
        // can read the message ("Please create a new valuation...") and act.
        // Don't redirect to login — the issue is the link, not the session.
        if (isClientContextError) {
          generalLogger.debug(`[AuthGate:${traceId}] Client context error — showing error UI`, { authError })
          if (mounted) {
            authResolved = true
            setState('error')
            setError(authError)
            onAuthErrorRef.current?.(authError)
          }
          return
        }

        // For auth errors (token/session issues): redirect unauthenticated
        // users to Mercury login. Authenticated users with transient errors
        // see the error UI with a retry button.
        const currentUser = useAuthStore.getState().user
        if (!currentUser) {
          const count = incrementRedirectCount()
          if (count >= MAX_REDIRECTS_BEFORE_ERROR) {
            generalLogger.error(`[AuthGate:${traceId}] Redirect loop detected (auth error) - showing error`, { count })
            authResolved = true
            setState('error')
            setError('Unable to sign in. Please try again in a new tab or clear your cookies.')
            onAuthErrorRef.current?.('Redirect loop detected')
            return
          }
          const currentUrl = typeof window !== 'undefined' ? window.location.href : '/reports/new'
          const mercuryUrl = getMercuryUrl()
          const locale = typeof window !== 'undefined' ? window.location.pathname.match(/^\/(en|nl|fr|de)\//)?.[1] || 'en' : 'en'
          const redirectUrl = `${mercuryUrl}/${locale}/auth/login?returnUrl=${encodeURIComponent(currentUrl)}`
          
          generalLogger.debug(`[AuthGate:${traceId}] Auth error and no user - redirecting to Mercury login`, {
            redirectUrl,
            authError,
            redirectCount: count,
          })
          
          authResolved = true
          if (typeof window !== 'undefined') {
            window.location.href = redirectUrl
          }
          return
        }
        
        generalLogger.debug(`[AuthGate:${traceId}] Auth error detected`, { authError })
        if (mounted) {
          authResolved = true
          setState('error')
          setError(authError)
          onAuthErrorRef.current?.(authError)
        }
        return
      }

      // Step 3: For accountant flow, verify client context is set
      // auth.ts already awaited the exchange before setting loading=false
      
      // ✅ FIX: Fallback - Try to restore client context from report if accountant viewing report
      const userForContextCheck = useAuthStore.getState().user
      const contextState = useClientContext.getState()
      
      // If accountant viewing report but no client context, try to restore from report metadata.
      // Guard with fallbackAttemptedRef to prevent re-entering this path on every checkAuth() call.
      if (!needsClientContext && userForContextCheck?.role === 'accountant' && !contextState.isActingAsClient && !fallbackAttemptedRef.current) {
        // Check if we're on a report page
        const reportIdMatch = typeof window !== 'undefined' ? window.location.pathname.match(/\/reports\/([^\/]+)/) : null
        const reportId = reportIdMatch ? reportIdMatch[1] : null
        
        if (reportId && (reportId.startsWith('val_') || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId))) {
          fallbackAttemptedRef.current = true
          generalLogger.debug(`[AuthGate:${traceId}] Fallback: Attempting to restore client context from report`)
          
          const FALLBACK_MAX_MS = 8000
          let fallbackCompleted = false
          const completeFallback = () => {
            if (fallbackCompleted) return
            fallbackCompleted = true
            if (mounted) checkAuth()
          }
          
          // Global timeout: don't hang if fallback stalls
          const fallbackTimeout = setTimeout(() => {
            generalLogger.warn(`[AuthGate:${traceId}] Fallback: Timeout after ${FALLBACK_MAX_MS}ms`)
            completeFallback()
          }, FALLBACK_MAX_MS)
          
          ;(async () => {
            try {
              const API_URL = getApiUrl()
              
              const reportAbort = new AbortController()
              const reportTimeout = setTimeout(() => reportAbort.abort(), 5000)

              const reportResponse = await fetch(
                `${API_URL}/api/v2/valuations/reports/by-session/${reportId}`,
                {
                  method: 'GET',
                  credentials: 'include',
                  headers: { 'Accept': 'application/json' },
                  signal: reportAbort.signal,
                }
              )
              clearTimeout(reportTimeout)
              
              if (reportResponse.ok) {
                const reportData = await reportResponse.json()
                const report = reportData.data || reportData
                const accountantCustomerId = report.accountant_customer_id
                
                if (accountantCustomerId) {
                  const ctxAbort = new AbortController()
                  const ctxTimeout = setTimeout(() => ctxAbort.abort(), 5000)
                  const contextResponse = await fetch(`${API_URL}/api/v2/auth/get-client-context`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ clientId: accountantCustomerId }),
                    signal: ctxAbort.signal,
                  })
                  clearTimeout(ctxTimeout)
                  
                  if (contextResponse.ok) {
                    const context = await contextResponse.json()
                    
                    if (context.accountantUser && context.clientUser && context.relationship) {
                      // Set client context in store
                      const { useClientContext: useClientContextStore } = await import('../stores/clientContext')
                      useClientContextStore.getState().setClientContext(context)
                      
                      generalLogger.debug(`[AuthGate:${traceId}] Fallback: Client context restored from report`)
                    }
                  }
                }
              }
            } catch (error) {
              generalLogger.warn(`[AuthGate:${traceId}] Fallback: Failed to restore client context from report`, {
                error: error instanceof Error ? error.message : String(error),
              })
            } finally {
              clearTimeout(fallbackTimeout)
              setTimeout(completeFallback, 100)
            }
          })()
          
          // Return early to allow async restoration to complete before checking context.
          // The finally block above guarantees checkAuth() will be called when done.
          return
        }
      }
      
      if (needsClientContext) {
        generalLogger.debug(`[AuthGate:${traceId}] Verifying client context is set`)
        const contextStateAfterFallback = useClientContext.getState()

        if (!contextStateAfterFallback.isActingAsClient || !contextStateAfterFallback.client || !contextStateAfterFallback.accountant) {
          const currentAuthError = useAuthStore.getState().error
          const currentUserForError = useAuthStore.getState().user
          
          if (currentAuthError && !currentUserForError) {
            const lowerErr = currentAuthError.toLowerCase()
            const isCtxError =
              lowerErr.includes('valuation link') ||
              lowerErr.includes('client context') ||
              lowerErr.includes('insufficient credits')
            const isSessionError = !isCtxError && (
              currentAuthError.includes('401') ||
              lowerErr.includes('token') ||
              lowerErr.includes('unauthorized')
            )
            
            if (isSessionError) {
              const count = incrementRedirectCount()
              if (count >= MAX_REDIRECTS_BEFORE_ERROR) {
                generalLogger.error(`[AuthGate:${traceId}] Redirect loop detected (client context) - showing error`, { count })
                authResolved = true
                setState('error')
                setError('Unable to sign in. Please try again in a new tab or clear your cookies.')
                onAuthErrorRef.current?.('Redirect loop detected')
                return
              }
              const currentUrl = typeof window !== 'undefined' ? window.location.href : '/reports/new'
              const mercuryUrl = getMercuryUrl()
              const locale = typeof window !== 'undefined' ? window.location.pathname.match(/^\/(en|nl|fr|de)\//)?.[1] || 'en' : 'en'
              const redirectUrl = `${mercuryUrl}/${locale}/auth/login?returnUrl=${encodeURIComponent(currentUrl)}`
              
              generalLogger.debug(`[AuthGate:${traceId}] Auth error during client context check - redirecting to Mercury login`, {
                redirectUrl,
                currentUrl,
                authError: currentAuthError,
                redirectCount: count,
              })
              
              authResolved = true
              if (typeof window !== 'undefined') {
                window.location.href = redirectUrl
              }
              return
            }
          }
          
          if (currentAuthError) {
            if (mounted) {
              authResolved = true
              setState('error')
              setError(currentAuthError)
              onAuthErrorRef.current?.(currentAuthError)
            }
            return
          }

          if (mounted) {
            authResolved = true
            setState('error')
            setError('Failed to establish client context. Please try again.')
            onAuthErrorRef.current?.('Client context not established')
          }
          return
        }
      }

      // Step 4: Auth complete - check if we have a user
      const currentUser = useAuthStore.getState().user
      
      if (!currentUser) {
        // RELOAD LOOP FIX: Debounce redirect to give in-flight token refresh time to complete.
        const REDIRECT_DEBOUNCE_MS = 600
        redirectDebounceId = setTimeout(() => {
          if (!mounted) return
          const userAfterDelay = useAuthStore.getState().user
          if (userAfterDelay) {
            generalLogger.debug(`[AuthGate:${traceId}] User restored during debounce - skipping redirect`)
            checkAuth()
            return
          }
          // REDIRECT LOOP PROTECTION: After N redirects, show error instead of looping
          const count = incrementRedirectCount()
          if (count >= MAX_REDIRECTS_BEFORE_ERROR) {
            generalLogger.error(`[AuthGate:${traceId}] Redirect loop detected - showing error instead`, { count })
            authResolved = true
            setState('error')
            setError('Unable to sign in. Please try again in a new tab or clear your cookies.')
            onAuthErrorRef.current?.('Redirect loop detected')
            return
          }
          authResolved = true
          const currentUrl = typeof window !== 'undefined' ? window.location.href : '/reports/new'
          const mercuryUrl = getMercuryUrl()
          const locale = typeof window !== 'undefined' ? window.location.pathname.match(/^\/(en|nl|fr|de)\//)?.[1] || 'en' : 'en'
          const redirectUrl = `${mercuryUrl}/${locale}/auth/login?returnUrl=${encodeURIComponent(currentUrl)}`
          generalLogger.debug(`[AuthGate:${traceId}] No user after debounce - redirecting to Mercury login`, {
            redirectUrl,
            currentUrl,
            redirectCount: count,
          })
          if (typeof window !== 'undefined') {
            window.location.href = redirectUrl
          }
        }, REDIRECT_DEBOUNCE_MS)
        return
      }

      if (mounted) {
        authResolved = true
        wasAuthReady = true
        clearRedirectCount()
        generalLogger.debug(`[AuthGate:${traceId}] All checks passed - rendering children`, {
          userId: currentUser.id.substring(0, 8) + '...',
          isAccountantFlow: needsClientContext,
        })
        setState('ready')
        setIsReady(true)
        onAuthReadyRef.current?.(currentUser)
      }
    }

    checkAuth()

    return () => {
      mounted = false
      if (maxTimeoutId) clearTimeout(maxTimeoutId)
      if (redirectDebounceId) clearTimeout(redirectDebounceId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authError, isInitializing, isRefreshing, needsClientContext])

  // Render based on state
  // In optimistic mode, render children immediately.
  // Auth still runs in the background via the useEffect above.
  // If auth fails, the useEffect will redirect to login.
  if (optimistic) {
    return <>{children}</>
  }

  if (state === 'error' && error) {
    if (errorComponent) {
      return <>{errorComponent}</>
    }
    return <DefaultErrorState error={error} returnUrl={returnUrl} onRetry={handleRetry} />
  }

  if (!isReady && !wasAuthReady) {
    if (loadingComponent) {
      return <>{loadingComponent}</>
    }
    return <DefaultLoadingState state={state} />
  }

  // Ready - render children
  return <>{children}</>
}

export default AuthGate
