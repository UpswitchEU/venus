'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { ErrorFallback } from '@/components/ErrorFallback'
import { businessTypesCache } from '@/services/cache/businessTypesCache'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Static fallback component */
  fallback?: ReactNode
  /** Render prop fallback - receives error for dynamic error display */
  fallbackRender?: (props: { error: Error; errorInfo: ErrorInfo | null; reset: () => void }) => ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  retryCount: number
}

/**
 * Error Boundary Component
 * 
 * BANK GRADE: Catches errors in component tree and provides graceful fallback
 * Prevents entire app crashes and provides recovery options
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)

    // Clear business types cache when category/toLowerCase crash - allows Try Again to fetch fresh data
    if (error.message?.includes('toLowerCase') && error.message?.includes('category')) {
      businessTypesCache.clearBusinessTypes()
    }

    this.setState({
      error,
      errorInfo,
    })

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  handleReset = (): void => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prev.retryCount + 1,
    }))
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      // Use render prop fallback if provided (allows passing error to fallback)
      if (this.props.fallbackRender) {
        return this.props.fallbackRender({
          error: this.state.error,
          errorInfo: this.state.errorInfo,
          reset: this.handleReset,
        })
      }

      // Use static fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI using Venus ErrorFallback (Aurora design system)
      // Modal variant for component-level errors - less disruptive than full-page
      return (
        <ErrorFallback
          error={this.state.error}
          reset={this.handleReset}
          homeHref="/"
          variant="modal"
        />
      )
    }

    // Render children with key to force remount on retry - useBusinessTypes will re-fetch (cache cleared)
    const child = React.Children.only(this.props.children)
    return React.isValidElement(child)
      ? React.cloneElement(child, { key: this.state.retryCount } as { key: number })
      : this.props.children
  }
}
