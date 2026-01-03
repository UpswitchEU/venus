'use client'

import { AppErrorBoundary } from '../../../_components/AppErrorBoundary'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

/**
 * Error Boundary for Valuation Report Pages
 *
 * Catches errors when loading or rendering reports.
 * Reuses shared AppErrorBoundary component to avoid duplication.
 */
export default function ReportError({ error, reset }: ErrorProps) {
  return (
    <AppErrorBoundary
      error={error}
      reset={reset}
      title="Failed to Load Report"
      defaultMessage="We couldn't load this valuation report. It may have been deleted or there was an error loading the data."
      showBackButton
      backHref="/"
      context="report-page"
    />
  )
}
