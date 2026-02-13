'use client'

import { useEffect } from 'react'
import { ErrorState } from '../../src/components/ErrorState'
import { generalLogger } from '../../src/utils/logger'

interface AppErrorBoundaryProps {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  defaultMessage?: string
  showBackButton?: boolean
  backHref?: string
  context?: string
}

/**
 * Shared App Router Error Boundary Component
 *
 * Reusable error handler for Next.js App Router error.tsx files.
 * Consolidates common error handling logic to avoid duplication.
 *
 * Usage in error.tsx files:
 * ```tsx
 * export default function Error({ error, reset }: ErrorProps) {
 *   return <AppErrorBoundary error={error} reset={reset} />
 * }
 * ```
 */
export function AppErrorBoundary({
  error,
  reset,
  title = 'Something went wrong',
  defaultMessage = 'An unexpected error occurred. Please try refreshing the page or contact support if the problem persists.',
  showBackButton = false,
  backHref = '/',
  context,
}: AppErrorBoundaryProps) {
  useEffect(() => {
    // Use structured logger with context
    generalLogger.error('Error caught by Next.js error boundary', {
      error: error.message,
      stack: error.stack,
      digest: error.digest,
      name: error.name,
      context: context || 'app-level',
    })
  }, [error, context])

  const handleBack = () => {
    if (backHref) {
      window.location.href = backHref
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <ErrorState
          variant="dark"
          title={title}
          message={error.message || defaultMessage}
          onRetry={reset}
          onBack={showBackButton ? handleBack : undefined}
        />
      </div>
    </div>
  )
}
