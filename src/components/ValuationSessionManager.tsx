/**
 * ValuationSessionManager Component (Simplified)
 *
 * Cursor-style session management with optimistic rendering.
 * Single Responsibility: Load session and provide to children.
 *
 * Simplifications:
 * - No stage state machine (just isLoading boolean)
 * - No complex guards (promise cache handles duplicates)
 * - No deadline timers (optimistic rendering handles delays)
 * - Simple error recovery
 *
 * @module components/ValuationSessionManager
 */

'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import React, { useCallback, useEffect, useState } from 'react'
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

    // ROOT CAUSE FIX: Subscribe to specific values, not entire store
    // This component needs session for stage detection, but we can optimize
    const isLoading = useSessionStore((state) => state.isLoading)
    const isInitializing = useSessionStore((state) => state.isInitializing)
    const error = useSessionStore((state) => state.error)
    const loadSession = useSessionStore((state) => state.loadSession)
    const clearSession = useSessionStore((state) => state.clearSession)

    // ⭐ PLAN ENFORCEMENT: Subscribe to paywall state
    const paywallData = useSessionStore((state) => state.paywallData)
    const clearPaywall = useSessionStore((state) => state.clearPaywall)

    // ROOT CAUSE FIX: Read session only when needed for stage calculation
    const session = useSessionStore((state) => state.session)

    // ✅ TIMEOUT WARNING: Show warning after 10 seconds of loading
    const [showTimeoutWarning, setShowTimeoutWarning] = useState(false)

    useEffect(() => {
      if (isLoading || isInitializing) {
        const warningTimer = setTimeout(() => {
          setShowTimeoutWarning(true)
          generalLogger.warn('[SessionManager] Loading taking longer than expected', {
            reportId,
            isLoading,
            isInitializing,
          })
        }, 10000) // Show warning after 10s

        return () => clearTimeout(warningTimer)
      } else {
        setShowTimeoutWarning(false)
      }
    }, [isLoading, isInitializing, reportId])

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
    // This prevents the glitch where forms show before data is ready
    const stage: Stage =
      isLoading || isInitializing || !session || session.reportId !== reportId
        ? 'loading'
        : 'data-entry'

    // ✅ FIX: Load session when reportId changes (promise cache prevents duplicates)
    // Add cleanup to prevent state updates after unmount
    // Add 30-second timeout with error handling
    useEffect(() => {
      let isMounted = true
      let timeoutId: NodeJS.Timeout

      generalLogger.info('[SessionManager] Loading session', {
        reportId,
        flow: detectedFlow,
        prefilledQuery,
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
          if (!isMounted) {
            generalLogger.debug('[SessionManager] Load completed after unmount, ignoring', {
              reportId,
            })
          }
          clearTimeout(timeoutId)
          
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

          if (!isMounted) {
            generalLogger.debug('[SessionManager] Load failed after unmount, ignoring', {
              reportId,
            })
            return
          }

          generalLogger.error('[SessionManager] Load failed', {
            reportId,
            flow: detectedFlow,
            error: err.message,
            isTimeout: err.message?.includes('timeout'),
          })
        })

      return () => {
        isMounted = false
        clearTimeout(timeoutId)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [reportId, detectedFlow, prefilledQuery]) // loadSession is stable - don't include in deps

    // Retry: Clear error and reload
    const handleRetry = useCallback(() => {
      generalLogger.info('[SessionManager] Retrying load', {
        reportId,
        flow: detectedFlow,
        prefilledQuery,
      })
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
      </>
    )
  }
)

ValuationSessionManager.displayName = 'ValuationSessionManager'
