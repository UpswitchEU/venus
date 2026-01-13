'use client'

import { useEffect } from 'react'
import { AppErrorBoundary } from './_components/AppErrorBoundary'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Global Error Boundary for the App Router
 *
 * Catches errors in the root layout and pages.
 * Reuses shared AppErrorBoundary component to avoid duplication.
 */
export default function Error({ error, reset }: ErrorProps) {
  // Log full error details to help debug iframe SSR issue
  useEffect(() => {
    console.error('[Root Error Boundary] Full error details:', {
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      name: error.name,
      error: error,
      url: typeof window !== 'undefined' ? window.location.href : 'SSR',
    })
  }, [error])

  return <AppErrorBoundary error={error} reset={reset} context="app-level" />
}
