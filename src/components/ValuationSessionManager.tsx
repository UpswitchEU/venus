/**
 * ValuationSessionManager Component (Simplified)
 *
 * Cursor-style session management with optimistic rendering.
 * Single Responsibility: Load session and provide to children.
 *
 * WORLD CLASS: Integrates with bootstrap system for unified initialization.
 * If bootstrap has already resolved the session, this component uses that
 * data instead of making redundant API calls.
 *
 * Simplifications:
 * - No stage state machine (just isLoading boolean)
 * - No complex guards (promise cache handles duplicates)
 * - No deadline timers (optimistic rendering handles delays)
 * - Simple error recovery
 * - Bootstrap integration for zero-latency session access
 *
 * @module components/ValuationSessionManager
 */

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useBootstrapSafe } from '../lib/bootstrap'
import { useSessionStore } from '../store/useSessionStore'
import type { ValuationSession } from '../types/valuation'
import { generalLogger } from '../utils/logger'
import { ValuationPaywallModal } from './ValuationPaywallModal'

type Stage = 'loading' | 'data-entry' | 'processing' | 'flow-selection'

interface ValuationSessionManagerProps {
  reportId: string
  initialMode?: 'edit' | 'view'
  initialVersion?: number
  children: (props: {
    session: ValuationSession | null
    stage: Stage
    isLoading: boolean
    error: string | null
    showOutOfCreditsModal: boolean
    onCloseModal: () => void
    prefilledQuery: string | null
    autoSend: boolean
    onRetry: () => void
    onStartOver: () => void
    reportId: string
    showTimeoutWarning: boolean
  }) => React.ReactNode
}

/**
 * Valuation Session Manager (Simplified)
 *
 * Load session and render children optimistically.
 * Promise cache prevents duplicate loads.
 */
