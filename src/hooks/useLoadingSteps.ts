/**
 * useLoadingSteps Hook
 * 
 * World-class hook for determining the appropriate loading steps based on bootstrap mode.
 * Provides consistent loading state differentiation between new report creation and existing report restoration.
 * 
 * @module hooks/useLoadingSteps
 */

import { useMemo } from 'react'
import { useBootstrapSafe } from '../lib/bootstrap'
import {
  INITIALIZATION_STEPS,
  RESTORATION_STEPS,
  DRAFT_RESTORATION_STEPS,
  type LoadingStep,
} from '../components/LoadingState.constants'

/**
 * Hook to determine loading steps based on bootstrap report mode
 *
 * WORLD-CLASS: Provides clear, distinct loading states for different scenarios:
 * - New report → "Initializing workspace..." (INITIALIZATION_STEPS)
 * - Draft (in-progress) → "Restoring draft..." (DRAFT_RESTORATION_STEPS)
 * - Completed report → "Restoring valuation..." (RESTORATION_STEPS)
 *
 * @returns Loading steps array appropriate for the current bootstrap state
 *
 * @example
 * ```tsx
 * const loadingSteps = useLoadingSteps()
 * return <LoadingState steps={loadingSteps} variant="light" />
 * ```
 */
export function useLoadingSteps(): LoadingStep[] {
  const bootstrap = useBootstrapSafe()

  return useMemo(() => {
    // Loading step logic:
    //
    // 1. mode: 'new' (no session) → INITIALIZATION_STEPS
    //    "Validating access", "Creating session", "Loading valuation engine"
    //
    // 2. mode: 'existing' + !hasValuationResult → DRAFT_RESTORATION_STEPS
    //    "Restoring draft", "Recovering form data", "Preparing workspace"
    //
    // 3. mode: 'existing' + hasValuationResult → RESTORATION_STEPS
    //    "Restoring valuation", "Preparing results", "Finalizing report"

    // Not bootstrapped yet - show initialization steps
    if (!bootstrap?.report) {
      return INITIALIZATION_STEPS
    }

    // New report - show initialization steps
    if (bootstrap.report.mode === 'new') {
      return INITIALIZATION_STEPS
    }

    // Existing report with completed valuation - show restoration steps
    if (bootstrap.report.hasValuationResult) {
      return RESTORATION_STEPS
    }

    // Existing draft (has data but no valuation result) - show draft steps
    if (bootstrap.report.hasExistingData) {
      return DRAFT_RESTORATION_STEPS
    }

    // Fallback to initialization steps
    return INITIALIZATION_STEPS
  }, [bootstrap?.report])
}
