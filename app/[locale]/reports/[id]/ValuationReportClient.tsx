'use client'

import { useCallback, useMemo } from 'react'
import { ValuationReport } from '../../../../src/components/ValuationReport'
import { ErrorBoundary } from '../../../../src/components/ErrorBoundary'
import { BootstrapProvider, type BootstrapContext, type FlowType } from '../../../../src/lib/bootstrap'
import { AuthGate } from '../../../../src/components/AuthGate'
import { CalculatorShellSkeleton } from '../../../../src/components/calculator'
import { useTokenRefresh } from '../../../../src/hooks/useTokenRefresh'
import { getMercuryUrl } from '../../../../src/utils/getMercuryUrl'
import { generalLogger } from '../../../../src/utils/logger'

/**
 * Token refresh runs INSIDE AuthGate so it only starts after auth is
 * confirmed. This prevents competing redirect races when the refresh
 * token is expired (useTokenRefresh redirecting AND AuthGate redirecting).
 */
function TokenRefreshGuard() {
  const handleTokenExpired = useCallback(() => {
    // If auth recently succeeded, the access token is still valid even if
    // the refresh token is expired. Redirecting here would cause an infinite
    // loop: Venus -> Mercury login -> Mercury auto-redirects back -> repeat.
    try {
      const initAt = parseInt(sessionStorage.getItem('venus_init_ok_at') || '0', 10)
      if (Date.now() - initAt < 5 * 60 * 1000) {
        generalLogger.warn('[TokenRefreshGuard] Refresh token expired but session is fresh — NOT redirecting')
        return
      }
    } catch { /* sessionStorage unavailable */ }

    const currentUrl = typeof window !== 'undefined' ? window.location.href : ''
    const mercuryUrl = getMercuryUrl()
    const locale = typeof window !== 'undefined'
      ? window.location.pathname.match(/^\/(en|nl|fr|de)\//)?.[1] || 'en'
      : 'en'
    window.location.href = `${mercuryUrl}/${locale}/auth/login?returnUrl=${encodeURIComponent(currentUrl)}`
  }, [])
  useTokenRefresh({ onTokenExpired: handleTokenExpired })
  return null
}

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

  // Build bootstrap context from URL params.
  // Dependency array uses primitive values extracted from urlParams
  // to guarantee stability even if urlParams object reference changes.
  const clientToken = urlParams.clientToken
  const clientId = urlParams.clientId
  const prefilledQuery = urlParams.prefilledQuery
  const flow = urlParams.flow
  const embedded = urlParams.embedded
  const returnUrl = urlParams.return_url
  const source = urlParams.source

  const bootstrapContext = useMemo<BootstrapContext>(() => {
    return {
      url: typeof window !== 'undefined' ? window.location.href : '',
      reportId,
      clientToken,
      clientId,
      prefilledQuery,
      flow: (flow as FlowType) || undefined,
      mode: initialMode,
      version: initialVersion,
      locale,
      embedded: embedded === 'true',
      returnUrl,
      sourceApp: source,
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, locale, initialMode, initialVersion, clientToken, clientId, prefilledQuery, flow, embedded, returnUrl, source])

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
        optimistic={false}
      >
        <TokenRefreshGuard />
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
