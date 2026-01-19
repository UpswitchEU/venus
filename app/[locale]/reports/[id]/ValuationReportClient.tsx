'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import { ValuationReport } from '../../../../src/components/ValuationReport'
import { ErrorBoundary } from '../../../../src/components/ErrorBoundary'
import { BootstrapProvider, type BootstrapContext, type FlowType } from '../../../../src/lib/bootstrap'

interface ValuationReportClientProps {
  reportId: string
  locale: string
  initialMode: 'edit' | 'view'
  initialVersion?: number
  urlParams: Record<string, string>
}

/**
 * Supported URL action parameters:
 * - action=download: Trigger PDF download after report loads
 * - tab=info: Open the info tab instead of preview (for "View Breakdown")
 * - #info-tab: Alternative hash-based tab selection
 */

/**
 * ValuationReportClient - Client Component Wrapper
 *
 * This Client Component receives fully serialized props from the Server Component parent.
 * It handles all client-side rendering and state management.
 *
 * WORLD CLASS: Uses BootstrapProvider for unified session initialization
 * - Resolves auth, session, and prefill data BEFORE UI renders
 * - Single source of truth for all initialization state
 * - Zero visual jumps from data prefilling
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
 * - World-class initialization with bootstrap system
 */
export default function ValuationReportClient({
  reportId,
  locale,
  initialMode,
  initialVersion,
  urlParams,
}: ValuationReportClientProps) {
  // Build bootstrap context from URL params
  const bootstrapContext = useMemo<BootstrapContext>(() => ({
    url: typeof window !== 'undefined' ? window.location.href : '',
    reportId,
    clientToken: urlParams.clientToken,
    prefilledQuery: urlParams.prefilledQuery,
    guestSessionId: urlParams.guestSessionId,
    flow: (urlParams.flow as FlowType) || undefined,
    mode: initialMode,
    version: initialVersion,
    locale,
    embedded: urlParams.embedded === 'true',
    returnUrl: urlParams.return_url,
    sourceApp: urlParams.source,
  }), [reportId, locale, initialMode, initialVersion, urlParams])

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
      <BootstrapProvider
        context={bootstrapContext}
        autoBootstrap={true}
        onBootstrapComplete={(state) => {
          console.log('[ValuationReportClient] Bootstrap complete', {
            identityType: state.identity.type,
            reportMode: state.report.mode,
            prefillConfidence: state.prefillData.confidence.toFixed(2),
            durationMs: state.bootstrapDurationMs,
          })
        }}
        onBootstrapError={(error) => {
          console.error('[ValuationReportClient] Bootstrap failed:', error)
        }}
      >
        <ValuationReport
          reportId={reportId}
          initialMode={initialMode}
          initialVersion={initialVersion}
          urlParams={urlParams}
        />
      </BootstrapProvider>
    </ErrorBoundary>
  )
}
