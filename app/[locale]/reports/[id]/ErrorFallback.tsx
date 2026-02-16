'use client'

import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { GlassCard, AuroraButton } from '@/design-system'

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
 * - Return to Dashboard (if return URL available)
 * - Contact support (for persistent errors)
 *
 * Uses Aurora design system (GlassCard, AuroraButton).
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
      }
    }

    if (errorMessage.includes('client context') || errorMessage.includes('clientToken')) {
      return {
        title: 'Client Access Error',
        description:
          'Unable to load the client context. The link may have expired. Please try creating a new valuation.',
      }
    }

    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      return {
        title: 'Connection Error',
        description:
          'Unable to connect to the server. Please check your internet connection and try again.',
      }
    }

    if (errorMessage.includes('bootstrap') || errorMessage.includes('session')) {
      return {
        title: 'Session Error',
        description: 'Unable to initialize the valuation session. Please try reloading the page.',
      }
    }

    return {
      title: 'Failed to Load Report',
      description:
        'Unable to load the valuation report. This may be due to a network issue or a problem with the report.',
    }
  }

  const { title, description } = getErrorDetails()

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <GlassCard
        variant="default"
        glow="none"
        hover={false}
        className="max-w-md w-full text-center"
      >
        <div className="w-12 h-12 mx-auto mb-4 flex items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="w-6 h-6 text-destructive/70" aria-hidden />
        </div>

        <h1 className="text-xl font-semibold text-foreground mb-2">{title}</h1>
        <p className="text-sm text-muted-foreground mb-6">{description}</p>

        {/* Error details for debugging (development only) */}
        {process.env.NODE_ENV === 'development' && error && (
          <div className="mb-6 p-4 rounded-lg bg-muted/50 border border-foreground/[0.06] text-left">
            <p className="text-xs font-medium text-foreground/80 mb-1">Error Details</p>
            <pre className="text-xs font-mono text-muted-foreground break-all overflow-auto max-h-32">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <AuroraButton
            onClick={() => window.location.reload()}
            variant="primary"
            size="lg"
            className="flex items-center justify-center gap-2"
          >
            Reload Page
          </AuroraButton>
          {effectiveReturnUrl && (
            <AuroraButton
              onClick={() => {
                window.location.href = effectiveReturnUrl
              }}
              variant="ghost"
              size="lg"
              className="flex items-center justify-center gap-2"
            >
              Return to Dashboard
            </AuroraButton>
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
      </GlassCard>
    </div>
  )
}
