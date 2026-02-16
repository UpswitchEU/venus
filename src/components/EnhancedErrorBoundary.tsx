/**
 * EnhancedErrorBoundary Component
 *
 * Improved error boundary with specific error type handling,
 * recovery options, and user-friendly error displays.
 *
 * @module components/EnhancedErrorBoundary
 */

import { AlertTriangle, Home, RefreshCw } from 'lucide-react'
import React, { Component, ReactNode } from 'react'
import { getUserFriendlyErrorMessage, isRecoverableError, isValuationError } from '../types/errors'
import { chatLogger } from '../utils/logger'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
  onReset?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: React.ErrorInfo | null
}

/**
 * Enhanced Error Boundary with specific error handling
 *
 * Features:
 * - Specific error type recognition
 * - Recovery options for recoverable errors
 * - User-friendly error messages
 * - Error logging
 * - Reset functionality
 */
export class EnhancedErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error details
    chatLogger.error('Error boundary caught error', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      isValuationError: isValuationError(error),
      recoverable: isRecoverableError(error),
    })

    // Call onError callback if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    this.setState({
      errorInfo,
    })
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })

    if (this.props.onReset) {
      this.props.onReset()
    }
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      const error = this.state.error
      const isRecoverable = isRecoverableError(error)
      const userMessage = getUserFriendlyErrorMessage(error)

      // Get additional context if it's a ValuationError
      const context = isValuationError(error) ? error.context : undefined

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-card border border-foreground/10 rounded-lg p-6 sm:p-8">
            {/* Icon */}
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-destructive" />
              </div>
            </div>

            {/* Error Title */}
            <h2 className="text-2xl font-bold text-foreground text-center mb-2">
              {isRecoverable ? 'Something went wrong' : 'Critical error'}
            </h2>

            {/* Error Message */}
            <p className="text-muted-foreground text-center mb-6">{userMessage}</p>

            {/* Error Code (if available) */}
            {isValuationError(error) && (
              <div className="bg-muted border border-foreground/10 rounded p-3 mb-6">
                <div className="text-xs text-muted-foreground mb-1">Error Code</div>
                <div className="text-sm font-mono text-foreground">{error.code}</div>
              </div>
            )}

            {/* Context Info (in development mode) */}
            {process.env.NODE_ENV === 'development' && context && (
              <details className="bg-muted border border-foreground/10 rounded p-3 mb-6">
                <summary className="text-xs text-muted-foreground cursor-pointer">
                  Technical Details (Dev Mode)
                </summary>
                <pre className="mt-2 text-xs text-muted-foreground overflow-auto">
                  {JSON.stringify(context, null, 2)}
                </pre>
              </details>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              {isRecoverable && (
                <button
                  onClick={this.handleReset}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-colors font-medium"
                >
                  <RefreshCw className="w-4 h-4" />
                  Try Again
                </button>
              )}
              <button
                onClick={this.handleGoHome}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors font-medium"
              >
                <Home className="w-4 h-4" />
                Go Home
              </button>
            </div>

            {/* Stack Trace (development only) */}
            {process.env.NODE_ENV === 'development' && this.state.error.stack && (
              <details className="mt-6 bg-background border border-foreground/10 rounded p-4">
                <summary className="text-xs text-muted-foreground cursor-pointer">
                  Stack Trace (Dev Mode)
                </summary>
                <pre className="mt-2 text-xs text-muted-foreground overflow-auto max-h-48">
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
