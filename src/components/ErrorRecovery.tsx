/**
 * ErrorRecovery Component
 * Provides error recovery UI with retry functionality
 */

import { AlertTriangle, RefreshCw, X } from 'lucide-react'
import React from 'react'
import { ErrorType, extractErrorInfo } from '../utils/errorHandler'

interface ErrorRecoveryProps {
  error: Error | string
  onRetry?: () => void
  onDismiss?: () => void
  showPartialResults?: boolean
  partialResults?: Record<string, unknown>
}

export const ErrorRecovery: React.FC<ErrorRecoveryProps> = ({
  error,
  onRetry,
  onDismiss,
  showPartialResults = false,
  partialResults,
}) => {
  const errorInfo = extractErrorInfo(error instanceof Error ? error : new Error(error))

  if (errorInfo.type === ErrorType.CANCELLED) {
    // Don't show error UI for cancelled requests
    return null
  }

  return (
    <div className="bg-destructive/10 border-l-4 border-destructive/30 rounded-r-lg p-4 mb-4 backdrop-blur-sm">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-foreground">
            {errorInfo.type === ErrorType.TIMEOUT ? 'Calculation Timeout' : 'Error Occurred'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{errorInfo.userMessage}</p>

          {/* Show partial results if available */}
          {showPartialResults && partialResults && (
            <div className="mt-3 p-3 bg-success/10 border border-success/30 rounded">
              <p className="text-sm text-success font-medium mb-1">Partial results available</p>
              <p className="text-xs text-muted-foreground">
                Some sections were generated before the error occurred. You can view them below.
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-4 flex gap-2">
            {errorInfo.retryable && onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="inline-flex items-center px-3 py-2 border border-foreground/20 text-sm leading-4 font-medium rounded-md text-foreground bg-muted hover:bg-muted/80 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-foreground/20 transition-colors"
              >
                <X className="h-4 w-4 mr-2" />
                Dismiss
              </button>
            )}
          </div>

          {/* Error details (collapsible for debugging) */}
          {process.env.NODE_ENV === 'development' && (
            <details className="mt-3">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Error details (dev only)
              </summary>
              <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-auto max-h-40 text-muted-foreground">
                {JSON.stringify(errorInfo, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
