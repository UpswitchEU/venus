'use client'

import { useCallback, useMemo } from 'react'
import { ValuationReport } from '../../../../src/components/ValuationReport'
import { ErrorBoundary } from '../../../../src/components/ErrorBoundary'
import { BootstrapProvider, type BootstrapContext, type FlowType } from '../../../../src/lib/bootstrap'
import { AuthGate } from '../../../../src/components/AuthGate'
import { CalculatorShellSkeleton } from '../../../../src/components/calculator'
import { useTokenRefresh } from '../../../../src/hooks/useTokenRefresh'
import { getMercuryUrl } from '../../../../src/utils/getMercuryUrl'

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
 * BANK GRADE: Uses AuthGate to ensure auth and client context are ready
 * BEFORE BootstrapProvider runs. This eliminates the race condition where
 * bootstrap starts before client context exchange completes.
 * 
 * Flow:
 * 1. AuthGate waits for auth + client context exchange (if clientToken present)
 * 2. Only after AuthGate passes does BootstrapProvider start
 * 3. BootstrapProvider can now trust that client context is in the store
 * 4. Session created with proper accountant-client ownership
 *
 * WORLD CLASS: Uses BootstrapProvider for unified session initialization
 * - Resolves auth, session, and prefill data BEFORE UI renders
 * - Single source of truth for all initialization state
 * - Zero visual jumps from data prefilling
 *
 * Benefits of this pattern:
 * - Clean Server/Client boundary
 * - No serialization issues with undefined values
 * - Proper handling of async params
 * - Works consistently across all locales
 * - Graceful error handling
 * - World-class initialization with bootstrap system
 * - No race conditions between auth and bootstrap
 */
export default function ValuationReportClient({
  reportId,
  locale,
  initialMode,
  initialVersion,
  urlParams,
}: ValuationReportClientProps) {
  // Detect if this is an accountant flow (has clientToken or clientId)
  const hasClientToken = useMemo(() => {
    return !!urlParams.clientToken || !!urlParams.clientId
  }, [urlParams.clientToken, urlParams.clientId])

  // Detect Mercury flow - cookies are already present so we can render optimistically
  const isFromMercury = urlParams.source === 'mercury'

  // Proactive token refresh: keeps the access token alive during long sessions.
  // Without this, the 15-minute access token expires silently while the user fills data.
  const handleTokenExpired = useCallback(() => {
    const currentUrl = typeof window !== 'undefined' ? window.location.href : ''
    const mercuryUrl = getMercuryUrl()
    const localeMatch = typeof window !== 'undefined'
      ? window.location.pathname.match(/^\/(en|nl|fr|de)\//)?.[1] || 'en'
      : 'en'
    window.location.href = `${mercuryUrl}/${localeMatch}/auth/login?returnUrl=${encodeURIComponent(currentUrl)}`
  }, [])
  useTokenRefresh({ onTokenExpired: handleTokenExpired })

  // Build bootstrap context from URL params
  const bootstrapContext = useMemo<BootstrapContext>(() => {
    return {
      url: typeof window !== 'undefined' ? window.location.href : '',
      reportId,
      clientToken: urlParams.clientToken,
      clientId: urlParams.clientId,
      prefilledQuery: urlParams.prefilledQuery,
      flow: (urlParams.flow as FlowType) || undefined,
      mode: initialMode,
      version: initialVersion,
      locale,
      embedded: urlParams.embedded === 'true',
      returnUrl: urlParams.return_url,
      sourceApp: urlParams.source,
    }
  }, [reportId, locale, initialMode, initialVersion, urlParams, hasClientToken])

  return (
    <ErrorBoundary>
      {/* 
        BANK GRADE: AuthGate ensures auth and client context are ready
        BEFORE BootstrapProvider runs. This eliminates race conditions.
      */}
      <AuthGate
        hasClientToken={hasClientToken}
        returnUrl={urlParams.return_url}
        loadingComponent={<CalculatorShellSkeleton />}
        optimistic={isFromMercury}
      >
        <BootstrapProvider
          context={bootstrapContext}
          autoBootstrap={true}
        >
          <ValuationReport
            reportId={reportId}
            initialMode={initialMode}
            initialVersion={initialVersion}
            urlParams={urlParams}
          />
        </BootstrapProvider>
      </AuthGate>
    </ErrorBoundary>
  )
}
