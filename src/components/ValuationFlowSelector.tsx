/**
 * ValuationFlowSelector Component
 *
 * Selects and renders the appropriate valuation flow based on session state.
 * Single Responsibility: Flow selection and conditional rendering.
 *
 * @module components/ValuationFlowSelector
 */

'use client'

// Dynamic imports using React.lazy for code splitting (Next.js compatible)
import React, { lazy, Suspense, useEffect, useMemo } from 'react'
import { useSessionStore } from '../store/useSessionStore'
import type { ValuationResponse, ValuationSession } from '../types/valuation'
import { LoadingState } from './LoadingState'
import { INITIALIZATION_STEPS } from './LoadingState.constants'

/**
 * Valuation flow stage types
 */
type Stage = 'loading' | 'data-entry' | 'processing' | 'flow-selection'

/**
 * ValuationFlowSelector Component Props
 */
interface ValuationFlowSelectorProps {
  /** Current valuation session data */
  session: ValuationSession | null
  /** Current UI stage determining what to render */
  stage: Stage
  /** Whether session is currently loading */
  isLoading: boolean
  /** Error message if session initialization failed */
  error: string | null
  /** Prefilled query for conversational flow */
  prefilledQuery: string | null
  /** Whether to auto-send prefilled query */
  autoSend: boolean
  /** Callback when valuation completes */
  onComplete: (result: ValuationResponse) => void
  /** Initial mode for M&A workflow */
  initialMode?: 'edit' | 'view'
  /** Initial version for M&A workflow */
  initialVersion?: number
  /** Callback to retry session initialization */
  onRetry?: () => void
  /** Callback to start over (return to homepage) */
  onStartOver?: () => void
  /** Report ID for optimistic rendering (when session not loaded yet) */
  reportId: string
}

// Lazy load unified flow component (Next.js compatible)
const ValuationFlow = lazy(() =>
  import('@/features/valuation/components/ValuationFlow')
    .then((module) => ({
      default: module.ValuationFlow,
    }))
    .catch((error) => {
      console.error('[ValuationFlowSelector] Failed to load ValuationFlow component', error)
      // Return a fallback component that shows an error
      return {
        default: () => (
          <div className="flex items-center justify-center h-full">
            <div className="max-w-md mx-auto text-center">
              <div className="bg-rust-500/20 border border-rust-500/30 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-rust-400 mb-2">Loading Error</h3>
                <p className="text-rust-300 mb-4">
                  Failed to load valuation flow component. Please refresh the page.
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-rust-600 hover:bg-rust-700 text-white rounded-lg transition-colors"
                >
                  Reload Page
                </button>
              </div>
            </div>
          </div>
        ),
      }
    })
)

/**
 * Valuation Flow Selector Component
 *
 * Conditionally renders the appropriate valuation flow based on session state.
 * Handles loading states, error conditions, and smooth transitions between flows.
 *
 * ## Stage-Based Rendering
 * - **'loading'**: Shows initialization progress with steps
 * - **'data-entry'**: Renders manual or conversational flow based on session
 * - **'processing'**: Shows calculation progress (future use)
 * - **'flow-selection'**: Flow picker (future use)
 *
 * ## Error Handling
 * - Displays user-friendly error messages
 * - Provides reload option for recovery
 * - Logs errors with context for debugging
 *
 * ## Performance Features
 * - Memoized flow type calculation
 * - Lazy loading of flow components with monitoring
 * - Smooth animations between flow transitions
 * - Suspense boundaries for loading states
 *
 * ## Animation Strategy
 * - Fade-in transitions when flows mount
 * - Key-based re-mounting for flow changes
 * - Loading fallbacks during component switches
 *
 * @param props - Component props
 * @returns Appropriate valuation flow interface based on session state
 *
 * @example
 * ```tsx
 * <ValuationFlowSelector
 *   session={currentSession}
 *   stage="data-entry"
 *   error={null}
 *   prefilledQuery="SaaS company"
 *   autoSend={true}
 *   onComplete={(result) => handleValuationComplete(result)}
 * />
 * ```
 *
 * @since 2.0.0
 * @author UpSwitch UI Team
 */
