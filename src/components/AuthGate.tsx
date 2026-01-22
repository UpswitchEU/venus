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

import React, { useEffect, useState, useCallback } from 'react'
import { useAuthStore, waitForClientContext, getInitTraceId } from '../lib/auth'
import { useClientContext } from '../stores/clientContext'
import type { User } from '../contexts/AuthContextTypes'

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
}

// ============================================================================
// Default Loading Component
// ============================================================================

function DefaultLoadingState({ state }: { state: AuthGateState }) {
  const getMessage = () => {
    switch (state) {
      case 'checking':
        return 'Verifying access...'
      case 'exchanging':
        return 'Setting up client context...'
      default:
        return 'Loading...'
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="animate-pulse">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-blue-400 animate-spin"
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
        <p className="text-gray-400 text-lg">{getMessage()}</p>
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
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-red-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-white mb-4">Authentication Failed</h1>
        <p className="text-gray-400 mb-6">{error}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onRetry}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
          {returnUrl && (
            <button
              onClick={() => {
                window.location.href = returnUrl
              }}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              Go Back
            </button>
          )}
        </div>
      </div>
    </div>
  )
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
}: AuthGateProps) {
  const [state, setState] = useState<AuthGateState>('checking')
  const [error, setError] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const maxRetries = 2 // Maximum number of automatic retries for transient errors

  // Auth state from store
  const authLoading = useAuthStore((s) => s.loading)
  const authError = useAuthStore((s) => s.error)

  // BANK GRADE: Trust the prop from parent - no redundant URL checking
  // ValuationReportClient already checks urlParams for clientToken/clientId
  const needsClientContext = hasClientToken

  // Retry handler
  const handleRetry = useCallback(() => {
    setState('checking')
    setError(null)
    setIsReady(false)
    setRetryCount(0) // Reset retry count on manual retry
    // Force a page reload to retry auth from scratch
    window.location.reload()
  }, [])

  // Main auth gate logic
  // BANK GRADE: auth.ts guarantees client context is ready when loading=false
  // No need for redundant waitForClientContext() - just verify context is in store
  useEffect(() => {
    let mounted = true
    let timeoutId: NodeJS.Timeout | null = null
    let maxTimeoutId: NodeJS.Timeout | null = null
    const traceId = getInitTraceId() || 'unknown'

    // ✅ FIX: Set maximum timeout to prevent infinite loading
    maxTimeoutId = setTimeout(() => {
      if (mounted && state === 'checking') {
        console.error(`[AuthGate:${traceId}] Max timeout exceeded while checking auth`)
        setState('error')
        setError('Authentication check timed out. Please refresh the page.')
        onAuthError?.('Authentication timeout')
      }
    }, 30000) // 30 second maximum

    function checkAuth() {
      // Step 1: Wait for auth to complete
      if (authLoading) {
        console.log(`[AuthGate:${traceId}] Waiting for auth to complete`)
        setState('checking')
        return
      }

      // Step 2: Check for auth errors
      // ✅ FIX: For transient 401 errors, retry automatically before showing error
      if (authError) {
        const isTransient401 = authError.includes('401') || 
                               authError.toLowerCase().includes('expired') ||
                               authError.toLowerCase().includes('unauthorized')
        
        if (isTransient401 && retryCount < maxRetries) {
          console.log(`[AuthGate:${traceId}] Transient auth error - retrying (${retryCount + 1}/${maxRetries})`, {
            error: authError,
          })
          
          // Wait a moment for token refresh to complete, then re-check
          setTimeout(() => {
            if (mounted) {
              setRetryCount(prev => prev + 1)
              // Clear the error and re-check auth state
              const currentState = useAuthStore.getState()
              if (!currentState.error && !currentState.loading) {
                // Error cleared, re-run checkAuth
                checkAuth()
              }
            }
          }, 1000)
          return
        }
        
        console.log(`[AuthGate:${traceId}] Auth error detected: ${authError}`)
        if (mounted) {
          setState('error')
          setError(authError)
          onAuthError?.(authError)
        }
        return
      }

      // Step 3: For accountant flow, verify client context is set
      // auth.ts already awaited the exchange before setting loading=false
      if (needsClientContext) {
        console.log(`[AuthGate:${traceId}] Verifying client context is set`)
        const contextState = useClientContext.getState()

        if (!contextState.isActingAsClient || !contextState.client || !contextState.accountant) {
          // Check if there's an auth error message from the store
          const currentAuthError = useAuthStore.getState().error
          if (currentAuthError) {
            if (mounted) {
              setState('error')
              setError(currentAuthError)
              onAuthError?.(currentAuthError)
            }
            return
          }

          // Context expected but not set - this is an error, not a warning
          if (mounted) {
            setState('error')
            setError('Failed to establish client context. Please try again.')
            onAuthError?.('Client context not established')
          }
          return
        }
      }

      // Step 4: Auth complete - check if we have a user
      const currentUser = useAuthStore.getState().user
      
      if (!currentUser) {
        // Give a moment for auth redirect to happen
        timeoutId = setTimeout(() => {
          if (mounted && !useAuthStore.getState().user) {
            setState('error')
            setError('Authentication required. Please log in to continue.')
            onAuthError?.('Authentication required')
          }
        }, 1000)
        return
      }

      // Step 5: All checks passed - ready to render children
      if (mounted) {
        console.log(`[AuthGate:${traceId}] All checks passed - rendering children`, {
          userId: currentUser.id.substring(0, 8) + '...',
          isAccountantFlow: needsClientContext,
        })
        setState('ready')
        setIsReady(true)
        onAuthReady?.(currentUser)
      }
    }

    checkAuth()

    return () => {
      mounted = false
      if (timeoutId) clearTimeout(timeoutId)
      if (maxTimeoutId) clearTimeout(maxTimeoutId)
    }
  }, [authLoading, authError, needsClientContext, onAuthReady, onAuthError, retryCount, state])

  // Render based on state
  if (state === 'error' && error) {
    if (errorComponent) {
      return <>{errorComponent}</>
    }
    return <DefaultErrorState error={error} returnUrl={returnUrl} onRetry={handleRetry} />
  }

  if (!isReady) {
    if (loadingComponent) {
      return <>{loadingComponent}</>
    }
    return <DefaultLoadingState state={state} />
  }

  // Ready - render children
  return <>{children}</>
}

export default AuthGate
