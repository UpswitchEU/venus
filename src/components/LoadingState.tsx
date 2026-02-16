'use client'

import { Loader2, Check, Clock, AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react'
import React, { useEffect, useState, useCallback } from 'react'
import { AuroraButton } from '@/design-system'
import { GENERATION_STEPS, type LoadingStep } from './LoadingState.constants'

interface LoadingStateProps {
  steps?: LoadingStep[]
  variant?: 'light' | 'dark'
  centered?: boolean
  compact?: boolean // tighter vertical spacing (for preview panels)
  containerClassName?: string // optional override for outer container spacing
  onTimeout?: () => void // Callback when timeout is reached
  onRetry?: () => void // Callback when user clicks retry button
  returnUrl?: string // URL to return to if user wants to go back
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  steps = GENERATION_STEPS,
  variant = 'dark',
  centered = true,
  compact = false,
  containerClassName,
  onTimeout,
  onRetry,
  returnUrl,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false)
  const [showRetryOptions, setShowRetryOptions] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)

  const isDark = variant === 'dark'
  const totalEstimatedTime = steps.reduce((acc, step) => acc + (step.estimatedMs || 2000), 0)
  const WARNING_THRESHOLD = 15000 // 15 seconds - show warning
  const RETRY_THRESHOLD = 25000 // 25 seconds - show retry button
  const TIMEOUT_THRESHOLD = 45000 // 45 seconds - trigger timeout callback (increased from 30s)

  // Handle retry button click
  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry()
    } else {
      // Default behavior: reload the page
      window.location.reload()
    }
  }, [onRetry])

  // Handle return button click
  const handleReturn = useCallback(() => {
    if (returnUrl) {
      window.location.href = returnUrl
    } else {
      // Try to get stored return URL from sessionStorage
      const storedReturnUrl = sessionStorage.getItem('upswitch_return_url')
      if (storedReturnUrl) {
        window.location.href = storedReturnUrl
      } else {
        // Default: go to dashboard
        window.location.href = '/'
      }
    }
  }, [returnUrl])

  useEffect(() => {
    const startTime = Date.now()

    // Update elapsed time every 100ms
    const timeInterval = setInterval(() => {
      const elapsed = Date.now() - startTime
      setElapsedTime(elapsed)

      // Show warning at 15 seconds
      if (elapsed >= WARNING_THRESHOLD && !showTimeoutWarning) {
        setShowTimeoutWarning(true)
      }

      // Show retry options at 25 seconds
      if (elapsed >= RETRY_THRESHOLD && !showRetryOptions) {
        setShowRetryOptions(true)
      }

      // Timeout at 45 seconds
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
  }, [steps.length, showTimeoutWarning, showRetryOptions, onTimeout])

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
        `flex flex-col items-center w-full min-h-screen text-center ${baseContainer} bg-background`
      }
    >
      {/* Sage Green Spinner */}
      <div className={`relative ${compact ? 'mb-4' : 'mb-8'}`}>
        <Loader2
          className="w-12 h-12 animate-spin text-primary"
          strokeWidth={2}
        />
      </div>

      {/* Title */}
      <h3 className="text-xl font-semibold mb-2 text-foreground">
        {showTimeoutWarning ? 'Almost there...' : currentStep.text}
      </h3>

      {/* Description */}
      <p className="text-sm mb-6 text-muted-foreground">
        {showTimeoutWarning
          ? 'This is taking longer than usual. Please wait...'
          : currentStep.subtext || 'Preparing your workspace...'}
      </p>

      {/* Progress Bar */}
      <div className="w-full max-w-md h-2 rounded-full mb-6 overflow-hidden bg-foreground/10">
        <div
          className="h-full rounded-full transition-all duration-300 bg-primary"
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
                  <Check className="w-5 h-5 text-success" />
                )}
                {isActive && (
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                )}
                {isPending && (
                  <Clock className="w-5 h-5 text-foreground/40" />
                )}
              </div>

              {/* Label */}
              <span
                className={`text-sm ${
                  isActive
                    ? 'text-foreground font-medium'
                    : isCompleted
                      ? 'text-foreground/70'
                      : 'text-foreground/50'
                }`}
              >
                {step.text}
              </span>
            </div>
          )
        })}
      </div>

      {/* Warning Message */}
      {showTimeoutWarning && !showRetryOptions && (
        <div className="mt-6 flex items-start gap-2 p-3 rounded-lg max-w-md bg-warning/10 border border-warning/30">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-warning" />
          <div className="text-left">
            <p className="text-xs font-medium text-warning">
              Taking longer than expected...
            </p>
            <p className="text-xs mt-1 text-warning/80">
              Please wait a moment while we complete the setup.
            </p>
          </div>
        </div>
      )}

      {/* Retry Options - shown after extended wait */}
      {showRetryOptions && (
        <div className="mt-6 p-4 rounded-lg max-w-md bg-muted border border-foreground/10">
          <div className="flex items-start gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-warning" />
            <div className="text-left">
              <p className="text-sm font-medium text-foreground">
                This is taking longer than usual
              </p>
              <p className="text-xs mt-1 text-muted-foreground">
                There might be a connection issue. You can try again or return to the dashboard.
              </p>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <AuroraButton
              onClick={handleRetry}
              variant="primary"
              size="lg"
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </AuroraButton>
            <AuroraButton
              onClick={handleReturn}
              variant="ghost"
              size="lg"
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Go Back
            </AuroraButton>
          </div>
        </div>
      )}

      {/* Estimated Time Remaining */}
      {!showTimeoutWarning && elapsedTime < totalEstimatedTime && (
        <div className="mt-4 text-xs text-muted-foreground">
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
