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

import { AlertCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AuroraButton, GlassCard } from '@/design-system'
import type { User } from '../contexts/AuthContextTypes'
import { useLanguageSync } from '../hooks/useLanguageSync'
import { clearInitThrottle, clearReloadCounter, getInitTraceId, useAuthStore } from '../lib/auth'
import { useClientContext } from '../stores/clientContext'
import { getMercuryUrl } from '../utils/getMercuryUrl'
import { generalLogger } from '../utils/logger'

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
    <div
      className="min-h-screen bg-background flex items-center justify-center p-4"
      role="alert"
      aria-live="assertive"
    >
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
            variant="secondary"
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
              variant="secondary"
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

  // Stable refs for callback props — avoids useEffect re-runs when parent
  // passes new closure references on every render.
  const onAuthReadyRef = useRef(onAuthReady)
  const onAuthErrorRef = useRef(onAuthError)
  const tRef = useRef(t)
  useEffect(() => {
    onAuthReadyRef.current = onAuthReady
  }, [onAuthReady])
  useEffect(() => {
    onAuthErrorRef.current = onAuthError
  }, [onAuthError])
  useEffect(() => {
    tRef.current = t
  }, [t])

  useLanguageSync()

  // Auth state from store
  const authLoading = useAuthStore((s) => s.loading)
  const authError = useAuthStore((s) => s.error)
  const isInitializing = useAuthStore((s) => s.isInitializing)
  // RELOAD LOOP FIX: Don't redirect while token refresh is in flight (401 → refresh → retry)
  const isRefreshing = useAuthStore((s) => s.isRefreshing)

  const needsClientContext = hasClientToken

  // Subscribe to client context when needsClientContext (client null when invitation not accepted)
  const clientContextReady = useClientContext((s) =>
    !needsClientContext || (s.isActingAsClient && !!s.accountant && !!s.relationshipId)
  )

  const handleRetry = useCallback(() => {
    wasAuthReady = false
    clearRedirectCount()
    clearReloadCounter()
    window.location.reload()
  }, [])

  useEffect(() => {
    if (wasAuthReady) return

    let mounted = true
    const traceId = getInitTraceId() || 'unknown'

    const maxTimeout = setTimeout(() => {
      if (mounted && !wasAuthReady) {
        setState('error')
        setError(tRef.current('timeout'))
        onAuthErrorRef.current?.('Authentication timeout')
      }
    }, 30_000)

    function settle(outcome: 'ready' | 'error' | 'redirect', payload?: string) {
      if (!mounted || wasAuthReady) return
      if (outcome === 'ready') {
        const user = useAuthStore.getState().user!
        wasAuthReady = true
        clearRedirectCount()
        setState('ready')
        setIsReady(true)
        onAuthReadyRef.current?.(user)
      } else if (outcome === 'error') {
        setState('error')
        setError(payload ?? 'Unknown error')
        onAuthErrorRef.current?.(payload ?? 'Unknown error')
      } else if (outcome === 'redirect' && typeof window !== 'undefined') {
        window.location.href = payload!
      }
    }

    function buildLoginUrl(): string {
      const currentUrl = typeof window !== 'undefined' ? window.location.href : '/reports/new'
      const mercuryUrl = getMercuryUrl()
      const locale =
        typeof window !== 'undefined'
          ? window.location.pathname.match(/^\/(en|nl|fr|de)\//)?.[1] || 'en'
          : 'en'
      return `${mercuryUrl}/${locale}/auth/login?returnUrl=${encodeURIComponent(currentUrl)}`
    }

    function redirectToLogin() {
      const count = incrementRedirectCount()
      if (count >= MAX_REDIRECTS_BEFORE_ERROR) {
        settle('error', 'Unable to sign in. Please try again in a new tab or clear your cookies.')
        return
      }
      clearInitThrottle()
      settle('redirect', buildLoginUrl())
    }

    function checkAuth() {
      if (wasAuthReady) return

      // Wait for auth pipeline to fully settle
      if (authLoading || isInitializing || isRefreshing) return

      // Handle auth errors
      if (authError) {
        const lower = authError.toLowerCase()
        const isActionable =
          lower.includes('valuation link') ||
          lower.includes('client context') ||
          lower.includes('insufficient credits') ||
          lower.includes('page kept reloading') ||
          lower.includes('reload')

        if (isActionable) {
          settle('error', authError)
          return
        }

        // Unauthenticated users → login redirect; authenticated users → error UI
        if (!useAuthStore.getState().user) {
          redirectToLogin()
        } else {
          settle('error', authError)
        }
        return
      }

      // Verify client context when accountant flow (client null when invitation not accepted)
      if (needsClientContext) {
        const ctx = useClientContext.getState()
        if (!ctx.isActingAsClient || !ctx.accountant || !ctx.relationshipId) {
          generalLogger.warn('[AuthGate] Client context check failed', {
            isActingAsClient: ctx.isActingAsClient,
            hasClient: !!ctx.client,
            hasAccountant: !!ctx.accountant,
            hasRelationshipId: !!ctx.relationshipId,
          })
          const storeError = useAuthStore.getState().error
          settle('error', storeError || 'Failed to establish client context. Please try again.')
          return
        }
      }

      // Final gate: must have a user
      const user = useAuthStore.getState().user
      if (!user) {
        redirectToLogin()
        return
      }

      settle('ready')
    }

    checkAuth()

    return () => {
      mounted = false
      clearTimeout(maxTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authError, isInitializing, isRefreshing, needsClientContext, clientContextReady])

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
