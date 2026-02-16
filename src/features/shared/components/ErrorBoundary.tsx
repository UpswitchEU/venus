/**
 * Error Boundary Components
 *
 * Hierarchical error boundaries following clean architecture principles.
 * Provides graceful error handling at different levels of the application.
 * Uses Venus ErrorFallback (Aurora design system).
 */

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { ErrorFallback } from '@/components/ErrorFallback'
import { AuroraButton } from '@/design-system'
import { generalLogger } from '../../../utils/logger'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  level: 'app' | 'feature' | 'component' | 'network'
}

/**
 * Base Error Boundary Component
 *
 * Provides error catching and logging at different architectural levels.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorInfo: null,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { level, onError } = this.props

    // Log error with level context
    generalLogger.error(`[${level.toUpperCase()}] Error Boundary caught error`, {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      level,
    })

    // Update state with error info
    this.setState({
      error,
      errorInfo,
    })

    // Call custom error handler if provided
    onError?.(error, errorInfo)
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
  }

  render() {
    const { hasError, error } = this.state
    const { children, fallback, level } = this.props

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback
      }

      // Default error UI using Venus ErrorFallback (Aurora design system)
      const config = getErrorConfig(level)
      return (
        <ErrorFallback
          error={error!}
          reset={this.handleReset}
          homeHref="/"
          title={config.title}
          message={config.message}
          variant="inline"
        />
      )
    }

    return children
  }
}

function getErrorConfig(level: string): { title: string; message: string } {
  switch (level) {
    case 'app':
      return {
        title: 'Application Error',
        message: 'Something went wrong with the application. Please refresh the page.',
      }
    case 'feature':
      return {
        title: 'Feature Error',
        message: 'This feature encountered an error. Try refreshing or contact support.',
      }
    case 'component':
      return {
        title: 'Component Error',
        message: 'This component failed to load. The rest of the page should still work.',
      }
    case 'network':
      return {
        title: 'Connection Error',
        message: 'Unable to connect to our servers. Please check your internet connection.',
      }
    default:
      return {
        title: 'Error',
        message: 'An unexpected error occurred.',
      }
  }
}

/**
 * Application-Level Error Boundary
 *
 * Catches errors at the application level. Should wrap the entire app.
 */
export const AppErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    level="app"
    onError={(error, errorInfo) => {
      // Could send to error reporting service
      console.error('Application-level error:', error, errorInfo)
    }}
  >
    {children}
  </ErrorBoundary>
)

/**
 * Feature-Level Error Boundary
 *
 * Catches errors within a specific feature. Should wrap feature components.
 */
export const FeatureErrorBoundary: React.FC<{
  children: ReactNode
  feature: string
  fallback?: ReactNode
}> = ({ children, feature, fallback }) => (
  <ErrorBoundary
    level="feature"
    fallback={fallback}
    onError={(error, errorInfo) => {
      generalLogger.error(`Feature error in ${feature}`, {
        error: error.message,
        feature,
        componentStack: errorInfo.componentStack,
      })
    }}
  >
    {children}
  </ErrorBoundary>
)

/**
 * Component-Level Error Boundary
 *
 * Catches errors within individual components. Should wrap complex components.
 */
export const ComponentErrorBoundary: React.FC<{
  children: ReactNode
  component: string
  fallback?: ReactNode
}> = ({ children, component, fallback }) => (
  <ErrorBoundary
    level="component"
    fallback={fallback}
    onError={(error, errorInfo) => {
      generalLogger.warn(`Component error in ${component}`, {
        error: error.message,
        component,
        componentStack: errorInfo.componentStack,
      })
    }}
  >
    {children}
  </ErrorBoundary>
)

/**
 * Network-Level Error Boundary
 *
 * Catches errors related to network/API calls. Should wrap network-dependent components.
 */
export const NetworkErrorBoundary: React.FC<{
  children: ReactNode
  operation: string
  fallback?: ReactNode
  onRetry?: () => void
}> = ({ children, operation, fallback, onRetry }) => {
  const networkFallback =
    fallback ||
    (onRetry ? (
      <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <div className="text-destructive">🌐</div>
          <div>
            <h4 className="text-foreground font-medium">Connection Error</h4>
            <p className="text-muted-foreground text-sm">
              Failed to {operation}. Please check your connection and try again.
            </p>
            <AuroraButton onClick={onRetry} variant="primary" size="sm" className="mt-2">
              Retry
            </AuroraButton>
          </div>
        </div>
      </div>
    ) : undefined)

  return (
    <ErrorBoundary
      level="network"
      fallback={networkFallback}
      onError={(error, errorInfo) => {
        generalLogger.warn(`Network error during ${operation}`, {
          error: error.message,
          operation,
          componentStack: errorInfo.componentStack,
        })
      }}
    >
      {children}
    </ErrorBoundary>
  )
}