export const ValuationFlowSelector: React.FC<ValuationFlowSelectorProps> = React.memo(
  ({
    session,
    stage,
    isLoading,
    error,
    prefilledQuery,
    autoSend,
    onComplete,
    initialMode,
    initialVersion,
    onRetry,
    onStartOver,
    reportId,
  }) => {
    // Debug logging to understand rendering
    useEffect(() => {
      console.log('[ValuationFlowSelector] Render', {
        stage,
        hasSession: !!session,
        sessionReportId: session?.reportId,
        sessionCurrentView: session?.currentView,
      })
    }, [stage, session])

    // Memoize flow type calculation
    const flowType = useMemo(() => {
      return session?.currentView === 'manual' ? 'manual' : 'conversational'
    }, [session?.currentView])

    // Memoize flow key for animations
    const flowKey = useMemo(() => {
      return session ? `${session.currentView}-flow` : 'no-session-flow'
    }, [session?.currentView, session])

    // Render based on stage
    if (stage === 'loading') {
      console.log('[ValuationFlowSelector] Rendering loading state with INITIALIZATION_STEPS', {
        stepsCount: INITIALIZATION_STEPS.length,
        isLoading,
        hasSession: !!session,
      })
      return <LoadingState steps={INITIALIZATION_STEPS} variant="dark" />
    }

    if (error) {
      return (
        <div className="flex items-center justify-center h-full">
          <div className="max-w-md mx-auto text-center">
            <div className="bg-rust-500/20 border border-rust-500/30 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-rust-400 mb-2">Session Error</h3>
              <p className="text-rust-300 mb-6">{error}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="px-6 py-2.5 bg-rust-600 hover:bg-rust-700 text-white rounded-lg transition-colors font-medium"
                  >
                    Retry
                  </button>
                )}
                {onStartOver && (
                  <button
                    onClick={onStartOver}
                    className="px-6 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors font-medium"
                  >
                    Start Over
                  </button>
                )}
                {!onRetry && !onStartOver && (
                  <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-2.5 bg-rust-600 hover:bg-rust-700 text-white rounded-lg transition-colors font-medium"
                  >
                    Reload Page
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    }

    if (stage === 'data-entry') {
      // ✅ FIX: Additional safety checks - ensure session is fully ready
      // The stage calculation should handle this, but this is a final guard
      // Check both isLoading and isInitializing to prevent premature rendering
      const isInitializing = useSessionStore.getState().isInitializing
      if (isLoading || isInitializing || !session || session.reportId !== reportId) {
        // Show minimal loading to avoid flash - session should load quickly from cache
        return (
          <div className="flex items-center justify-center h-screen bg-zinc-950">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Preparing session...</p>
            </div>
          </div>
        )
      }

      // Use reportId from props (always available) or validated session
      const effectiveReportId = session?.reportId || reportId

      // Determine flow type - use session if available and validated, otherwise infer from URL
      const flowType =
        session?.currentView === 'manual'
          ? 'manual'
          : session?.currentView === 'conversational'
            ? 'conversational'
            : typeof window !== 'undefined' &&
                new URLSearchParams(window.location.search).get('flow') === 'conversational'
              ? 'conversational'
              : 'manual'

      return (
        <div className="relative h-full w-full">
          {/* Render unified flow component based on session view */}
          {/* Smooth fade-in animation when component mounts */}
          <div key={flowKey} className="absolute inset-0 animate-in fade-in duration-200 ease-out">
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-screen bg-zinc-950">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">Loading flow...</p>
                  </div>
                </div>
              }
            >
              <ValuationFlow
                reportId={effectiveReportId}
                flowType={flowType}
                onComplete={onComplete}
                initialQuery={prefilledQuery}
                autoSend={autoSend}
                initialMode={initialMode}
                initialVersion={initialVersion}
              />
            </Suspense>
          </div>
        </div>
      )
    }

    // Fallback - should not normally reach here
    return <LoadingState steps={INITIALIZATION_STEPS} variant="dark" />
  },
  // Custom comparison: Always re-render if stage changes (critical for UI updates)
  (prevProps, nextProps) => {
    // Re-render if stage changes (most important)
    if (prevProps.stage !== nextProps.stage) {
      return false // Re-render
    }
    // Re-render if session changes (from null to object or vice versa)
    if (!!prevProps.session !== !!nextProps.session) {
      return false // Re-render
    }
    // Re-render if session reportId changes
    if (prevProps.session?.reportId !== nextProps.session?.reportId) {
      return false // Re-render
    }
    // ✅ FIX: Re-render if session currentView changes (critical for flow switching)
    if (prevProps.session?.currentView !== nextProps.session?.currentView) {
      return false // Re-render
    }
    // Re-render if error changes
    if (prevProps.error !== nextProps.error) {
      return false // Re-render
    }
    // Otherwise, use default shallow comparison for other props
    return (
      prevProps.prefilledQuery === nextProps.prefilledQuery &&
      prevProps.autoSend === nextProps.autoSend &&
      prevProps.onComplete === nextProps.onComplete &&
      prevProps.initialMode === nextProps.initialMode &&
      prevProps.initialVersion === nextProps.initialVersion &&
      prevProps.onRetry === nextProps.onRetry &&
      prevProps.onStartOver === nextProps.onStartOver
    )
  }
)

ValuationFlowSelector.displayName = 'ValuationFlowSelector'
