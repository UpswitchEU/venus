'use client'

import { ValuationReport } from '../../../../src/components/ValuationReport'
import { ErrorBoundary } from '../../../../src/components/ErrorBoundary'

interface ValuationReportClientProps {
  reportId: string
  locale: string
  initialMode: 'edit' | 'view'
  initialVersion?: number
  urlParams: Record<string, string>
}

/**
 * ValuationReportClient - Client Component Wrapper
 *
 * This Client Component receives fully serialized props from the Server Component parent.
 * It handles all client-side rendering and state management.
 *
 * BANK GRADE: Wrapped with ErrorBoundary for maximum resilience
 * Prevents full page crashes and provides graceful error recovery
 *
 * Benefits of this pattern:
 * - Clean Server/Client boundary
 * - No serialization issues with undefined values
 * - Proper handling of async params
 * - Works consistently across all locales
 * - Graceful error handling
 */
export default function ValuationReportClient({
  reportId,
  locale,
  initialMode,
  initialVersion,
  urlParams,
}: ValuationReportClientProps) {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('[ValuationReport] Error caught by boundary:', error, errorInfo)
        // In production, send to error tracking service
        if (process.env.NODE_ENV === 'production') {
          // TODO: Send to Sentry or similar
        }
      }}
    >
      <ValuationReport
        reportId={reportId}
        initialMode={initialMode}
        initialVersion={initialVersion}
        urlParams={urlParams}
      />
    </ErrorBoundary>
  )
}
