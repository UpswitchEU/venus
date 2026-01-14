'use client'

import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'

const ACCESS_STEPS = [
  {
    title: 'Verifying Access',
    message: 'Checking your permissions...',
  },
  {
    title: 'Loading Report',
    message: 'Fetching valuation data...',
  },
  {
    title: 'Preparing Interface',
    message: 'Setting up your workspace...',
  },
]

export function LoadingState() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false)

  useEffect(() => {
    // Cycle through steps every 2 seconds
    const interval = setInterval(() => {
      setCurrentStepIndex((prev) => (prev + 1) % ACCESS_STEPS.length)
    }, 2000)

    // Show warning after 15 seconds
    const warningTimer = setTimeout(() => {
      setShowTimeoutWarning(true)
    }, 15000)

    return () => {
      clearInterval(interval)
      clearTimeout(warningTimer)
    }
  }, [])

  const currentStep = ACCESS_STEPS[currentStepIndex]

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        {/* Animated loader */}
        <div className="relative group mb-6">
          {/* Outer pulsing rings */}
          <div
            className="absolute inset-0 rounded-full animate-ping bg-primary-400/20"
            style={{ animationDuration: '3s' }}
          />
          <div
            className="absolute inset-0 rounded-full animate-ping bg-primary-300/10"
            style={{ animationDuration: '4s', animationDelay: '1s' }}
          />

          {/* Inner container */}
          <div className="relative p-8 rounded-2xl shadow-sm border border-zinc-800 bg-zinc-900 z-10 flex items-center justify-center">
            <Loader2
              className="w-12 h-12 animate-spin text-primary-400"
              strokeWidth={1.5}
            />
          </div>
        </div>

        {/* Step indicator */}
        <div className="mb-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
          <span className="text-xs font-semibold tracking-wide uppercase px-3 py-1.5 rounded-full text-primary-300 bg-primary-900/30 border border-primary-800/50">
            Step {currentStepIndex + 1} of {ACCESS_STEPS.length}
          </span>
        </div>

        {/* Animated text transition */}
        <div className="flex flex-col items-center">
          <h3 className="text-2xl font-bold text-white mb-2 animate-in fade-in slide-in-from-bottom-3 duration-700 delay-150">
            {currentStep.title}
          </h3>
          <p className="text-gray-400 text-base animate-in fade-in slide-in-from-bottom-4 duration-700 delay-200">
            {currentStep.message}
          </p>
        </div>

        {/* Timeout warning */}
        {showTimeoutWarning && (
          <div className="mt-6 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg animate-in fade-in slide-in-from-bottom-2 duration-500">
            <p className="text-yellow-200/90 text-sm">
              This is taking longer than expected. Please check your internet connection.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
