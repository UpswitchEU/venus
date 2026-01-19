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
    // If bootstrap is available and report mode is 'existing', use restoration steps
    // Otherwise, default to initialization steps (for new reports or when bootstrap isn't ready yet)
    const isExistingReport = bootstrap?.report.mode === 'existing'
    return isExistingReport ? RESTORATION_STEPS : INITIALIZATION_STEPS
  }, [bootstrap?.report.mode])
}
