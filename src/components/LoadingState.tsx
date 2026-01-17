'use client'

import { Loader2, Check, Clock, AlertTriangle } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { GENERATION_STEPS, type LoadingStep } from './LoadingState.constants'

interface LoadingStateProps {
  steps?: LoadingStep[]
  variant?: 'light' | 'dark'
  centered?: boolean
  compact?: boolean // tighter vertical spacing (for preview panels)
  containerClassName?: string // optional override for outer container spacing
  onTimeout?: () => void // Callback when timeout is reached
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  steps = GENERATION_STEPS,
  variant = 'light',
  centered = true,
  compact = false,
  containerClassName,
  onTimeout,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)

  const isDark = variant === 'dark'
  const totalEstimatedTime = steps.reduce((acc, step) => acc + (step.estimatedMs || 2000), 0)
  const WARNING_THRESHOLD = 20000 // 20 seconds
  const TIMEOUT_THRESHOLD = 30000 // 30 seconds

  useEffect(() => {
    const startTime = Date.now()

    // Update elapsed time every 100ms
    const timeInterval = setInterval(() => {
      const elapsed = Date.now() - startTime
      setElapsedTime(elapsed)

      // Show warning at 20 seconds
      if (elapsed >= WARNING_THRESHOLD && !showTimeoutWarning) {
        setShowTimeoutWarning(true)
      }

      // Timeout at 30 seconds
      if (elapsed >= TIMEOUT_THRESHOLD) {
        clearInterval(timeInterval)
        clearInterval(stepInterval)
        if (onTimeout) onTimeout()
      }
    }, 100)

    // Cycle through steps every 2 seconds
    const stepInterval = setInterval(() => {
      setCurrentStepIndex((prev) => {
        const nextIndex = prev + 1
        if (nextIndex >= steps.length) {
          // Loop back to last step if it takes longer than expected
          return steps.length - 1
        }
        return nextIndex
      })
    }, 2000)

    return () => {
      clearInterval(timeInterval)
      clearInterval(stepInterval)
    }
  }, [steps.length, showTimeoutWarning, onTimeout])

  const currentStep = steps[currentStepIndex]
  const progress = Math.min(95, (elapsedTime / totalEstimatedTime) * 100)

  const baseContainer = centered
    ? 'justify-center min-h-[300px] px-4 py-6'
    : 'justify-start min-h-[200px] px-4 py-2'

  // BANK GRADE: Full-screen loading with sage green primary color
  return (
    <div
      className={
        containerClassName ||
        `flex flex-col items-center w-full min-h-screen text-center ${baseContainer} ${
          isDark ? 'bg-zinc-950' : 'bg-white'
        }`
      }
    >
      {/* Sage Green Spinner */}
      <div className={`relative ${compact ? 'mb-4' : 'mb-8'}`}>
        <Loader2
          className={`w-12 h-12 animate-spin ${isDark ? 'text-primary-400' : 'text-primary-600'}`}
          strokeWidth={2}
        />
      </div>

      {/* Title */}
      <h3
        className={`text-xl font-semibold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}
      >
        {showTimeoutWarning ? 'Almost there...' : currentStep.text}
      </h3>

      {/* Description */}
      <p className={`text-sm mb-6 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
        {showTimeoutWarning
          ? 'This is taking longer than usual. Please wait...'
          : currentStep.subtext || 'Preparing your workspace...'}
      </p>

      {/* Progress Bar */}
      <div
        className={`w-full max-w-md h-2 rounded-full mb-6 overflow-hidden ${
          isDark ? 'bg-gray-800' : 'bg-gray-200'
        }`}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isDark ? 'bg-primary-500' : 'bg-primary-600'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Steps with Icons */}
      <div className="space-y-3 text-left w-full max-w-md">
        {steps.map((step, index) => {
          const isCompleted = index < currentStepIndex
          const isActive = index === currentStepIndex
          const isPending = index > currentStepIndex

          return (
            <div key={index} className="flex items-center gap-3">
              {/* Icon */}
              <div className="flex-shrink-0">
                {isCompleted && (
                  <Check className={`w-5 h-5 ${isDark ? 'text-green-400' : 'text-green-500'}`} />
                )}
                {isActive && (
                  <Loader2
                    className={`w-5 h-5 animate-spin ${
                      isDark ? 'text-primary-400' : 'text-primary-600'
                    }`}
                  />
                )}
                {isPending && (
                  <Clock className={`w-5 h-5 ${isDark ? 'text-gray-600' : 'text-gray-400'}`} />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-sm ${
                  isActive
                    ? isDark
                      ? 'text-white font-medium'
                      : 'text-gray-900 font-medium'
                    : isCompleted
                      ? isDark
                        ? 'text-gray-300'
                        : 'text-gray-700'
                      : isDark
                        ? 'text-gray-600'
                        : 'text-gray-400'
                }`}
              >
                {step.text}
              </span>
            </div>
          )
        })}
      </div>

      {/* Warning Message */}
      {showTimeoutWarning && (
        <div
          className={`mt-6 flex items-start gap-2 p-3 rounded-lg max-w-md ${
            isDark
              ? 'bg-amber-900/30 border border-amber-700'
              : 'bg-amber-50 border border-amber-200'
          }`}
        >
          <AlertTriangle
            className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
              isDark ? 'text-amber-400' : 'text-amber-600'
            }`}
          />
          <div className="text-left">
            <p className={`text-xs font-medium ${isDark ? 'text-amber-400' : 'text-amber-800'}`}>
              Still loading...
            </p>
            <p className={`text-xs mt-1 ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>
              If this persists, please check your internet connection or try refreshing.
            </p>
          </div>
        </div>
      )}

      {/* Estimated Time Remaining */}
      {!showTimeoutWarning && elapsedTime < totalEstimatedTime && (
        <div className={`mt-4 text-xs ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
          Estimated time: {Math.ceil((totalEstimatedTime - elapsedTime) / 1000)}s remaining
        </div>
      )}
    </div>
  )
}

/**
 * Compact variant for preview panels (tighter spacing, smaller container padding).
 * Keeps the default LoadingState untouched for the main calculator.
 */
export const CompactLoadingState: React.FC<
  Omit<LoadingStateProps, 'compact' | 'containerClassName'>
> = (props) => {
  return (
    <LoadingState
      {...props}
      compact
      centered
      containerClassName="flex flex-col items-center w-full h-full max-w-lg mx-auto text-center justify-center min-h-[220px] px-3 py-3"
    />
  )
}
