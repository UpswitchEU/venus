'use client'

import { useCallback, useMemo } from 'react'
import { AuthGate } from '../../../../src/components/AuthGate'
import { CalculatorShellSkeleton } from '../../../../src/components/calculator'
import { ErrorBoundary } from '../../../../src/components/ErrorBoundary'
import { ValuationReport } from '../../../../src/components/ValuationReport'
import { useTokenRefresh } from '../../../../src/hooks/useTokenRefresh'
import {
  type BootstrapContext,
  BootstrapProvider,
  type FlowType,
} from '../../../../src/lib/bootstrap'
import { getMercuryUrl } from '../../../../src/utils/getMercuryUrl'
import { generalLogger } from '../../../../src/utils/logger'
import { parseReportModeForInitialUi } from '../../../../src/utils/reportMode'

/**
 * Token refresh runs INSIDE AuthGate so it only starts after auth is
 * confirmed. This prevents competing redirect races when the refresh
 * token is expired (useTokenRefresh redirecting AND AuthGate redirecting).
 */
function TokenRefreshGuard() {
  const handleTokenExpired = useCallback(() => {
    if (typeof window !== 'undefined' && window.__isLoggingOut) {
      return
    }
    // If auth recently succeeded, the access token is still valid even if
    // the refresh token is expired. Redirecting here would cause an infinite
    // loop: Venus -> Mercury login -> Mercury auto-redirects back -> repeat.
    try {
      const initAt = parseInt(sessionStorage.getItem('venus_init_ok_at') || '0', 10)
      if (Date.now() - initAt < 5 * 60 * 1000) {
        generalLogger.warn(
          '[TokenRefreshGuard] Refresh token expired but session is fresh — NOT redirecting'
        )
        return
      }
    } catch {
      /* sessionStorage unavailable */
    }

    const currentUrl = typeof window !== 'undefined' ? window.location.href : ''
    const mercuryUrl = getMercuryUrl()
    const locale =
      typeof window !== 'undefined'
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
  // Detect if this is an accountant flow that requires the
  // exchange-client-context handshake. Only a real `clientToken` triggers the
  // gate — a bare `clientId` (e.g. Mercury's safety-net fallback or the
  // "Open standalone" escape hatch) is a soft prefill hint and must NOT block
  // the user behind AuthGate's "Failed to establish client context" error.
  // Without this, a hung/failed Mercury BFF session-create call leaves the
  // user permanently stranded on Venus with no recovery path.
  const hasClientToken = useMemo(() => {
    return !!urlParams.clientToken
  }, [urlParams.clientToken])

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

  /** Never trust raw `mode` alone (Mercury sends `accountant`). Reconcile from URL for client navigations. */
  const uiMode = useMemo(
    () => parseReportModeForInitialUi(urlParams.mode ?? initialMode),
    [urlParams.mode, initialMode]
  )

  // LOOP FIX: Derive url from reportId+locale instead of window.location.href to avoid
  // context churn when router.replace updates the URL (mode, version, etc.)
  const bootstrapContext = useMemo<BootstrapContext>(() => {
    const baseUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/${locale}/reports/${reportId || 'new'}`
        : ''
    return {
      url: baseUrl,
      reportId,
      clientToken,
      clientId,
      prefilledQuery,
      flow: (flow as FlowType) || undefined,
      mode: uiMode,
      version: initialVersion,
      locale,
      embedded: embedded === 'true',
      returnUrl,
      sourceApp: source,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    reportId,
    locale,
    uiMode,
    initialVersion,
    clientToken,
    clientId,
    prefilledQuery,
    flow,
    embedded,
    returnUrl,
    source,
  ])

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
        <BootstrapProvider context={bootstrapContext} autoBootstrap={true}>
          <ValuationReport
            reportId={reportId}
            initialMode={uiMode}
            initialVersion={initialVersion}
            urlParams={urlParams}
          />
        </BootstrapProvider>
      </AuthGate>
    </ErrorBoundary>
  )
}
