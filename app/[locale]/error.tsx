'use client'

import { useEffect } from 'react'
import { AppErrorBoundary } from '../_components/AppErrorBoundary'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function LocaleError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('[Locale Error Boundary]', error.message)
  }, [error])

  return <AppErrorBoundary error={error} reset={reset} context="locale-level" />
}
