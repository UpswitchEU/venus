'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
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
import { useManualFormStore } from '../../../../src/store/manual/useManualFormStore'
import { getMercuryUrl } from '../../../../src/utils/getMercuryUrl'
import { generalLogger } from '../../../../src/utils/logger'
import { parseReportModeForInitialUi } from '../../../../src/utils/reportMode'

// Module-level singleton so re-mounts don't re-trigger network for chunks the
// browser already has in the module cache.
let chunkPreloadStarted = false

/**
 * Warm the heavy wizard chunks during the auth/bootstrap window.
 *
 * Before this hoist, the chunk preload lived inside ValuationReport, which
 * doesn't mount until AuthGate+BootstrapProvider clear. That meant the
 * ValuationFlow chunk download served on the critical path after stage
 * flipped to 'data-entry'. By kicking it off here — at the top of the
 * client tree — the chunk downloads in parallel with /api/auth/me and
 * /api/bootstrap, so it's already in cache by the time the wizard mounts.
 */
function preloadWizardChunks() {
  if (chunkPreloadStarted || typeof window === 'undefined') return
  chunkPreloadStarted = true
  // Fire-and-forget. Failures are non-fatal — React.lazy will retry on demand.
  void Promise.all([
    import('../../../../src/components/ValuationFlowSelector'),
    import('../../../../src/components/ValuationSessionManager'),
    import('../../../../src/features/valuation/components/ValuationFlow'),
  ]).catch(() => undefined)
}

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
  // Kick off heavy chunk downloads before AuthGate/BootstrapProvider start
  // their async work. The browser then fetches code in parallel with the
  // /api/auth/me and /api/bootstrap round-trips instead of after them.
  useEffect(() => {
    preloadWizardChunks()
  }, [])

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

  // Optimistic seed: write `prefilledQuery` straight into the manual form
  // store during this render — BEFORE any descendant mounts. The wizard's
  // bootstrap POST takes ~1–3s; without this, ManualLayoutLoaded mounts with
  // an empty `company_name`, paints a blank KBO field, and only fills once
  // useBootstrapPrefill's queueMicrotask drains. Seeding here makes the first
  // paint already show the company name from the URL. Bootstrap's prefill
  // still runs and overrides with the canonical registry record when it
  // returns. Authoritative on every fresh mount (not gated on store-empty)
  // so SPA navigation between reports doesn't flash the previous report's
  // company name. Ref-guarded so re-renders don't re-fire it within a mount;
  // ref reset on reportId change so client-side navigation re-seeds.
  const seedAttemptedRef = useRef<string | null>(null)
  if (seedAttemptedRef.current !== reportId && typeof window !== 'undefined') {
    seedAttemptedRef.current = reportId
    const trimmed = prefilledQuery?.trim()
    if (trimmed) {
      useManualFormStore.getState().updateFormData({ company_name: trimmed })
    }
  }

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
        Optimistic auth for Mercury→Venus warm opens (source=mercury, no
        clientToken). Mercury already authenticated the user; cookies are
        fresh and Titan validates them on every request anyway. Blocking the
        entire shell behind /api/auth/me added 300–1200ms of dead-air.

        With optimistic=true:
        • AuthGate's children render immediately.
        • BootstrapProvider subscribes to auth state and fires runBootstrap
          when initializeAuth() flips !loading && !isInitializing — including
          the get-client-context fetch driven by ?clientId. By that point
          useClientContext is populated, so the bootstrap POST carries the
          correct delegated headers.
        • If auth fails, AuthGate's useEffect still runs and either redirects
          (most common) or sets an error state (silently swallowed by the
          optimistic branch). The 30s session-load timeout backstops any
          edge case where neither happens.

        Strict (blocking) path stays in place when a clientToken is present:
        the exchange-client-context handshake MUST complete before bootstrap
        sends headers.
      */}
      <AuthGate
        hasClientToken={hasClientToken}
        returnUrl={urlParams.return_url}
        loadingComponent={<CalculatorShellSkeleton />}
        optimistic={source === 'mercury' && !hasClientToken}
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
