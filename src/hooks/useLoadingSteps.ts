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
 * Detect if URL indicates an existing report (before bootstrap completes)
 * This provides immediate visual feedback while bootstrap is processing
 */
function detectExistingReportFromUrl(): boolean {
  if (typeof window === 'undefined') return false
  
  const pathname = window.location.pathname
  
  // Check for report UUID in URL path: /reports/{uuid} or /en/reports/{uuid}
  // UUID format: 8-4-4-4-12 hex characters
  const uuidPattern = /\/reports\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  if (uuidPattern.test(pathname)) {
    return true
  }
  
  // Check for session key in URL path: /reports/val_xxx
  if (/\/reports\/val_[a-z0-9]+/i.test(pathname)) {
    return true
  }
  
  return false
}

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

    // ✅ WORLD CLASS: Detect existing report from URL BEFORE bootstrap completes
    // This provides immediate visual feedback that we're restoring, not creating
    if (!bootstrap?.report) {
      // Check URL for existing report indicators
      if (detectExistingReportFromUrl()) {
        return RESTORATION_STEPS
      }
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
