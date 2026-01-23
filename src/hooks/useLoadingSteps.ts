/**
 * useLoadingSteps Hook
 * 
 * World-class hook for determining the appropriate loading steps based on bootstrap mode.
 * Provides consistent loading state differentiation between new report creation and existing report restoration.
 * 
 * PERFORMANCE FIX: Loading steps are now "locked" once determined to prevent flickering
 * when bootstrap mode transitions during loading.
 * 
 * @module hooks/useLoadingSteps
 */

import { useMemo, useState } from 'react'
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
 * PERFORMANCE FIX: Loading steps are "locked" based on URL detection to prevent
 * flickering when bootstrap mode transitions. Once we detect an existing report
 * from the URL, we show restoration steps and don't change even if bootstrap
 * temporarily returns 'new' mode due to race conditions.
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
  
  // PURE INITIALIZATION: Detect URL pattern once on mount using lazy useState
  // This runs only once and avoids mutations inside useMemo
  const [urlIndicatesExisting] = useState(() => detectExistingReportFromUrl())
  
  // PURE INITIALIZATION: Lock initial steps based on URL detection
  // This ensures consistent loading message from first render
  const [initialSteps] = useState<LoadingStep[]>(() => 
    urlIndicatesExisting ? RESTORATION_STEPS : INITIALIZATION_STEPS
  )

  // Pure computation based on bootstrap state
  // No mutations - useMemo is now side-effect free
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

    // If URL indicated existing report, use locked steps until bootstrap confirms
    // This prevents flickering if bootstrap temporarily returns 'new' mode
    if (urlIndicatesExisting) {
      // Bootstrap hasn't loaded yet - use initial locked steps
      if (!bootstrap?.report) {
        return initialSteps
      }
      
      // Bootstrap says 'new' but URL says existing - keep showing restoration
      // This handles race conditions where session lookup temporarily fails
      if (bootstrap.report.mode === 'new') {
        return initialSteps
      }
      
      // Bootstrap confirms existing - refine based on report state
      if (bootstrap.report.mode === 'existing') {
        if (bootstrap.report.hasValuationResult) {
          return RESTORATION_STEPS
        }
        if (bootstrap.report.hasExistingData) {
          return DRAFT_RESTORATION_STEPS
        }
        return RESTORATION_STEPS
      }
    }

    // URL indicates new report flow
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

    // Fallback based on URL detection
    return urlIndicatesExisting ? RESTORATION_STEPS : INITIALIZATION_STEPS
  }, [bootstrap?.report, urlIndicatesExisting, initialSteps])
}
