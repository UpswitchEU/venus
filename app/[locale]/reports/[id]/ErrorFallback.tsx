'use client'

import { useEffect, useState } from 'react'

interface ErrorFallbackProps {
  returnUrl?: string
  error?: Error
  errorInfo?: string
}

/**
 * ErrorFallback - Bank-grade error recovery component
 * 
 * Provides meaningful error messages and recovery options:
 * - Reload page to retry
 * - Go back to Mercury (if return URL available)
 * - Contact support (for persistent errors)
 */
export function ErrorFallback({ returnUrl, error, errorInfo }: ErrorFallbackProps) {
  const [storedReturnUrl, setStoredReturnUrl] = useState<string | null>(null)

  // Check for stored return URL from session storage
  useEffect(() => {
    if (!returnUrl && typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('upswitch_return_url')
      if (stored) {
        setStoredReturnUrl(stored)
      }
    }
  }, [returnUrl])

  const effectiveReturnUrl = returnUrl || storedReturnUrl

  // Categorize error for better messaging
  const getErrorDetails = () => {
    const errorMessage = error?.message || errorInfo || ''
    
    if (errorMessage.includes('Authentication') || errorMessage.includes('auth')) {
      return {
        title: 'Authentication Failed',
        description: 'Unable to verify your access. Please try logging in again.',
        icon: '🔒',
      }
    }
    
    if (errorMessage.includes('client context') || errorMessage.includes('clientToken')) {
      return {
        title: 'Client Access Error',
        description: 'Unable to load the client context. The link may have expired. Please try creating a new valuation.',
        icon: '👥',
      }
    }
    
    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      return {
        title: 'Connection Error',
        description: 'Unable to connect to the server. Please check your internet connection and try again.',
        icon: '📡',
      }
    }
    
    if (errorMessage.includes('bootstrap') || errorMessage.includes('session')) {
      return {
        title: 'Session Error',
        description: 'Unable to initialize the valuation session. Please try reloading the page.',
        icon: '🔄',
      }
    }
    
    return {
      title: 'Failed to Load Report',
      description: 'Unable to load the valuation report. This may be due to a network issue or a problem with the report.',
      icon: '⚠️',
    }
  }

  const { title, description, icon } = getErrorDetails()

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/10 flex items-center justify-center">
          <span className="text-3xl">{icon}</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-4">{title}</h1>
        <p className="text-muted-foreground mb-6">{description}</p>
        
        {/* Error details for debugging (development only) */}
        {process.env.NODE_ENV === 'development' && error && (
          <details className="mb-6 text-left">
            <summary className="text-muted-foreground cursor-pointer hover:text-foreground text-sm">
              Technical details
            </summary>
            <pre className="mt-2 p-3 bg-muted rounded-lg text-xs text-muted-foreground overflow-auto max-h-32 border border-border">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </details>
        )}
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
          >
            Reload Page
          </button>
          {effectiveReturnUrl && (
            <button
              onClick={() => {
                window.location.href = effectiveReturnUrl
              }}
              className="px-6 py-3 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors font-medium border border-border"
            >
              Return to Dashboard
            </button>
          )}
        </div>
        
        {/* Support link */}
        <p className="mt-6 text-sm text-muted-foreground">
          If this problem persists,{' '}
          <a 
            href="mailto:support@upswitch.app" 
            className="text-primary hover:text-primary/80 underline"
          >
            contact support
          </a>
        </p>
      </div>
    </div>
  )
}
