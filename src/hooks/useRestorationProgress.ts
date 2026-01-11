/**
 * Restoration Progress Hook
 * 
 * World-Class Restoration Progress Tracking:
 * - Shows progress indicators during restoration
 * - Handles partial restoration gracefully
 * - Caches restoration state
 */

import { useState, useEffect, useCallback } from 'react'

export interface RestorationProgress {
  stage: 'idle' | 'loading' | 'restoring' | 'completed' | 'error'
  progress: number // 0-100
  currentStep: string
  completedSteps: string[]
  error: string | null
}

interface UseRestorationProgressOptions {
  reportId: string | null
  onProgressChange?: (progress: RestorationProgress) => void
}

const RESTORATION_STEPS = [
  'Loading session',
  'Restoring form data',
  'Restoring valuation results',
  'Loading version history',
  'Restoring normalization data',
] as const

/**
 * Hook for tracking restoration progress
 */
export function useRestorationProgress({
  reportId,
  onProgressChange,
}: UseRestorationProgressOptions): {
  progress: RestorationProgress
  updateProgress: (stage: RestorationProgress['stage'], step?: string, error?: string) => void
  reset: () => void
} {
  const [progress, setProgress] = useState<RestorationProgress>({
    stage: 'idle',
    progress: 0,
    currentStep: '',
    completedSteps: [],
    error: null,
  })

  const updateProgress = useCallback(
    (stage: RestorationProgress['stage'], step?: string, error?: string) => {
      setProgress((prev) => {
        const stepIndex = step ? RESTORATION_STEPS.indexOf(step as any) : -1
        const completedSteps = stepIndex >= 0 
          ? RESTORATION_STEPS.slice(0, stepIndex + 1)
          : prev.completedSteps
        
        const progressValue = stage === 'completed' 
          ? 100 
          : stage === 'error'
          ? prev.progress
          : stepIndex >= 0
          ? Math.round(((stepIndex + 1) / RESTORATION_STEPS.length) * 100)
          : prev.progress

        const newProgress: RestorationProgress = {
          stage,
          progress: progressValue,
          currentStep: step || prev.currentStep,
          completedSteps,
          error: error || null,
        }

        if (onProgressChange) {
          onProgressChange(newProgress)
        }

        return newProgress
      })
    },
    [onProgressChange]
  )

  const reset = useCallback(() => {
    setProgress({
      stage: 'idle',
      progress: 0,
      currentStep: '',
      completedSteps: [],
      error: null,
    })
  }, [])

  // Reset when reportId changes
  useEffect(() => {
    if (reportId) {
      reset()
    }
  }, [reportId, reset])

  return {
    progress,
    updateProgress,
    reset,
  }
}
