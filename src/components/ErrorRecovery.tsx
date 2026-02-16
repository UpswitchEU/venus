/**
 * ErrorRecovery Component
 * Provides error recovery UI with retry functionality
 * Uses Aurora design system (AuroraButton).
 */

import { AlertTriangle, RefreshCw, X } from 'lucide-react'
import React from 'react'
import { AuroraButton } from '@/design-system'
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
    <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 mb-4 backdrop-blur-sm">
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
            <div className="mt-3 p-3 bg-success/10 border border-success/30 rounded-lg">
              <p className="text-sm text-success font-medium mb-1">Partial results available</p>
              <p className="text-xs text-muted-foreground">
                Some sections were generated before the error occurred. You can view them below.
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-4 flex gap-2">
            {errorInfo.retryable && onRetry && (
              <AuroraButton
                onClick={onRetry}
                variant="primary"
                size="sm"
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </AuroraButton>
            )}
            {onDismiss && (
              <AuroraButton
                onClick={onDismiss}
                variant="outline"
                size="sm"
                className="gap-2"
              >
                <X className="h-4 w-4" />
                Dismiss
              </AuroraButton>
            )}
          </div>

          {/* Error details (collapsible for debugging) */}
          {process.env.NODE_ENV === 'development' && (
            <details className="mt-3">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                Error details (dev only)
              </summary>
              <pre className="mt-2 text-xs bg-muted/50 p-2 rounded-lg overflow-auto max-h-40 text-muted-foreground border border-foreground/[0.06]">
                {JSON.stringify(errorInfo, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}
