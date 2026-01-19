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
import { INITIALIZATION_STEPS, RESTORATION_STEPS, type LoadingStep } from '../components/LoadingState.constants'

/**
 * Hook to determine loading steps based on bootstrap report mode
 * 
 * @returns Loading steps array - RESTORATION_STEPS for existing reports, INITIALIZATION_STEPS for new reports
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
    // Only show restoration steps if there's a completed valuation (OUTPUT data)
    // 
    // Distinction:
    // - hasExistingData = true if ANY data exists (company_name, revenue, etc.) = INPUT data
    // - hasValuationResult = true if valuation OUTPUT exists (valuation result, HTML report)
    // 
    // Loading step logic:
    // - New report (no session) → "Initializing workspace"
    // - Draft (session with form data, no valuation) → "Loading your draft" (use INITIALIZATION)
    // - Complete (session with valuation output) → "Restoring valuation package" (use RESTORATION)
    const hasValuationOutput = bootstrap?.report.hasValuationResult === true
    return hasValuationOutput ? RESTORATION_STEPS : INITIALIZATION_STEPS
  }, [bootstrap?.report.hasValuationResult])
}