export const ValuationSessionManager: React.FC<ValuationSessionManagerProps> = React.memo(
  ({ reportId, children }) => {
    const searchParams = useSearchParams()
    const router = useRouter()

    // WORLD CLASS: Bootstrap integration - check if bootstrap has already loaded session
    const bootstrap = useBootstrapSafe()
    const isBootstrapping = bootstrap?.isBootstrapping ?? false
    const bootstrapReportId = bootstrap?.report.reportId
    // Bootstrap is complete when isBootstrapping is false and there's no error
    const bootstrapComplete = bootstrap && !isBootstrapping && !bootstrap.bootstrapError
    const bootstrapHasExistingSession = bootstrap && 
      bootstrap.report.mode === 'existing' && 
      bootstrap.report.reportId === reportId
    // CRITICAL FIX: For new reports, bootstrap provides the reportId but session doesn't exist yet
    // Skip loading to avoid 404 errors - session will be created lazily on first save
    const bootstrapHasNewReport = bootstrap && 
      bootstrapComplete &&
      bootstrap.report.mode === 'new' && 
      bootstrap.report.reportId === reportId
    // Alias for logging
    const bootstrapHasSession = bootstrapHasExistingSession || bootstrapHasNewReport
    
    // ✅ FIX: Detect mismatch where URL has reportId but bootstrap says "new"
    // This indicates session wasn't found - likely auth race condition or access issue
    const bootstrapMismatch = bootstrap && 
      bootstrapComplete &&
      bootstrap.report.mode === 'new' && 
      reportId && 
      reportId.startsWith('val_') && // Looks like a valid existing reportId
      !reportId.includes('_temp') // Not a temporary ID

    // ROOT CAUSE FIX: Subscribe to `status` directly, not computed getters
    // Zustand subscriptions don't trigger re-renders with getters - must subscribe to actual state
    const status = useSessionStore((state) => state.status)
    const isLoading = status === 'loading'
    const isInitializing = status === 'idle' || status === 'loading'
    const error = useSessionStore((state) => state.errorMessage)
    const loadSession = useSessionStore((state) => state.loadSession)
    const clearSession = useSessionStore((state) => state.clearSession)

    // ⭐ PLAN ENFORCEMENT: Subscribe to paywall state
    const paywallData = useSessionStore((state) => state.paywallData)
    const clearPaywall = useSessionStore((state) => state.clearPaywall)

    // ✅ CREDIT CHECK: Check bootstrap credit status
    // AUTH-FIRST: All users are authenticated, show premium modal when credits exhausted
    const bootstrapCreditStatus = bootstrap?.creditStatus
    const showCreditError = bootstrapCreditStatus && !bootstrapCreditStatus.allowed

    // ROOT CAUSE FIX: Read session only when needed for stage calculation
    const session = useSessionStore((state) => state.session)

    // ✅ RACE CONDITION FIX: Track if we've already initiated loading for this reportId
    // This prevents multiple concurrent loads when dependencies change rapidly
    const loadingInitiatedRef = useRef<string | null>(null)
    const bootstrapRetryRef = useRef(false)
    
    // Reset refs when reportId changes (component reused for different report)
    useEffect(() => {
      loadingInitiatedRef.current = null
      bootstrapRetryRef.current = false
    }, [reportId])

    // ✅ TIMEOUT WARNING: Show warning after 10 seconds of loading
    const [showTimeoutWarning, setShowTimeoutWarning] = useState(false)

    useEffect(() => {
      if (isLoading || isInitializing) {
        const warningTimer = setTimeout(() => {
          setShowTimeoutWarning(true)
          generalLogger.warn('[SessionManager] Loading taking longer than expected', {
            reportId,
            status,
            isLoading,
            isInitializing,
          })
        }, 10000) // Show warning after 10s

        return () => clearTimeout(warningTimer)
      } else {
        setShowTimeoutWarning(false)
      }
    }, [status, reportId]) // Subscribe to status directly for proper reactivity

    // ✅ FIX: Handle bootstrap mismatch - session not found for existing reportId
    // This can happen due to auth race conditions or permission issues
    // Trigger a retry after a short delay to give auth time to stabilize
    // ✅ RACE CONDITION FIX: Use ref instead of state to prevent re-render loops
    useEffect(() => {
      if (bootstrapMismatch && !bootstrapRetryRef.current && bootstrap?.refreshBootstrap) {
        generalLogger.warn('[SessionManager] Bootstrap returned new for existing reportId - retrying', {
          reportId,
          bootstrapMode: bootstrap.report.mode,
          bootstrapReportId: bootstrap.report.reportId,
        })
        
        // Mark retry as initiated immediately to prevent duplicate retries
        bootstrapRetryRef.current = true
        
        // Wait a bit for auth to fully stabilize, then retry bootstrap
        const retryTimer = setTimeout(async () => {
          try {
            await bootstrap.refreshBootstrap()
          } catch (err) {
            generalLogger.error('[SessionManager] Bootstrap retry failed', {
              reportId,
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }, 1000)
        
        return () => clearTimeout(retryTimer)
      }
    }, [bootstrapMismatch, bootstrap, reportId])

    // Extract URL params (for backward compatibility)
    // SECURITY: prefilledQuery should come from session data, not URL
    // URL parameter is only for backward compatibility during migration
    const urlPrefilledQuery = searchParams?.get('prefilledQuery') || null
    const autoSend = searchParams?.get('autoSend') === 'true'
    const flowParam = searchParams?.get('flow') as 'manual' | 'conversational' | null
    const detectedFlow = flowParam || 'manual'
    
    // Prioritize prefilledQuery from session data over URL parameter
    const sessionPrefilledQuery = session 
      ? ((session.sessionData as any)?._prefilledQuery || (session.partialData as any)?._prefilledQuery || null)
      : null
    const prefilledQuery = sessionPrefilledQuery || urlPrefilledQuery

    // ✅ FIX: Show loading until session is loaded AND initialized
    // WORLD CLASS: Also consider bootstrap state for stage calculation
    // If bootstrap is still running, we're loading. If bootstrap failed but
    // session store has data, continue with session store data.
    const stage: Stage =
      isBootstrapping || isLoading || isInitializing || !session || session.reportId !== reportId
        ? 'loading'
        : 'data-entry'

    // ✅ FIX: Maximum loading timeout - force error state after 30 seconds
    // This prevents users from being stuck forever on a loading screen
    useEffect(() => {
      if (stage === 'loading') {
        const maxLoadingTimer = setTimeout(() => {
          generalLogger.error('[SessionManager] Max loading time exceeded', { 
            reportId,
            status,
            isBootstrapping,
            hasSession: !!session,
          })
          
          // Force error state via session store
          useSessionStore.setState({
            status: 'error',
            errorMessage: 'Loading took too long. Please try refreshing the page.',
          })
        }, 30000) // 30 second maximum
        
        return () => clearTimeout(maxLoadingTimer)
      }
    }, [stage, reportId, status, isBootstrapping, session])

    // ✅ FIX: Load session when reportId changes (promise cache prevents duplicates)
    // WORLD CLASS: Skip loading if bootstrap already has this session
    // Add cleanup to prevent state updates after unmount
    // Add 30-second timeout with error handling
    // ✅ RACE CONDITION FIX: Use ref to prevent duplicate loads when dependencies change rapidly
    useEffect(() => {
      // Skip session loading if bootstrap is in progress
      if (isBootstrapping) {
        generalLogger.debug('[SessionManager] Waiting for bootstrap to complete', { reportId })
        return
      }

      // If bootstrap already resolved this session, session store should be synced
      // by useBootstrapSync hook - we can skip redundant API call
      if (bootstrapHasExistingSession && session?.reportId === reportId) {
        generalLogger.debug('[SessionManager] Session already loaded via bootstrap', {
          reportId,
          bootstrapReportId,
        })
        // Clear loading ref since we're done
        loadingInitiatedRef.current = null
        return
      }

      // CRITICAL FIX: For new reports, bootstrap provides the reportId but session doesn't exist yet
      // Skip loading to avoid 404 errors - session will be created lazily on first save
      // The prefill data is already applied by useBootstrapPrefill hook
      if (bootstrapHasNewReport) {
        generalLogger.debug('[SessionManager] New report from bootstrap - skipping load, session will be created on first save', {
          reportId,
          bootstrapReportId,
          bootstrapMode: bootstrap?.report.mode,
        })
        // Mark initialization as complete since bootstrap has provided all necessary data
        // The session will be created automatically when the user first saves
        useSessionStore.getState().completeInitialization()
        // Clear loading ref since we're done
        loadingInitiatedRef.current = null
        return
      }

      // ✅ RACE CONDITION FIX: Skip if we've already initiated loading for this reportId
      // This prevents duplicate API calls when multiple dependencies change
      if (loadingInitiatedRef.current === reportId) {
        generalLogger.debug('[SessionManager] Loading already initiated, skipping duplicate', { reportId })
        return
      }

      // Mark loading as initiated for this reportId
      loadingInitiatedRef.current = reportId

      let isMounted = true
      let timeoutId: NodeJS.Timeout

      generalLogger.info('[SessionManager] Loading session', {
        reportId,
        flow: detectedFlow,
        prefilledQuery,
        bootstrapHasSession,
      })

      // Create timeout promise that also resets store state
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          // ✅ CRITICAL FIX: Force reset isInitializing on timeout
          // This prevents infinite loading when API calls hang
          generalLogger.warn('[SessionManager] Session load timeout, resetting state', { reportId })
          useSessionStore.setState({
            isInitializing: false,
            isLoading: false,
            error: 'Session load timeout (30 seconds). Please refresh the page or try again.',
          })
          reject(new Error('Session load timeout (30 seconds)'))
        }, 30000)
      })

      // Race between load and timeout
      Promise.race([loadSession(reportId, detectedFlow, prefilledQuery), timeoutPromise])
        .then(() => {
          clearTimeout(timeoutId)
          
          // ✅ RACE CONDITION FIX: Clear loading ref on success
          // Only clear if we're still the active load (prevent stale cleanup)
          if (loadingInitiatedRef.current === reportId) {
            loadingInitiatedRef.current = null
          }
          
          if (!isMounted) {
            generalLogger.debug('[SessionManager] Load completed after unmount, ignoring', {
              reportId,
            })
            return
          }
          
          // SECURITY: Clean sensitive parameters from URL after session is loaded
          // prefilledQuery is now stored in session_data, no need to keep it in URL
          if (typeof window !== 'undefined' && urlPrefilledQuery) {
            const url = new URL(window.location.href)
            if (url.searchParams.has('prefilledQuery')) {
              url.searchParams.delete('prefilledQuery')
              // Also clean autoSend if it was set with prefilledQuery
              if (url.searchParams.get('autoSend') === 'true' && !url.searchParams.has('flow')) {
                url.searchParams.delete('autoSend')
              }
              window.history.replaceState({}, '', url.pathname + (url.search || ''))
              generalLogger.debug('[SessionManager] Cleaned prefilledQuery from URL after session load', {
                reportId,
              })
            }
          }
        })
        .catch((err) => {
          clearTimeout(timeoutId)
          
          // ✅ RACE CONDITION FIX: Clear loading ref on error to allow retry
          // Only clear if we're still the active load (prevent stale cleanup)
          if (loadingInitiatedRef.current === reportId) {
            loadingInitiatedRef.current = null
          }

          if (!isMounted) {
            generalLogger.debug('[SessionManager] Load failed after unmount, ignoring', {
              reportId,
            })
            return
          }

          // Check if error is ValidationError - don't retry these
          const isValidationError = 
            err.message?.includes('Authentication required') ||
            err.message?.includes('Invalid session data') ||
            err.message?.includes('validation') ||
            err.message?.includes('ValidationError') ||
            (err as any)?.name === 'ValidationError'
          
          if (isValidationError) {
            generalLogger.error('[SessionManager] Validation error - stopping retries', {
              reportId,
              error: err.message,
            })
            // Set error state and stop - don't retry validation errors
            useSessionStore.setState({
              isInitializing: false,
              isLoading: false,
              error: 'Cannot create session. Please ensure you are logged in or try creating a new valuation.',
            })
            return // Don't continue - stop the retry loop
          }

          // ✅ IMPROVED: Categorize errors and provide user-friendly messages
          const errorMessage = err.message || 'Unknown error'
          const isTimeout = errorMessage.includes('timeout')
          const isNetworkError = errorMessage.includes('fetch') || errorMessage.includes('network') || errorMessage.includes('Failed to fetch')
          const isUuidError = errorMessage.includes('uuid') || errorMessage.includes('operator does not exist')
          const isAuthError = errorMessage.includes('401') || errorMessage.includes('Unauthorized')
          
          // Set user-friendly error message
          let userFriendlyError = 'Failed to load session. Please try again.'
          if (isTimeout) {
            userFriendlyError = 'Session load timeout (30 seconds). Please refresh the page or try again.'
          } else if (isNetworkError) {
            userFriendlyError = 'Network error. Please check your connection and try again.'
          } else if (isUuidError) {
            userFriendlyError = 'Server error occurred. Please refresh the page or contact support.'
            // Log UUID errors specifically for backend debugging
            generalLogger.error('[SessionManager] UUID-related error detected', {
              reportId,
              error: errorMessage,
              stack: err.stack,
            })
          } else if (isAuthError) {
            userFriendlyError = 'Authentication error. Please log in again.'
          }

          // Ensure store state is reset on error
          useSessionStore.setState({
            isInitializing: false,
            isLoading: false,
            error: userFriendlyError,
          })

          generalLogger.error('[SessionManager] Load failed', {
            reportId,
            flow: detectedFlow,
            error: errorMessage,
            isTimeout,
            isNetworkError,
            isUuidError,
            isAuthError,
            userFriendlyError,
          })
        })

      return () => {
        isMounted = false
        clearTimeout(timeoutId)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reportId, detectedFlow, prefilledQuery, isBootstrapping, bootstrapHasSession, session?.reportId]) // loadSession is stable - don't include in deps

    // Retry: Clear error and reload
    const handleRetry = useCallback(() => {
      generalLogger.info('[SessionManager] Retrying load', {
        reportId,
        flow: detectedFlow,
        prefilledQuery,
      })
      // ✅ RACE CONDITION FIX: Reset refs to allow retry
      loadingInitiatedRef.current = null
      bootstrapRetryRef.current = false
      loadSession(reportId, detectedFlow, prefilledQuery)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reportId, detectedFlow, prefilledQuery]) // loadSession is stable - don't include in deps

    // Start over: Clear and navigate home
    const handleStartOver = useCallback(() => {
      generalLogger.info('[SessionManager] Starting over', { reportId })
      clearSession()
      router.push('/')
    }, [reportId, clearSession, router])

    // ✅ FIX: Pass isLoading to children so they can prevent UI from rendering during initial load
    return (
      <>
        {children({
          session,
          stage,
          isLoading,
          error,
          showOutOfCreditsModal: false, // TODO: Re-implement if needed
          onCloseModal: () => {}, // No-op
          prefilledQuery,
          autoSend,
          onRetry: handleRetry,
          onStartOver: handleStartOver,
          reportId,
          showTimeoutWarning,
        })}

        {/* ⭐ PLAN ENFORCEMENT: Paywall Modal */}
        {/* Show credit error from bootstrap if credits insufficient */}
        {showCreditError && (
          <ValuationPaywallModal
            isOpen={true}
            onClose={() => {
              router.push('/') // Redirect to homepage
            }}
            current={bootstrapCreditStatus.credits_remaining}
            limit={bootstrapCreditStatus.credits_limit}
            message={bootstrapCreditStatus.message || 
              (bootstrapCreditStatus.upgrade_path === 'accountant_pro'
                ? 'Pro plan required to create valuations for clients. Please upgrade to Pro to continue.'
                : 'Insufficient credits to create valuation. Upgrade to Premium for unlimited valuations.')}
            onUpgrade={() => {
              // Redirect to Mercury pricing page (full URL for cross-app navigation)
              window.location.href = 'https://app.upswitch.be/pricing'
            }}
          />
        )}
        {/* Show paywall from session store (for other credit errors) */}
        {!showCreditError && (
          <ValuationPaywallModal
            isOpen={!!paywallData}
            onClose={() => {
              clearPaywall()
              router.push('/') // Redirect to homepage
            }}
            current={paywallData?.current || 0}
            limit={paywallData?.limit || 1}
            message={paywallData?.message}
            onUpgrade={() => {
              // Redirect to Mercury pricing page (full URL for cross-app navigation)
              window.location.href = 'https://app.upswitch.be/pricing'
            }}
          />
        )}
      </>
    )
  }
)

ValuationSessionManager.displayName = 'ValuationSessionManager'
