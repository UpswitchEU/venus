'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { ErrorFallback } from '@/components/ErrorFallback'

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
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    })
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
      return (
        <ErrorFallback
          error={this.state.error}
          reset={this.handleReset}
          homeHref="/"
          variant="fullPage"
        />
      )
    }

    return this.props.children
  }
}
