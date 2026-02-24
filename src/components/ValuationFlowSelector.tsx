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
import React, { lazy, Suspense, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { AlertCircle } from 'lucide-react'
import { GlassCard, AuroraButton } from '@/design-system'
import { useSessionStore } from '../store/useSessionStore'
import type { ValuationResponse, ValuationSession } from '../types/valuation'
import { CalculatorShellSkeleton } from './calculator'
import { ErrorState } from './ErrorState'

/**
 * Valuation flow stage types
 */
type Stage = 'loading' | 'data-entry' | 'processing' | 'flow-selection' | 'error'

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
  /** Initial tab to display (for Mercury integration) */
  initialTab?: 'preview' | 'history'
  /** URL action parameter (e.g., 'download' to trigger PDF download) */
  urlAction?: string
  /** Open chat drawer on mount when URL has drawer=open (Clarity parity) */
  initialDrawerOpen?: boolean
}

function LoadingErrorFallback() {
  const t = useTranslations('errors.loadingError')
  return (
    <div className="flex items-center justify-center h-full p-4">
      <GlassCard
        variant="default"
        glow="none"
        hover={false}
        className="max-w-md w-full text-center"
      >
        <div className="w-12 h-12 mx-auto mb-4 flex items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="w-6 h-6 text-destructive/70" aria-hidden />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">{t('title')}</h3>
        <p className="text-sm text-muted-foreground mb-6">{t('description')}</p>
        <AuroraButton
          onClick={() => window.location.reload()}
          variant="primary"
          size="lg"
        >
          {t('reloadPage')}
        </AuroraButton>
      </GlassCard>
    </div>
  )
}

// Lazy load unified flow component (Next.js compatible)
const ValuationFlow = lazy(() =>
  import('@/features/valuation/components/ValuationFlow')
    .then((module) => ({
      default: module.ValuationFlow,
    }))
    .catch((error) => {
      console.error('[ValuationFlowSelector] Failed to load ValuationFlow component', error)
      return { default: LoadingErrorFallback }
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
    initialTab = 'preview',
    urlAction,
    initialDrawerOpen = false,
  }) => {
    const tErrors = useTranslations('errors')
    // ✅ WORLD CLASS: Loading handled upstream by ValuationSessionManager
    // This component only renders when ValuationSessionManager stage is 'data-entry' (session is ready)

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
      return <CalculatorShellSkeleton />
    }

    if (stage === 'error' || error) {
      return (
        <div className="flex items-center justify-center h-full p-4">
          <ErrorState
            title={tErrors('session.title')}
            message={error ?? undefined}
            onRetry={onRetry}
            onBack={onStartOver ?? (!onRetry ? () => window.location.reload() : undefined)}
          />
        </div>
      )
    }

    if (stage === 'data-entry') {
      // ✅ WORLD CLASS: Loading is handled upstream by ValuationSessionManager
      // This component should only render when stage is 'data-entry' (session is ready)
      // No need for duplicate loading checks here - parent handles all loading states

      // Use reportId from props (always available) or validated session
      const effectiveReportId = session?.reportId || reportId

      // Always use manual flow (conversational has been removed)
      const flowType = 'manual' as const

      return (
        <div className="relative h-full w-full">
          {/* Render unified flow component based on session view */}
          {/* Smooth fade-in when skeleton transitions to content (smoother Mercury→Venus feel) */}
          <div key={flowKey} className="absolute inset-0 aurora-fade-in">
            <Suspense
              fallback={null}
              // ✅ WORLD CLASS: Remove Suspense fallback - loading handled upstream by ValuationSessionManager
              // This eliminates duplicate loading states and ensures single unified loading experience
            >
              <ValuationFlow
                reportId={effectiveReportId}
                flowType={flowType}
                onComplete={onComplete}
                initialQuery={prefilledQuery}
                autoSend={autoSend}
                initialMode={initialMode}
                initialVersion={initialVersion}
                initialTab={initialTab}
                urlAction={urlAction}
                initialDrawerOpen={initialDrawerOpen}
              />
            </Suspense>
          </div>
        </div>
      )
    }

    // Fallback - should not normally reach here
    return <CalculatorShellSkeleton />
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
