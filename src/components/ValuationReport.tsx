'use client'

import { useTransitionRouter } from 'next-view-transitions'
import React, { Suspense, useEffect, useRef } from 'react'
import { ENGINE_TO_MERCURY_MESSAGE_TYPES } from '../constants/crossAppMessages'
import { useBootstrapSync } from '../hooks/useBootstrapSync'
import { useEmbeddedMode } from '../hooks/useEmbeddedMode'
import { useUrlState } from '../hooks/useUrlState'
import { trackReportOpen, trackSessionStart } from '../lib/analytics'
import UrlGeneratorService from '../services/urlGenerator'
import type { ValuationResponse } from '../types/valuation'
import { getMercuryUrl } from '../utils/getMercuryUrl'
import { isSessionKey, isUuid } from '../utils/identifiers'
import { generalLogger } from '../utils/logger'
import {
  getCanonicalReportAlias,
  REPORT_IDENTITY_PROMOTED_EVENT,
  type ReportIdentityPromotedDetail,
} from '../utils/reportIdentityPromotion'
import { generateReportId, isValidReportId } from '../utils/reportIdGenerator'
import { resolveStandaloneReportReadyHash } from '../utils/standaloneReportReadyHash'
import { submitAnonymizedBenchmarkContribution } from '../utils/submitAnonymizedBenchmarkContribution'

// Lazy load heavy components for code splitting
const ValuationFlowSelector = React.lazy(() =>
  import('./ValuationFlowSelector').then((m) => ({ default: m.ValuationFlowSelector }))
)
const ValuationSessionManager = React.lazy(() =>
  import('./ValuationSessionManager').then((m) => ({ default: m.ValuationSessionManager }))
)
/**
 * ValuationReport Component - Next.js Compatible
 *
 * Single Responsibility: Route validation and delegation.
 * Handles URL parameter validation and delegates to session/flow management.
 *
 * Architecture: Flow-agnostic (shared by Manual and Conversational)
 * - Uses service layer for backend operations
 * - No direct store access (stores are flow-specific)
 * - Delegates to flow-specific components via ValuationFlowSelector
 *
 * Enhanced for M&A workflow:
 * - Supports edit/view mode switching
 * - Supports version selection
 * - Always editable by default (M&A requirement)
 * - World-class URL state management
 *
 * URL Action Parameters (for Mercury integration):
 * - action=download: Trigger PDF download after report loads
 * - action=preview: Open report preview after report loads
 * - tab=info: Start with info tab instead of preview
 */
interface ValuationReportProps {
  reportId: string
  /** Initial mode (edit = editable form, view = static report) */
  initialMode?: 'edit' | 'view'
  /** Initial version number to load */
  initialVersion?: number
  /** URL parameters for context (clientToken, return_url, action, tab, etc.) */
  urlParams?: Record<string, string | undefined>
}

