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
import { detectExistingReportFromUrl } from '../utils/identifiers'

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

  // WORLD-CLASS: Pure computation based on URL detection first, then bootstrap state
  // Key principle: URL detection is authoritative for loading message consistency
  // This prevents flickering when bootstrap mode transitions during loading
  return useMemo(() => {
    // CRITICAL: If URL indicates existing report, ALWAYS show restoration steps
    // This is the single source of truth for loading message consistency
    // Never switch to initialization steps for existing reports
    if (urlIndicatesExisting) {
      // Only refine between RESTORATION_STEPS and DRAFT_RESTORATION_STEPS
      // Never show INITIALIZATION_STEPS for existing report URLs
      if (bootstrap?.report?.mode === 'existing') {
        if (bootstrap.report.hasValuationResult) {
          return RESTORATION_STEPS
        }
        if (bootstrap.report.hasExistingData) {
          return DRAFT_RESTORATION_STEPS
        }
      }
      // Default to restoration steps for any existing report URL
      return initialSteps
    }

    // URL indicates new report flow - can use bootstrap state directly
    if (!bootstrap?.report) {
      return INITIALIZATION_STEPS
    }

    // Bootstrap confirms new report
    if (bootstrap.report.mode === 'new') {
      return INITIALIZATION_STEPS
    }

    // Edge case: URL didn't indicate existing but bootstrap found existing
    // This can happen with UUID-based URLs from Mercury
    if (bootstrap.report.hasValuationResult) {
      return RESTORATION_STEPS
    }
    if (bootstrap.report.hasExistingData) {
      return DRAFT_RESTORATION_STEPS
    }

    // Final fallback
    return INITIALIZATION_STEPS
  }, [bootstrap?.report, urlIndicatesExisting, initialSteps])
}
