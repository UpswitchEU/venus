/**
 * EnhancedErrorBoundary Component
 *
 * Improved error boundary with specific error type handling,
 * recovery options, and user-friendly error displays.
 * Uses Venus ErrorFallback (Aurora design system).
 *
 * @module components/EnhancedErrorBoundary
 */

import React, { Component, ReactNode } from 'react'
import { ErrorFallback } from '@/components/ErrorFallback'
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

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      const error = this.state.error
      const userMessage = getUserFriendlyErrorMessage(error)
      const title = isRecoverableError(error) ? 'Something went wrong' : 'Critical error'

      return (
        <ErrorFallback
          error={error}
          reset={this.handleReset}
          homeHref="/"
          title={title}
          message={userMessage}
          variant="modal"
        />
      )
    }

    return this.props.children
  }
}