export const ValuationReport: React.FC<ValuationReportProps> = React.memo(
  ({
    reportId,
    initialMode = 'edit', // Default to edit mode for M&A workflow
    initialVersion,
    urlParams = {},
  }) => {
    const router = useTransitionRouter()

    // Extract URL action and tab parameters (for Mercury integration)
    const urlAction = urlParams.action || undefined
    const initialTab = React.useMemo(() => {
      // Check tab query param first (info tab removed - map to preview)
      if (urlParams.tab === 'history') return 'history' as const
      return 'preview' as const
    }, [urlParams.tab])

    // Bootstrap sync - syncs bootstrap state with existing stores
    // This ensures auth, session, and prefill data are available in stores
    const { isSynced: isBootstrapSynced } = useBootstrapSync()

    // Embedded mode detection for iframe integration
    const { isEmbedded } = useEmbeddedMode()

    // URL state management for browser navigation support.
    // `onStateChange` is omitted (not a fresh arrow each render) so `updateUrl`
    // keeps a stable identity across renders — any consumer with `updateUrl`
    // in its deps used to re-fire on every render.
    const { urlState, updateUrl } = useUrlState({ reportId })

    // LOOP FIX: Ref to prevent duplicate URL sync when effect re-runs (e.g. after remount)
    const urlSyncAttemptedRef = useRef(false)
    const sessionReportTrackedRef = useRef(false)

    // Reset when reportId changes (client-side nav to different report)
    useEffect(() => {
      const scopedReportId = reportId
      urlSyncAttemptedRef.current = false
      sessionReportTrackedRef.current = false
      generalLogger.debug('Reset report-scoped ValuationReport guards', {
        reportId: scopedReportId?.substring(0, 30),
      })
    }, [reportId])

    // A successful first save promotes the temporary val_* concept to the
    // durable Titan UUID. Keep the address bar, the embedded Mercury shell and
    // all subsequent reads on that UUID immediately; a stale session-key URL
    // is resolved from the local alias on a later Mercury/Venus round-trip.
    useEffect(() => {
      if (typeof window === 'undefined') return

      const navigateToCanonicalReport = (canonicalReportId: string): void => {
        if (!isUuid(canonicalReportId) || canonicalReportId === reportId) return
        const target = `${UrlGeneratorService.reportById(canonicalReportId)}${window.location.search}`
        router.replace(target)
      }

      if (isSessionKey(reportId)) {
        const existingAlias = getCanonicalReportAlias(reportId)
        if (existingAlias) {
          navigateToCanonicalReport(existingAlias)
        }
      }

      const onIdentityPromoted = (event: Event): void => {
        const detail = (event as CustomEvent<ReportIdentityPromotedDetail>).detail
        const canonicalReportId =
          detail && typeof detail.reportId === 'string' && isUuid(detail.reportId)
            ? detail.reportId
            : null
        if (!detail || !canonicalReportId) return
        const belongsToCurrentRoute =
          detail.previousId === reportId ||
          detail.sessionKey === reportId ||
          canonicalReportId === reportId
        if (!belongsToCurrentRoute) return

        if (window.parent !== window) {
          window.parent.postMessage(
            {
              type: ENGINE_TO_MERCURY_MESSAGE_TYPES.reportCreated,
              source: 'valuation.upswitch.app',
              data: {
                reportId: canonicalReportId,
                sessionKey: detail.sessionKey,
                engineRunId: detail.engineRunId,
              },
            },
            new URL(getMercuryUrl()).origin
          )
        }

        generalLogger.info('Promoting valuation route to durable report UUID', {
          previousId: detail.previousId,
          reportId: canonicalReportId,
          sessionKey: detail.sessionKey ?? null,
          engineRunId: detail.engineRunId ?? null,
        })
        navigateToCanonicalReport(canonicalReportId)
      }

      window.addEventListener(REPORT_IDENTITY_PROMOTED_EVENT, onIdentityPromoted)
      return () => {
        window.removeEventListener(REPORT_IDENTITY_PROMOTED_EVENT, onIdentityPromoted)
      }
    }, [reportId, router])

    // Sync initial mode and version to URL on mount
    useEffect(() => {
      void reportId
      if (urlSyncAttemptedRef.current) return
      urlSyncAttemptedRef.current = true

      const currentMode = urlState.mode || initialMode
      const currentVersion = urlState.version !== undefined ? urlState.version : initialVersion

      // Only update URL if state differs from URL (and we have initial values)
      if (
        (initialMode && currentMode !== urlState.mode) ||
        (initialVersion !== undefined && currentVersion !== urlState.version)
      ) {
        updateUrl(
          {
            mode: currentMode,
            version: currentVersion,
          },
          { replace: true }
        )
      }
      // reportId in deps: re-sync when navigating to a different report
    }, [initialMode, initialVersion, reportId, updateUrl, urlState.mode, urlState.version])

    // GA4: Track session start and report open when loading report directly (not from HomePage)
    // Covers: Mercury redirect, embedded iframe, client report view, direct links
    useEffect(() => {
      if (!isBootstrapSynced || sessionReportTrackedRef.current) return
      sessionReportTrackedRef.current = true

      const source = urlParams.source || (urlParams.embedded === 'true' ? 'embedded' : 'direct')
      trackSessionStart(source)

      if (reportId && reportId !== 'new' && isValidReportId(reportId)) {
        trackReportOpen(reportId)
      }
    }, [isBootstrapSynced, reportId, urlParams.source, urlParams.embedded])

    /** Set when valuation completes; used for optional silent anonymized benchmark contribution */
    const [completedResult, setCompletedResult] = React.useState<ValuationResponse | null>(null)

    // Handle valuation completion
    // NOTE: saveCompleteSession is already called in useValuationFormSubmission
    // This callback only handles report API completion for credit tracking
    const handleValuationComplete = async (result: ValuationResponse) => {
      try {
        // Credit tracking and durable persistence are handled by the calculation
        // and report asset save paths; this callback only triggers local
        // post-completion effects.
        generalLogger.info('Valuation report completion acknowledged', {
          reportId,
          valuationId: result.valuation_id,
        })

        setCompletedResult(result)
      } catch (error) {
        // BANK-GRADE: Specific error handling - report completion failure
        // Don't show error to user as the valuation is already complete locally
        // Report completion is for credit tracking, not critical for user experience
        if (error instanceof Error) {
          generalLogger.error('Failed to complete valuation report', {
            error: error.message,
            stack: error.stack,
            reportId,
            valuationId: result.valuation_id,
          })
        } else {
          generalLogger.error('Failed to complete valuation report', {
            error: String(error),
            reportId,
            valuationId: result.valuation_id,
          })
        }
        // Continue - don't block user even if completion fails
      }
    }

    // Validate report ID and redirect if invalid
    // FIX: Call all hooks before any conditional returns to comply with React rules of hooks
    React.useEffect(() => {
      if (!reportId || !isValidReportId(reportId)) {
        // Invalid or missing report ID - generate new one
        const newReportId = generateReportId()
        router.replace(UrlGeneratorService.reportById(newReportId))
      }
    }, [reportId, router])

    // Anonymized multiples: Mercury passes benchmark_contribution=0 when opted out. Missing/1 = allow.
    const benchmarkContributionParam = urlParams.benchmark_contribution
    React.useEffect(() => {
      if (!completedResult) return
      if (benchmarkContributionParam === '0') {
        generalLogger.info('Anonymized benchmark contribution skipped (workspace preference)')
        return
      }
      const timer = window.setTimeout(() => {
        void submitAnonymizedBenchmarkContribution(completedResult).catch((err) => {
          generalLogger.error('Anonymized benchmark contribution failed', {
            error: err instanceof Error ? err.message : String(err),
          })
        })
      }, 2000)
      return () => window.clearTimeout(timer)
    }, [completedResult, benchmarkContributionParam])

    // Preload critical resources in background (must run before any conditional return — Rules of Hooks)
    useEffect(() => {
      if (typeof window !== 'undefined') {
        Promise.all([import('./ValuationFlowSelector'), import('./ValuationSessionManager')]).catch(
          () => {
            // Non-critical - preloading is optional
          }
        )
      }
    }, [])

    // Signal Mercury when Venus is fully loaded (iframe postMessage or hash for full-page)
    useEffect(() => {
      if (typeof window === 'undefined') return
      if (!reportId || !isValidReportId(reportId)) return

      const sourceApp =
        urlParams.source ||
        (typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('source')
          : null)
      const isFromMercury = sourceApp === 'mercury'

      if (!isFromMercury) return

      const signalReady = () => {
        const mercuryTargetOrigin = new URL(getMercuryUrl()).origin

        if (window.parent !== window) {
          window.parent.postMessage(
            {
              type: ENGINE_TO_MERCURY_MESSAGE_TYPES.engineReady,
              reportId,
              timestamp: Date.now(),
            },
            mercuryTargetOrigin
          )
        } else {
          // Standalone (non-embedded) report mark — neutral `#ready` instead
          // of the legacy `#venus-ready` so the user-visible URL never
          // reveals the internal codename. The helper still tolerates the
          // legacy hash on the read path so in-flight tabs are not
          // unnecessarily rewritten.
          const decision = resolveStandaloneReportReadyHash({
            pathname: window.location.pathname,
            search: window.location.search,
            hash: window.location.hash,
          })
          if (decision.shouldReplace) {
            window.history.replaceState(null, '', decision.nextUrl)
          }
        }
      }

      if (isBootstrapSynced) {
        signalReady()
      }
    }, [isBootstrapSynced, reportId, urlParams.source])

    // Early return AFTER all hooks have been called
    if (!reportId || !isValidReportId(reportId)) {
      return null
    }

    return (
      <div
        className={`flex h-[100dvh] w-screen flex-col overflow-hidden bg-background ${isEmbedded ? 'embedded-mode' : ''}`}
      >
        <Suspense
          fallback={null}
          // Loading is handled by ValuationSessionManager so the route has one
          // unified loading surface.
        >
          <ValuationSessionManager
            reportId={reportId}
            initialMode={initialMode}
            initialVersion={initialVersion}
          >
            {({
              session,
              stage,
              isLoading,
              error,
              errorPresentation,
              showOutOfCreditsModal,
              onCloseModal,
              prefilledQuery,
              autoSend,
              onRetry,
              onStartOver,
            }) => (
              <ValuationFlowSelector
                session={session}
                stage={stage}
                isLoading={isLoading}
                error={error}
                errorPresentation={errorPresentation}
                prefilledQuery={prefilledQuery}
                autoSend={autoSend}
                onComplete={handleValuationComplete}
                accountantCustomerId={urlParams.clientId}
                initialMode={initialMode}
                initialVersion={initialVersion}
                onRetry={onRetry}
                onStartOver={onStartOver}
                reportId={reportId}
                initialTab={initialTab}
                urlAction={urlAction}
                initialDrawerOpen={urlParams.drawer === 'open'}
                initialAgentNext={urlParams.agent_next || urlParams.ai_next}
                initialValuationIntent={
                  urlParams.intent === 'start_valuation' ? 'start_valuation' : undefined
                }
                guidedResolution={{
                  spotlight: urlParams.spotlight,
                  focusField: urlParams.focusField,
                  flagYear: urlParams.flagYear,
                }}
                initialSelectedMethodFromUrl={urlParams.selected_method}
                initialSelectedMethodsFromUrl={urlParams.selected_methods}
              />
            )}
          </ValuationSessionManager>
        </Suspense>
      </div>
    )
  }
)

ValuationReport.displayName = 'ValuationReport'
