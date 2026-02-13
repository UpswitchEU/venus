/**
 * Error Display Component
 *
 * Single Responsibility: Display error messages in conversational layout.
 *
 * @module features/conversational/components/ErrorDisplay
 */

import React from 'react'

/**
 * Error Display Props
 */
interface ErrorDisplayProps {
  /** Error message to display */
  error: string | null
}

/**
 * Error Display Component
 *
 * Displays error messages with consistent styling.
 *
 * PERFORMANCE: Memoized to prevent unnecessary re-renders when error hasn't changed
 */
export const ErrorDisplay: React.FC<ErrorDisplayProps> = React.memo(({ error }) => {
  if (!error) {
    return null
  }

  return (
    <div className="mx-4 mb-4">
      <div className="bg-rust-500/20 border border-rust-600/30 rounded-lg p-4">
        <div className="flex items-center gap-2 text-rust-300">
          <span className="text-rust-400">⚠️</span>
          <span className="font-medium">Error</span>
        </div>
        <p className="text-rust-200 text-sm mt-1">{error}</p>
      </div>
    </div>
  )
})

ErrorDisplay.displayName = 'ErrorDisplay'
