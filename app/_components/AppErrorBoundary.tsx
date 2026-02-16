'use client'

import { useEffect } from 'react'
import { ErrorFallback } from '@/components/ErrorFallback'
import { generalLogger } from '@/utils/logger'

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
 * Uses Venus ErrorFallback (Aurora design system).
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

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      homeHref={backHref}
      title={title}
      message={error.message || defaultMessage}
      variant="fullPage"
    />
  )
}
