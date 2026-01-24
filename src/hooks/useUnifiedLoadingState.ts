/**
 * Unified Loading State Hook
 *
 * Consolidates all loading state sources into a single, predictable state machine.
 * This resolves the complexity of having multiple state sources (bootstrap, session store,
 * restoration service, URL detection) by providing a clear precedence and single source of truth.
 *
 * State Machine:
 * ```
 * DETECTING → BOOTSTRAPPING → RESTORING → READY
 *                          ↘ ERROR
 * ```
 *
 * State Precedence (highest to lowest):
 * 1. URL Detection - Immediate feedback before any async operations
 * 2. Bootstrap State - Server-side state resolution
 * 3. Session Store Status - Client-side session loading
 * 4. Restoration Service - Asset hydration progress
 *
 * @module hooks/useUnifiedLoadingState
 */

import { useMemo } from 'react'
import { useBootstrapSafe } from '../lib/bootstrap'
import { useSessionStore } from '../store/useSessionStore'
import { SessionRestorationService } from '../services/session/SessionRestorationService'
import { detectExistingReportFromUrl } from '../utils/identifiers'

/**
 * Unified loading states
 */
export type UnifiedLoadingState =
  | 'detecting'      // Initial state - checking URL for report ID
  | 'bootstrapping'  // Fetching bootstrap data from server
  | 'restoring'      // Hydrating stores with session data
  | 'ready'          // All data loaded, UI can render
  | 'error'          // An error occurred

/**
 * Loading state metadata
 */
export interface LoadingStateInfo {
  /** Current state */
  state: UnifiedLoadingState
  /** Whether loading is in progress (any state except ready/error) */
  isLoading: boolean
  /** Whether an error occurred */
  isError: boolean
  /** Error message if any */
  errorMessage: string | null
  /** Whether this looks like an existing report (for loading message selection) */
  isExistingReport: boolean
  /** Progress percentage (0-100) for progress bars */
  progress: number
  /** Human-readable status message */
  message: string
  /** Debug info for troubleshooting */
  debug: {
    urlDetection: 'existing' | 'new' | 'unknown'
    bootstrapState: 'loading' | 'complete' | 'error' | 'idle'
    sessionState: 'idle' | 'loading' | 'loaded' | 'error'
    restorationState: 'idle' | 'in_progress' | 'complete'
  }
}

/**
 * State messages for each loading state
 */
const STATE_MESSAGES: Record<UnifiedLoadingState, string> = {
  detecting: 'Checking session...',
  bootstrapping: 'Loading workspace...',
  restoring: 'Restoring your data...',
  ready: 'Ready',
  error: 'Something went wrong',
}

/**
 * Progress percentages for each state
 */
const STATE_PROGRESS: Record<UnifiedLoadingState, number> = {
  detecting: 10,
  bootstrapping: 40,
  restoring: 70,
  ready: 100,
  error: 0,
}

/**
 * Hook to get unified loading state
 *
 * Consolidates multiple state sources into a single, predictable state machine.
 *
 * @param reportId - Current report ID from URL
 * @returns Unified loading state information
 *
 * @example
 * ```tsx
 * const { state, isLoading, isExistingReport, message, progress } = useUnifiedLoadingState(reportId)
 *
 * if (isLoading) {
 *   return <LoadingIndicator message={message} progress={progress} />
 * }
 * ```
 */
export function useUnifiedLoadingState(reportId: string | null): LoadingStateInfo {
  const bootstrap = useBootstrapSafe()
  const sessionStatus = useSessionStore((state) => state.status)
  const sessionError = useSessionStore((state) => state.errorMessage)

  return useMemo(() => {
    // Step 1: URL Detection
    const urlIndicatesExisting = detectExistingReportFromUrl()
    const urlDetection = reportId ? (urlIndicatesExisting ? 'existing' : 'new') : 'unknown'

    // Step 2: Bootstrap State
    const isBootstrapping = bootstrap?.isBootstrapping ?? true
    const bootstrapError = bootstrap?.bootstrapError ?? null
    const bootstrapComplete = bootstrap && !isBootstrapping && !bootstrapError
    const bootstrapState = bootstrapError ? 'error' : isBootstrapping ? 'loading' : bootstrapComplete ? 'complete' : 'idle'

    // Step 3: Session Store State
    const sessionState = sessionStatus

    // Step 4: Restoration State
    const isRestorationInProgress = reportId ? SessionRestorationService.isRestorationInProgress(reportId) : false
    const isRestored = reportId ? SessionRestorationService.isRestored(reportId) : false
    const restorationState = isRestorationInProgress ? 'in_progress' : isRestored ? 'complete' : 'idle'

    // Determine unified state based on precedence
    let state: UnifiedLoadingState
    let isExistingReport = urlIndicatesExisting

    if (bootstrapError || sessionStatus === 'error') {
      state = 'error'
    } else if (!bootstrap || isBootstrapping) {
      state = 'bootstrapping'
    } else if (sessionStatus === 'loading') {
      state = bootstrapComplete && bootstrap.report.mode === 'existing' ? 'restoring' : 'bootstrapping'
      isExistingReport = bootstrap.report.mode === 'existing'
    } else if (isRestorationInProgress) {
      state = 'restoring'
      isExistingReport = true
    } else if (sessionStatus === 'loaded' || sessionStatus === 'idle') {
      // Check if we're waiting for restoration to complete
      if (bootstrap?.report.mode === 'existing' && !isRestored && bootstrap.report.hasExistingData) {
        state = 'restoring'
        isExistingReport = true
      } else {
        state = 'ready'
        isExistingReport = bootstrap?.report.mode === 'existing'
      }
    } else {
      state = 'detecting'
    }

    const errorMessage = bootstrapError || sessionError || null

    return {
      state,
      isLoading: state !== 'ready' && state !== 'error',
      isError: state === 'error',
      errorMessage,
      isExistingReport,
      progress: STATE_PROGRESS[state],
      message: isExistingReport && state === 'bootstrapping'
        ? 'Restoring your valuation...'
        : errorMessage || STATE_MESSAGES[state],
      debug: {
        urlDetection,
        bootstrapState,
        sessionState,
        restorationState,
      },
    }
  }, [
    reportId,
    bootstrap,
    sessionStatus,
    sessionError,
  ])
}

/**
 * Type guard for checking if loading is complete
 */
export function isLoadingComplete(state: LoadingStateInfo): boolean {
  return state.state === 'ready'
}

/**
 * Type guard for checking if loading failed
 */
export function isLoadingFailed(state: LoadingStateInfo): boolean {
  return state.state === 'error'
}
