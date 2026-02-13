/**
 * ErrorMessage Component
 *
 * Single Responsibility: Display error messages with retry functionality
 * for network and timeout errors.
 *
 * Bank-Grade Excellence Framework Implementation:
 * - User-friendly error messages
 * - Retry functionality for recoverable errors
 * - Brand color consistency (accent=red, harvest=orange, primary=green)
 *
 * @module components/chat/ErrorMessage
 */

import { AlertCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react'
import React from 'react'
import type { ApplicationError } from '../../utils/errors/ApplicationErrors'
import { isRetryable } from '../../utils/errors/errorGuards'

export interface ErrorMessageProps {
  /** Error message content */
  message: string
  /** Error type for determining retry capability */
  error?: { code?: string; message?: string } | ApplicationError
  /** Callback when retry button is clicked */
  onRetry?: () => void | Promise<void>
  /** Whether retry is in progress */
  isRetrying?: boolean
  /** Additional context or details */
  details?: string
}

/**
 * ErrorMessage Component
 *
 * Displays error messages with:
 * - Clear, user-friendly messaging
 * - Retry button for network/timeout errors
 * - Brand-consistent styling
 * - Helpful error details
 *
 * @example
 * ```tsx
 * <ErrorMessage
 *   message="Failed to send message"
 *   error={networkError}
 *   onRetry={() => retrySubmission()}
 *   isRetrying={isRetrying}
 * />
 * ```
 */
function ErrorMessageComponent(props: ErrorMessageProps): React.JSX.Element {
  const { message, error, onRetry, isRetrying = false, details } = props

  // Ensure message is a string for type safety
  const messageText: string = typeof message === 'string' ? message : String(message)

  const canRetry = error && isRetryable(error) && onRetry
  const errorCode =
    error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined
  const isNetworkError = errorCode === 'NETWORK_ERROR'
  const isTimeoutError = errorCode === 'TIMEOUT_ERROR'

  // Determine icon based on error type
  const ErrorIcon = isNetworkError ? WifiOff : isTimeoutError ? Wifi : AlertCircle

  // Determine color scheme based on error type
  const getColorClasses = () => {
    if (isNetworkError || isTimeoutError) {
      // Network/timeout errors: accent (red) for error, harvest (orange) for retry
      return {
        container: 'bg-accent-600/10 border-accent-600/30',
        icon: 'text-accent-500',
        title: 'text-accent-200',
        messageText: 'text-zinc-200',
        details: 'text-zinc-400',
        retryButton: 'bg-harvest-600 hover:bg-harvest-500 text-white',
      }
    }
    // Other errors: accent (red) for error
    return {
      container: 'bg-accent-600/10 border-accent-600/30',
      icon: 'text-accent-500',
      title: 'text-accent-200',
      messageText: 'text-zinc-200',
      details: 'text-zinc-400',
      retryButton: 'bg-harvest-600 hover:bg-harvest-500 text-white',
    }
  }

  const colors = getColorClasses()

  return (
    <div className={`rounded-lg border p-4 ${colors.container} backdrop-blur-sm`}>
      <div className="flex items-start gap-3">
        {/* Error Icon */}
        <div className={`flex-shrink-0 ${colors.icon}`}>
          <ErrorIcon className="w-5 h-5" />
        </div>

        {/* Error Content */}
        <div className="flex-1 min-w-0">
          {/* Error Title */}
          <div className={`font-semibold text-sm mb-1 ${colors.title}`}>
            {isNetworkError ? 'Connection Error' : isTimeoutError ? 'Request Timeout' : 'Error'}
          </div>

          {/* Error Message */}
          <div className={`text-sm mb-2 ${colors.messageText}`}>{messageText}</div>

          {/* Error Details */}
          {details && typeof details === 'string' && (
            <div className={`text-xs mb-3 ${colors.details}`}>{details}</div>
          )}

          {/* Retry Button */}
          {canRetry && (
            <button
              onClick={onRetry}
              disabled={isRetrying}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${colors.retryButton}`}
            >
              <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
              {isRetrying ? 'Retrying...' : 'Retry'}
            </button>
          )}

          {/* Helpful Suggestions */}
          {isNetworkError && !canRetry && (
            <div className={`text-xs mt-2 ${colors.details}`}>
              Please check your internet connection and try again.
            </div>
          )}
          {isTimeoutError && !canRetry && (
            <div className={`text-xs mt-2 ${colors.details}`}>
              The request took too long. Please try again.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export const ErrorMessage = React.memo(ErrorMessageComponent) as React.FC<ErrorMessageProps>

ErrorMessage.displayName = 'ErrorMessage'
