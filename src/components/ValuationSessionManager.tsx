/**
 * ValuationSessionManager Component (Simplified)
 *
 * Cursor-style session management with optimistic rendering.
 * Single Responsibility: Load session and provide to children.
 *
 * WORLD CLASS: Integrates with bootstrap system for unified initialization.
 * If bootstrap has already resolved the session, this component uses that
 * data instead of making redundant API calls.
 *
 * Simplifications:
 * - No stage state machine (just isLoading boolean)
 * - No complex guards (promise cache handles duplicates)
 * - No deadline timers (optimistic rendering handles delays)
 * - Simple error recovery
 * - Bootstrap integration for zero-latency session access
 *
 * @module components/ValuationSessionManager
 */

'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTransitionRouter } from 'next-view-transitions'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { showAdvisorCalculatorSurface } from '../constants/accountantPlanMethods'
import { buildStaleReportRecoveryUrl } from '../features/manual/utils/deleteValuationEntry'
import { trackPaywallShown, trackPaywallUpgradeClick } from '../lib/analytics'
import { useAuthStore } from '../lib/auth'
import {
  isAccountantBillingUpgradePath,
  isClientPremiumUpgradePath,
  useBootstrapSafe,
} from '../lib/bootstrap'
import {
  BOOTSTRAP_TIMEOUT_USER_MESSAGE,
  SESSION_NOT_READY_USER_MESSAGE,
} from '../lib/bootstrap/bootstrapUserMessages'
import {
  buildMercuryDelegatedHandoffSignals,
  buildSeedIdentity,
  canRenderReportSession,
  hasAssetsInSession,
  isDelegatedMercuryAccountantHandoff,
  shouldAllowOptimisticMercuryRender,
  shouldSeedOptimisticMercuryShell,
} from '../lib/mercury/sessionReadiness'
import { SessionRestorationService } from '../services/session/SessionRestorationService'
import { sessionService } from '../services/session/SessionService'
import { useManualResultsStore } from '../store/manual/useManualResultsStore'
import { useSessionStore } from '../store/useSessionStore'
import { useClientContext } from '../stores/clientContext'
import type { ValuationSession } from '../types/valuation'
import { getMercuryUrl } from '../utils/getMercuryUrl'
import { generalLogger } from '../utils/logger'
import { extractRenderableHtmlFromSessionPayload } from '../utils/reportHtmlRecovery'
import { ValuationPaywallModal } from './ValuationPaywallModal'

type Stage = 'loading' | 'data-entry' | 'processing' | 'flow-selection' | 'error'

const MERCURY_OPTIMISTIC_SHELL_DELAY_MS = 1200

function readStringField(source: unknown, key: string): string | null {
  if (!source || typeof source !== 'object') return null
  const value = (source as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function readErrorName(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('name' in error)) return null
  const value = (error as { name?: unknown }).name
  return typeof value === 'string' ? value : null
}

interface ValuationSessionManagerProps {
  reportId: string
  initialMode?: 'edit' | 'view'
  initialVersion?: number
  children: (props: {
    session: ValuationSession | null
    stage: Stage
    isLoading: boolean
    error: string | null
    showOutOfCreditsModal: boolean
    onCloseModal: () => void
    prefilledQuery: string | null
    autoSend: boolean
    onRetry: () => void
    onStartOver: () => void
    reportId: string
    showTimeoutWarning: boolean
  }) => React.ReactNode
}

/**
 * Valuation Session Manager (Simplified)
 *
 * Load session and render children optimistically.
 * Promise cache prevents duplicate loads.
 */
export const ValuationSessionManager: React.FC<ValuationSessionManagerProps> = React.memo(
  ({ reportId, children }) => {
    const searchParams = useSearchParams()
    const pathname = usePathname()
    const router = useTransitionRouter()
    const t = useTranslations('modals')

    // OPTIMISTIC: Detect Mercury flow to render form immediately during bootstrap
    const isFromMercury = searchParams?.get('source') === 'mercury'
    const clientIdParam = searchParams?.get('clientId')?.trim() || null
    const clientTokenParam = searchParams?.get('clientToken')?.trim() || null
    const mercuryModeParam = searchParams?.get('mode')
    const isActingAsClient = useClientContext((s) => s.isActingAsClient)
    const delegatedHandoffSignals = buildMercuryDelegatedHandoffSignals({
      isFromMercury,
      reportId,
      clientId: clientIdParam,
      clientToken: clientTokenParam,
      mode: mercuryModeParam,
      isActingAsClient,
    })

    // WORLD CLASS: Bootstrap integration - check if bootstrap has already loaded session
    const bootstrap = useBootstrapSafe()
    // The user role drives paywall audience selection (advisor vs BO copy/CTA).
    // Bootstrap.identity does not carry role, so we read it from the auth store
    // directly. The subscription keeps the modal in sync if the role flips
    // mid-session (e.g. after a SwitchWorkspace).
    const authUser = useAuthStore((s) => s.user) as { role?: string } | null
    const isBootstrapping = bootstrap?.isBootstrapping ?? false
    const bootstrapReportId = bootstrap?.report.reportId
    // Bootstrap is complete when isBootstrapping is false and there's no error
    const bootstrapComplete = bootstrap && !isBootstrapping && !bootstrap.bootstrapError
    const bootstrapHasExistingSession =
      bootstrap && bootstrap.report.mode === 'existing' && bootstrap.report.reportId === reportId
    // CRITICAL FIX: For new reports, bootstrap provides the reportId but session doesn't exist yet
    // Skip loading to avoid 404 errors - session will be created lazily on first save
    const bootstrapHasNewReport =
      bootstrap &&
      bootstrapComplete &&
      bootstrap.report.mode === 'new' &&
      bootstrap.report.reportId === reportId
    // Alias for logging
    const bootstrapHasSession = bootstrapHasExistingSession || bootstrapHasNewReport

    // DIAGNOSTIC (dev only): Log bootstrap/session state for stuck loading debugging
    generalLogger.debug('[SessionManager] Bootstrap state', {
      reportId: reportId?.substring(0, 30),
      bootstrapComplete,
      bootstrapHasExistingSession,
      bootstrapHasNewReport,
      bootstrapHasSession,
      isBootstrapping,
      bootstrapReportId: bootstrapReportId?.substring(0, 30),
      bootstrapMode: bootstrap?.report?.mode,
      sessionLoadSkipped: bootstrapHasSession,
    })

    // ✅ FIX: Detect mismatch where URL has reportId but bootstrap says "new"
    // This indicates session wasn't found - likely auth race condition or access issue
    //
    // CRITICAL: Handle BOTH ID formats that indicate existing reports:
    // - val_xxx: Direct Venus session key format
    // - UUID: Mercury passes valuation_reports.id (UUID format like xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
    // Using centralized identifier utilities for consistent format detection
    const urlIndicatesExisting = delegatedHandoffSignals.urlIndicatesExisting ?? false

    const isDelegatedAccountantHandoff =
      isDelegatedMercuryAccountantHandoff(delegatedHandoffSignals)

    const bootstrapMismatch =
      bootstrap &&
      bootstrapComplete &&
      bootstrap.report.mode === 'new' &&
      reportId &&
      urlIndicatesExisting

    // ROOT CAUSE FIX: Subscribe to `status` directly, not computed getters
    // Zustand subscriptions don't trigger re-renders with getters - must subscribe to actual state
    const status = useSessionStore((state) => state.status)
    const isLoading = status === 'loading'
    const isInitializing = status === 'idle' || status === 'loading'
    const error = useSessionStore((state) => state.errorMessage)
    const loadSession = useSessionStore((state) => state.loadSession)
    const clearSession = useSessionStore((state) => state.clearSession)

    // ⭐ PLAN ENFORCEMENT: Subscribe to paywall state
    const paywallData = useSessionStore((state) => state.paywallData)
    const clearPaywall = useSessionStore((state) => state.clearPaywall)

    // ✅ CREDIT CHECK: Check bootstrap credit status
    // AUTH-FIRST: All users are authenticated, show premium modal when credits exhausted
    // CRITICAL FIX: Only show credit error for NEW reports, not existing ones
    // If URL has val_xxx or UUID format, user is viewing an existing report - never block viewing
    const bootstrapCreditStatus = bootstrap?.creditStatus
    // Reuse the urlIndicatesExisting computed above for consistency
    const showCreditError =
      bootstrapCreditStatus && !bootstrapCreditStatus.allowed && !urlIndicatesExisting // Don't block viewing existing reports (val_xxx or UUID)

    useEffect(() => {
      if (showCreditError) {
        trackPaywallShown('bootstrap_credit')
      }
    }, [showCreditError])

    useEffect(() => {
      if (paywallData) {
        trackPaywallShown('session_credit')
      }
    }, [paywallData])

    // ROOT CAUSE FIX: Read session only when needed for stage calculation
    const session = useSessionStore((state) => state.session)
    const sessionHasAssets = hasAssetsInSession(session)
    const requiresRenderableAssets =
      !isFromMercury &&
      ((bootstrapHasExistingSession &&
        (!!bootstrap?.report.hasExistingData || bootstrap?.report.reportReady === false)) ||
        session?.reportReady === false)

    // ✅ RACE CONDITION FIX: Track if we've already initiated loading for this reportId
    // This prevents multiple concurrent loads when dependencies change rapidly
    const loadingInitiatedRef = useRef<string | null>(null)
    // LOOP FIX: Prevents concurrent restore() when effect re-runs before restore completes
    const restorationInProgressRef = useRef<string | null>(null)
    const restorationRunRef = useRef(0)
    const bootstrapRetryRef = useRef(false)
    // ✅ LOOP FIX: Track restoration completion to prevent repeated restore() calls
    // when the effect re-runs due to bootstrap/context updates
    const restorationCompletedForReportIdRef = useRef<string | null>(null)
    const optimisticMercuryShellSeededRef = useRef<string | null>(null)
    const delegatedShellSkipLoggedRef = useRef(false)
    /** One-shot: redirect off stale deleted-report URLs after load failure */
    const staleRecoveryAttemptedRef = useRef(false)

    // Reset refs when reportId changes (component reused for different report)
    useEffect(() => {
      const scopedReportId = reportId
      loadingInitiatedRef.current = null
      bootstrapRetryRef.current = false
      restorationCompletedForReportIdRef.current = null
      restorationInProgressRef.current = null
      restorationRunRef.current += 1
      optimisticMercuryShellSeededRef.current = null
      delegatedShellSkipLoggedRef.current = false
      staleRecoveryAttemptedRef.current = false
      generalLogger.debug('[SessionManager] Reset report-scoped load guards', {
        reportId: scopedReportId?.substring(0, 30),
      })
    }, [reportId])

    // Mercury handoff should never hold the whole calculator behind a slow
    // bootstrap/session refresh. After a short skeleton window, seed a minimal
    // local shell so ManualLayout can mount; useCanSave keeps destructive
    // actions disabled until auth + bootstrap have settled, and the real
    // session/prefill payload merges in through useBootstrapSync/loadSession.
    //
    // Delegated advisor opens (`clientId`, `clientToken`, `mode=accountant` on
    // an existing report) skip the shell — bootstrap must hydrate once to
    // avoid React #185 store cascades (see isDelegatedMercuryAccountantHandoff).
    useEffect(() => {
      if (isDelegatedAccountantHandoff && !delegatedShellSkipLoggedRef.current) {
        delegatedShellSkipLoggedRef.current = true
        generalLogger.debug(
          '[SessionManager] Skipping optimistic Mercury shell — delegated accountant handoff',
          {
            reportId: reportId?.substring(0, 30),
            hasClientId: !!clientIdParam,
            hasClientToken: !!clientTokenParam,
            isActingAsClient,
            mode: mercuryModeParam,
          }
        )
      }
      if (!isDelegatedAccountantHandoff) {
        delegatedShellSkipLoggedRef.current = false
      }
    }, [
      isDelegatedAccountantHandoff,
      reportId,
      clientIdParam,
      clientTokenParam,
      isActingAsClient,
      mercuryModeParam,
    ])

    useEffect(() => {
      if (
        !shouldSeedOptimisticMercuryShell({
          isFromMercury,
          isBootstrapping,
          reportId,
          urlIndicatesExisting,
          currentSessionReportId: session?.reportId,
          status,
          seededReportId: optimisticMercuryShellSeededRef.current,
          delegatedHandoffSignals,
        })
      ) {
        return
      }

      const timer = window.setTimeout(() => {
        const current = useSessionStore.getState()
        if (
          !shouldSeedOptimisticMercuryShell({
            isFromMercury,
            isBootstrapping,
            reportId,
            urlIndicatesExisting,
            currentSessionReportId: current.session?.reportId,
            status: current.status,
            seededReportId: optimisticMercuryShellSeededRef.current,
            delegatedHandoffSignals,
          })
        ) {
          return
        }

        // LOOP FIX (React #185 in Mercury accountant existing-report flow):
        // The seed timer used to flip status='loaded' BEFORE BootstrapProvider's
        // post-Titan setEngine() ran. That opened a window where ManualLayout
        // mounted with session=stub + engine=null; hooks that called
        // updateSession()/saveSession() during that window hit the engine-null
        // guard, but the surrounding re-render churn (Radix composeRefs
        // cleanup chain across every commit) compounded into a Maximum update
        // depth crash. We derive a minimal identity from auth + clientContext
        // now and seed `session` + `engine` + `status='loaded'` in a single
        // atomic `setState` (see `seedOptimisticMercuryShell` on the store).
        // The previous three-call sequence (`hydrateSession` → `setEngine` →
        // `completeInitialization`) fired three separate Zustand notifications
        // during the bootstrap in-flight window. Each notification triggered
        // a separate React commit; with many subscribers below ManualLayout
        // (form/store hooks, Radix-driven UI, framer-motion children), three
        // back-to-back commits compounded with composeRefs / Provider value
        // churn into the same React #185 cascade the engine-null fix was
        // supposed to close. Collapsing to one notification removes the
        // intermediate states ('session set / engine null', 'engine set /
        // status idle') that subscribers used to observe and re-render
        // against.
        // If auth hasn't settled enough to produce an identity, we bail and let
        // the bootstrap path own initialization.
        const seedIdentity = buildSeedIdentity({
          authUser: useAuthStore.getState().user,
          clientContext: useClientContext.getState(),
        })
        if (!seedIdentity) {
          generalLogger.debug('[SessionManager] Skipping Mercury shell seed — auth user not ready')
          return
        }

        const handoffAtFire = buildMercuryDelegatedHandoffSignals({
          isFromMercury,
          reportId,
          clientId: clientIdParam,
          clientToken: clientTokenParam,
          mode: mercuryModeParam,
          isActingAsClient: useClientContext.getState().isActingAsClient,
        })
        if (isDelegatedMercuryAccountantHandoff(handoffAtFire)) {
          generalLogger.debug(
            '[SessionManager] Skipping Mercury shell seed — delegated handoff at timer fire'
          )
          return
        }

        if (current.session?.reportId && current.session.reportId !== reportId) {
          current.clearSession()
        }

        const engineWasNullAtSeed = !current.engine
        optimisticMercuryShellSeededRef.current = reportId
        useSessionStore.getState().seedOptimisticMercuryShell({
          seedSession: {
            reportId,
            currentView: 'manual',
            dataSource: 'manual',
            partialData: {},
            sessionData: {
              _bootstrapPrefill: false,
              _optimisticMercuryShell: true,
            } as ValuationSession['sessionData'],
          },
          identity: seedIdentity,
          delegatedHandoffSignals: handoffAtFire,
        })
        generalLogger.info('[SessionManager] Seeded optimistic Mercury shell', {
          reportId: reportId.substring(0, 30),
          delayMs: MERCURY_OPTIMISTIC_SHELL_DELAY_MS,
          identityType: seedIdentity.type,
          engineWasNullAtSeed,
        })
      }, MERCURY_OPTIMISTIC_SHELL_DELAY_MS)

      return () => window.clearTimeout(timer)
    }, [
      isBootstrapping,
      isFromMercury,
      clientIdParam,
      clientTokenParam,
      mercuryModeParam,
      reportId,
      session?.reportId,
      status,
      urlIndicatesExisting,
      delegatedHandoffSignals,
    ])

    // ✅ TIMEOUT WARNING: Show warning after 10 seconds of loading
    const [showTimeoutWarning, setShowTimeoutWarning] = useState(false)

    useEffect(() => {
      if (isLoading || isInitializing) {
        const warningTimer = setTimeout(() => {
          setShowTimeoutWarning(true)
          generalLogger.warn('[SessionManager] Loading taking longer than expected', {
            reportId,
            status,
            isLoading,
            isInitializing,
          })
        }, 10000) // Show warning after 10s

        return () => clearTimeout(warningTimer)
      } else {
        setShowTimeoutWarning(false)
      }
    }, [status, reportId, isInitializing, isLoading]) // Subscribe to status directly for proper reactivity

    // WORLD-CLASS: Trust bootstrap result - no retry logic
    // The retry mechanism was causing multiple loading screens and flickering
    // Bootstrap is now optimized to handle both session_key and UUID formats
    // If session lookup fails, proceed with the result (new session creation)
    // The user can refresh manually if needed
    useEffect(() => {
      if (bootstrapMismatch) {
        generalLogger.debug(
          '[SessionManager] Bootstrap mismatch detected - proceeding without retry',
          {
            reportId: reportId?.substring(0, 30),
            bootstrapMode: bootstrap?.report.mode,
            note: 'Trusting bootstrap result for single loading state',
          }
        )
      }
    }, [bootstrapMismatch, bootstrap, reportId])

    // Extract URL params (for backward compatibility)
    // SECURITY: prefilledQuery should come from session data, not URL
    // URL parameter is only for backward compatibility during migration
    const urlPrefilledQuery = searchParams?.get('prefilledQuery') || null
    const autoSend = searchParams?.get('autoSend') === 'true'
    const flowParam = searchParams?.get('flow') as 'manual' | 'conversational' | null
    const detectedFlow = flowParam || 'manual'

    // Prioritize prefilledQuery from session data over URL parameter
    const sessionPrefilledQuery = session
      ? readStringField(session.sessionData, '_prefilledQuery') ||
        readStringField(session.partialData, '_prefilledQuery')
      : null
    const prefilledQuery = sessionPrefilledQuery || urlPrefilledQuery

    // Capture prefilledQuery in a ref so the main loading effect can read the latest
    // value without including it in the dependency array.  Including prefilledQuery in
    // deps would re-trigger the effect every time the session loads and populates
    // _prefilledQuery in sessionData, causing a spurious second loadSession call.
    const prefilledQueryRef = useRef(prefilledQuery)
    prefilledQueryRef.current = prefilledQuery

    // ✅ FIX: Show loading until session is loaded AND initialized
    // WORLD CLASS: Also consider bootstrap state for stage calculation
    // If bootstrap is still running, we're loading. If bootstrap failed but
    // session store has data, continue with session store data.
    //
    // OPTIMISTIC: Mercury flows render 'data-entry' while bootstrap is in progress.
    // The form shows immediately with empty/placeholder state. When bootstrap
    // completes the session hydrates and the form fills in. The useCanSave hook
    // prevents destructive actions until auth + bootstrap are ready.
    const stage: Stage = (() => {
      // If session is loaded and matches, always data-entry
      if (
        !isLoading &&
        !isInitializing &&
        canRenderReportSession({
          session,
          reportId,
          requiresRenderableAssets,
        })
      ) {
        return 'data-entry'
      }
      // Mercury optimistic rendering is only safe for brand new drafts.
      if (
        shouldAllowOptimisticMercuryRender({
          isFromMercury,
          isBootstrapping,
          isLoading,
          bootstrapMode: bootstrap?.report.mode ?? null,
          urlIndicatesExisting,
          delegatedHandoffSignals,
        })
      ) {
        return 'data-entry'
      }
      // Surface errors so the UI shows an error screen instead of loading forever
      if (status === 'error' && !isBootstrapping) {
        return 'error'
      }
      // SAFEGUARD: Bootstrap failed — engine is not set and loadSession must not run.
      // Surface error immediately instead of waiting for the loading timeout or
      // hitting "Session engine not initialized".
      if (
        bootstrap?.bootstrapError &&
        !isBootstrapping &&
        (status === 'idle' || status === 'loading' || isInitializing)
      ) {
        return 'error'
      }
      // Default: loading until everything is ready
      if (
        isBootstrapping ||
        isLoading ||
        isInitializing ||
        !session ||
        session.reportId !== reportId
      ) {
        return 'loading'
      }
      return 'data-entry'
    })()

    const loadingTimeoutSnapshotRef = useRef({
      status,
      isBootstrapping,
      hasSession: !!session,
    })
    useEffect(() => {
      loadingTimeoutSnapshotRef.current = {
        status,
        isBootstrapping,
        hasSession: !!session,
      }
    }, [status, isBootstrapping, session])

    // ✅ FIX: Maximum loading timeout - force error state after 30 seconds
    // This prevents users from being stuck forever on a loading screen.
    // IMPORTANT: Only reset the timer when `stage` changes (not on every status
    // change). Status oscillations (idle→loading→error) used to reset the timer
    // indefinitely; now the 30 s clock only resets if we genuinely leave 'loading'.
    useEffect(() => {
      if (stage === 'loading') {
        const maxLoadingTimer = setTimeout(() => {
          const snapshot = loadingTimeoutSnapshotRef.current
          generalLogger.error('[SessionManager] Max loading time exceeded', {
            reportId,
            status: snapshot.status,
            isBootstrapping: snapshot.isBootstrapping,
            hasSession: snapshot.hasSession,
          })

          const authError = useAuthStore.getState().error?.trim()
          const timeoutMessage =
            isDelegatedAccountantHandoff && authError
              ? authError
              : 'Loading took too long. Please try refreshing the page.'

          // Force error state via session store
          useSessionStore.setState({
            status: 'error',
            errorMessage: timeoutMessage,
          })
        }, 30000) // 30 second maximum

        return () => clearTimeout(maxLoadingTimer)
      }
    }, [stage, reportId, isDelegatedAccountantHandoff])

    // ✅ FIX: Load session when reportId changes (promise cache prevents duplicates)
    // WORLD CLASS: Skip loading if bootstrap already has this session
    // Add cleanup to prevent state updates after unmount
    // Add 30-second timeout with error handling
    // ✅ RACE CONDITION FIX: Use ref to prevent duplicate loads when dependencies change rapidly
    useEffect(() => {
      // Skip session loading if bootstrap is in progress
      if (isBootstrapping) {
        generalLogger.debug('[SessionManager] Session load SKIPPED: waiting for bootstrap', {
          reportId,
        })
        return
      }

      // Bootstrap failed — engine was never set; loadSession would throw.
      if (bootstrap?.bootstrapError) {
        generalLogger.debug('[SessionManager] Session load SKIPPED: bootstrap failed', {
          reportId,
          error: bootstrap.bootstrapError,
        })
        loadingInitiatedRef.current = null
        return
      }

      // Bootstrap finished but useBootstrapSync has not yet written the session stub
      // (deferred microtask). Avoid racing loadSession against sync — that
      // double-hydration caused React #185 on Mercury accountant handoffs.
      if (
        bootstrapComplete &&
        (bootstrapHasExistingSession || bootstrapHasNewReport) &&
        (!session || session.reportId !== reportId)
      ) {
        generalLogger.debug(
          '[SessionManager] Session load DEFERRED: waiting for bootstrap→store sync',
          {
            reportId: reportId?.substring(0, 30),
            hasSession: !!session,
            bootstrapMode: bootstrap?.report.mode,
          }
        )
        return
      }

      // If bootstrap already resolved this session, session store should be synced by useBootstrapSync
      // G1/G2 FIX: Trigger loadSession when session lacks assets OR package hydration failed (isPendingRestoration)
      if (bootstrapHasExistingSession && session?.reportId === reportId) {
        const needsFullLoad =
          SessionRestorationService.isPendingRestoration(reportId) ||
          session?.reportReady === false ||
          (bootstrap.report.hasExistingData && !sessionHasAssets)

        if (needsFullLoad) {
          generalLogger.info(
            '[SessionManager] Bootstrap session lacks assets - forcing fresh load',
            {
              reportId,
              isPendingRestoration: SessionRestorationService.isPendingRestoration(reportId),
              hasAssets: sessionHasAssets,
              hasExistingData: bootstrap.report.hasExistingData,
              bootstrapReportReady: bootstrap.report.reportReady,
              reportReady: session?.reportReady,
            }
          )
          // Clear restoration marker so the full API response wins over the bootstrap stub.
          SessionRestorationService.clearRestorationState(reportId)
          restorationCompletedForReportIdRef.current = null
          // PROGRESSIVE LOAD: We used to reset status='idle' here to defeat
          // loadSession's "already loaded" short-circuit. That worked but cost
          // the user a second visible skeleton (loaded → idle → loading →
          // loaded) every time bootstrap returned a session without the full
          // valuationPackage. loadSession is now refresh-aware
          // (useSessionStore.ts) and detects bootstrap-minimal sessions via
          // sessionData._bootstrapPrefill / _bootstrapCreated; in that mode
          // it skips its own status='loading' transition and merges the
          // server payload in place. The UI stays mounted; only data-bound
          // panels show their inner skeletons while the refresh is in flight.
          // Fall through to loadSession below (don't return)
        } else {
          // ✅ LOOP FIX: Skip restore if already completed or in progress for this reportId
          // Prevents repeated auth/bootstrap/normalization calls when effect re-runs
          if (
            SessionRestorationService.isRestored(reportId) ||
            restorationCompletedForReportIdRef.current === reportId ||
            restorationInProgressRef.current === reportId
          ) {
            generalLogger.debug(
              '[SessionManager] Skipping restore - already completed or in progress for reportId',
              { reportId: reportId?.substring(0, 30) }
            )
            // Package hydration can mark restored before useBootstrapSync flips status.
            if (useSessionStore.getState().status !== 'loaded') {
              useSessionStore.getState().completeInitialization()
            }
            loadingInitiatedRef.current = null
            return
          }

          restorationInProgressRef.current = reportId
          const restorationRun = ++restorationRunRef.current
          const shouldContinueRestore = () =>
            restorationRunRef.current === restorationRun &&
            restorationInProgressRef.current === reportId &&
            useSessionStore.getState().session?.reportId === reportId

          generalLogger.debug(
            '[SessionManager] Session load SKIPPED: already loaded via bootstrap',
            {
              reportId,
              bootstrapReportId,
            }
          )
          // Restore from session - form and output assets hydrated from sessionData
          SessionRestorationService.restore(reportId, session, {
            shouldContinue: shouldContinueRestore,
          })
            .then((result) => {
              if (!shouldContinueRestore()) {
                generalLogger.debug('[SessionManager] Ignoring stale restoration completion', {
                  reportId,
                })
                return
              }
              restorationInProgressRef.current = null
              restorationCompletedForReportIdRef.current = reportId

              // CRITICAL FIX: Flip session status to 'loaded' so downstream
              // gates (ManualLayout's isInitializing check, this component's
              // stage computation) exit their loading state. Without this,
              // the fast path (bootstrap returned a valuationPackage so we
              // skipped loadSession) leaves status pinned at 'idle' forever
              // and the skeleton never goes away — the entire performance
              // win of bootstrap-side hydration is wasted.
              // loadSession() does the equivalent (useSessionStore.ts:323);
              // here we mirror that contract at the end of the skip path.
              useSessionStore.getState().completeInitialization()

              // Phase 3.1: If restore completed but assets still missing, fetch from backend
              if (
                bootstrap.report.hasExistingData &&
                result.success &&
                !result.restoredHtmlReport
              ) {
                const ms = useManualResultsStore.getState()
                const hasHtml = !!extractRenderableHtmlFromSessionPayload({
                  htmlReport: ms.htmlReport,
                  valuationResult: ms.result,
                  sessionData: session?.sessionData,
                })
                if (!hasHtml) {
                  generalLogger.debug(
                    '[SessionManager] Assets missing after restore - revalidating in background',
                    {
                      reportId,
                    }
                  )
                  sessionService.revalidateSessionInBackground(reportId)
                }
              }
            })
            .catch((err) => {
              if (!shouldContinueRestore()) {
                generalLogger.debug('[SessionManager] Ignoring stale restoration failure', {
                  reportId,
                  error: err instanceof Error ? err.message : String(err),
                })
                return
              }
              restorationInProgressRef.current = null
              generalLogger.warn('[SessionManager] Restoration failed when skipping loadSession', {
                reportId,
                error: err instanceof Error ? err.message : String(err),
              })
              // Don't set restorationCompletedForReportIdRef on failure - allow retry
              // Still flip status to 'loaded' so the user isn't stuck behind
              // a skeleton if SessionRestorationService throws — the form
              // store may still have prefill data from useBootstrapSync.
              useSessionStore.getState().completeInitialization()
            })
          loadingInitiatedRef.current = null
          return
        }
      }

      // CRITICAL FIX: For new reports, bootstrap provides the reportId but session doesn't exist yet
      // Skip loading to avoid 404 errors - session will be created lazily on first save
      // The prefill data is already applied by useBootstrapPrefill hook
      if (bootstrapHasNewReport) {
        generalLogger.debug(
          '[SessionManager] Session load SKIPPED: new report from bootstrap, calling completeInitialization',
          {
            reportId,
            bootstrapReportId,
            bootstrapMode: bootstrap?.report.mode,
          }
        )
        // Sync may have already flipped status via hydrateSessionAndComplete.
        if (useSessionStore.getState().status !== 'loaded') {
          useSessionStore.getState().completeInitialization()
        }
        // Clear loading ref since we're done
        loadingInitiatedRef.current = null
        return
      }

      // ✅ RACE CONDITION FIX: Skip if we've already initiated loading for this reportId
      // This prevents duplicate API calls when multiple dependencies change
      if (loadingInitiatedRef.current === reportId) {
        generalLogger.debug(
          '[SessionManager] Session load SKIPPED: duplicate load already in progress',
          { reportId }
        )
        return
      }

      // Mark loading as initiated for this reportId
      loadingInitiatedRef.current = reportId

      let isMounted = true
      let timeoutId: NodeJS.Timeout

      generalLogger.debug('[SessionManager] Session load TRIGGERED', {
        reportId,
        reason: !bootstrapComplete
          ? 'bootstrap not complete'
          : bootstrapMismatch
            ? 'bootstrap mismatch (new mode for existing reportId)'
            : 'need to load session from API',
      })
      generalLogger.info('[SessionManager] Loading session', {
        reportId,
        flow: detectedFlow,
        prefilledQuery,
        bootstrapHasSession,
      })

      // Create timeout promise that also resets store state
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          // ✅ CRITICAL FIX: Force reset isInitializing on timeout
          // This prevents infinite loading when API calls hang
          generalLogger.warn('[SessionManager] Session load timeout, resetting state', { reportId })
          useSessionStore.getState().cancelActiveLoad(reportId)
          useSessionStore.setState({
            status: 'error',
            errorMessage:
              'Session load timeout (30 seconds). Please refresh the page or try again.',
          })
          reject(new Error('Session load timeout (30 seconds)'))
        }, 30000)
      })

      // Race between load and timeout
      Promise.race([loadSession(reportId, detectedFlow, prefilledQueryRef.current), timeoutPromise])
        .then(() => {
          clearTimeout(timeoutId)

          // ✅ RACE CONDITION FIX: Clear loading ref on success
          // Only clear if we're still the active load (prevent stale cleanup)
          if (loadingInitiatedRef.current === reportId) {
            loadingInitiatedRef.current = null
          }

          if (!isMounted) {
            generalLogger.debug('[SessionManager] Load completed after unmount, ignoring', {
              reportId,
            })
            return
          }

          // SECURITY: Clean sensitive parameters from URL after session is loaded
          // prefilledQuery is now stored in session_data, no need to keep it in URL
          if (typeof window !== 'undefined' && urlPrefilledQuery) {
            const url = new URL(window.location.href)
            if (url.searchParams.has('prefilledQuery')) {
              url.searchParams.delete('prefilledQuery')
              // Also clean autoSend if it was set with prefilledQuery
              if (url.searchParams.get('autoSend') === 'true' && !url.searchParams.has('flow')) {
                url.searchParams.delete('autoSend')
              }
              window.history.replaceState({}, '', url.pathname + (url.search || ''))
              generalLogger.debug(
                '[SessionManager] Cleaned prefilledQuery from URL after session load',
                {
                  reportId,
                }
              )
            }
          }
        })
        .catch((err) => {
          clearTimeout(timeoutId)

          // ✅ RACE CONDITION FIX: Clear loading ref on error to allow retry
          // Only clear if we're still the active load (prevent stale cleanup)
          if (loadingInitiatedRef.current === reportId) {
            loadingInitiatedRef.current = null
          }

          if (!isMounted) {
            generalLogger.debug('[SessionManager] Load failed after unmount, ignoring', {
              reportId,
            })
            return
          }

          // Check if error is ValidationError - don't retry these
          const isValidationError =
            err.message?.includes('Authentication required') ||
            err.message?.includes('Invalid session data') ||
            err.message?.includes('validation') ||
            err.message?.includes('ValidationError') ||
            readErrorName(err) === 'ValidationError'

          if (isValidationError) {
            generalLogger.error('[SessionManager] Validation error - stopping retries', {
              reportId,
              error: err.message,
            })
            // Set error state and stop - don't retry validation errors
            useSessionStore.setState({
              status: 'error',
              errorMessage:
                'Cannot create session. Please ensure you are logged in or try creating a new valuation.',
            })
            return // Don't continue - stop the retry loop
          }

          // ✅ IMPROVED: Categorize errors and provide user-friendly messages
          const errorMessage = err.message || 'Unknown error'
          const isTimeout = errorMessage.includes('timeout')
          const isNetworkError =
            errorMessage.includes('fetch') ||
            errorMessage.includes('network') ||
            errorMessage.includes('Failed to fetch')
          const isUuidError =
            errorMessage.includes('uuid') || errorMessage.includes('operator does not exist')
          const isAuthError = errorMessage.includes('401') || errorMessage.includes('Unauthorized')
          const isForbidden = errorMessage.includes('403') || errorMessage.includes('Forbidden')

          const isSessionNotReady =
            errorMessage.includes('Session not ready') ||
            errorMessage.includes('Session engine not initialized')

          const isBootstrapTimeout =
            errorMessage.includes(BOOTSTRAP_TIMEOUT_USER_MESSAGE) ||
            errorMessage.includes('Bootstrap request timed out')

          // Set user-friendly error message
          let userFriendlyError = 'Failed to load session. Please try again.'
          if (isBootstrapTimeout) {
            userFriendlyError = BOOTSTRAP_TIMEOUT_USER_MESSAGE
          } else if (isSessionNotReady) {
            userFriendlyError = SESSION_NOT_READY_USER_MESSAGE
          } else if (isTimeout) {
            userFriendlyError =
              'Session load timeout (30 seconds). Please refresh the page or try again.'
          } else if (isNetworkError) {
            userFriendlyError = 'Network error. Please check your connection and try again.'
          } else if (isUuidError) {
            userFriendlyError = 'Server error occurred. Please refresh the page or contact support.'
            // Log UUID errors specifically for backend debugging
            generalLogger.error('[SessionManager] UUID-related error detected', {
              reportId,
              error: errorMessage,
              stack: err.stack,
            })
          } else if (isAuthError) {
            userFriendlyError = 'Authentication error. Please log in again.'
          } else if (isForbidden) {
            userFriendlyError =
              'Access denied. Please ensure you have permission to view this report.'
          }

          // Ensure store state is reset on error (status + errorMessage drive stage derivation)
          useSessionStore.setState({
            status: 'error',
            errorMessage: userFriendlyError,
          })

          generalLogger.error('[SessionManager] Load failed', {
            reportId,
            flow: detectedFlow,
            error: errorMessage,
            isTimeout,
            isNetworkError,
            isUuidError,
            isAuthError,
            isForbidden,
            userFriendlyError,
          })
        })

      return () => {
        isMounted = false
        clearTimeout(timeoutId)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      reportId,
      detectedFlow,
      isBootstrapping,
      bootstrapHasSession,
      bootstrap?.report.hasExistingData,
      bootstrap?.report.reportReady,
      bootstrap?.report.mode,
      bootstrapComplete,
      bootstrap?.bootstrapError,
      bootstrapHasExistingSession,
      bootstrapHasNewReport,
      bootstrapMismatch,
      bootstrapReportId,
      loadSession,
      prefilledQuery,
      session,
      sessionHasAssets,
      urlPrefilledQuery,
    ]) // loadSession is stable; prefilledQuery via ref (prevents re-runs when session loads _prefilledQuery); session?.reportId intentionally excluded (prevents spurious re-runs after each load)

    // Retry: When bootstrap failed, refresh bootstrap first; otherwise reload session
    const handleRetry = useCallback(async () => {
      generalLogger.info('[SessionManager] Retrying load', {
        reportId,
        flow: detectedFlow,
        prefilledQuery: prefilledQueryRef.current,
        hadBootstrapError: !!bootstrap?.bootstrapError,
      })
      // ✅ RACE CONDITION FIX: Reset refs to allow retry
      loadingInitiatedRef.current = null
      bootstrapRetryRef.current = false
      useSessionStore.getState().cancelActiveLoad(reportId)
      // When bootstrap failed, refresh bootstrap first (engine not set yet).
      // Clear stale session-store errors from a race (e.g. loadSession timeout)
      // so the UI follows bootstrap state during retry.
      if (bootstrap?.bootstrapError && bootstrap.refreshBootstrap) {
        useSessionStore.setState({
          status: 'idle',
          errorMessage: null,
          renderError: null,
        })
        await bootstrap.refreshBootstrap()
      } else {
        useSessionStore.setState({
          status: 'idle',
          errorMessage: null,
          renderError: null,
        })
        loadSession(reportId, detectedFlow, prefilledQueryRef.current)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      reportId,
      detectedFlow,
      bootstrap?.bootstrapError,
      bootstrap?.refreshBootstrap,
      loadSession,
    ])

    // Start over: Clear and navigate home
    const handleStartOver = useCallback(() => {
      generalLogger.info('[SessionManager] Starting over', { reportId })
      clearSession()
      router.push('/')
    }, [reportId, clearSession, router])

    // Use bootstrap error when session store has no error (bootstrap failed before loadSession)
    const effectiveError =
      error || (bootstrap?.bootstrapError && stage === 'error' ? bootstrap.bootstrapError : null)

    // Ghost deleted-report URLs: bootstrap says "new" but path looks like val_* / UUID — if session
    // load still fails, recover to /reports/new with Mercury query params preserved.
    useEffect(() => {
      if (typeof window === 'undefined') return
      if (isBootstrapping || !bootstrapComplete) return
      if (!bootstrapMismatch || !effectiveError) return
      if (status !== 'error') return
      if (showCreditError || paywallData) return
      if (staleRecoveryAttemptedRef.current) return

      staleRecoveryAttemptedRef.current = true
      const locale = pathname?.match(/^\/(en|nl|fr)/)?.[1] || 'en'
      const url = buildStaleReportRecoveryUrl(locale)
      generalLogger.info('[SessionManager] Redirecting stale report URL after load error', {
        reportId: reportId?.substring(0, 30),
        target: url,
      })
      router.replace(url)
    }, [
      isBootstrapping,
      bootstrapComplete,
      bootstrapMismatch,
      effectiveError,
      status,
      pathname,
      reportId,
      router,
      showCreditError,
      paywallData,
    ])

    // ✅ FIX: Pass isLoading to children so they can prevent UI from rendering during initial load
    return (
      <>
        {children({
          session,
          stage,
          isLoading,
          error: effectiveError,
          showOutOfCreditsModal: false, // TODO: Re-implement if needed
          onCloseModal: () => undefined, // No-op
          prefilledQuery,
          autoSend,
          onRetry: handleRetry,
          onStartOver: handleStartOver,
          reportId,
          showTimeoutWarning,
        })}

        {/* ⭐ PLAN ENFORCEMENT: Paywall Modal
           Audience drives both the copy and the upgrade target. The advisor
           SaaS Starter plan is the wrong path for business owners — they go
           through the C2B2B referral loop instead (open business dashboard →
           invite an advisor). See `.cursor/rules/plg-client-invite-loop.mdc`. */}
        {(() => {
          const isAdvisorAudience =
            showAdvisorCalculatorSurface(!!bootstrap?.isAccountantFlow, authUser?.role) ||
            // Bootstrap upgrade_path can imply advisor billing before identity
            // fields are fully hydrated — keep parity with prior paywall logic.
            isAccountantBillingUpgradePath(bootstrapCreditStatus?.upgrade_path)
          const audience: 'advisor' | 'business_owner' = isAdvisorAudience
            ? 'advisor'
            : 'business_owner'

          if (showCreditError) {
            return (
              <ValuationPaywallModal
                isOpen={true}
                audience={audience}
                onClose={() => {
                  router.push('/')
                }}
                current={bootstrapCreditStatus.credits_remaining}
                limit={bootstrapCreditStatus.credits_limit}
                message={
                  bootstrapCreditStatus.message ||
                  (isAccountantBillingUpgradePath(bootstrapCreditStatus.upgrade_path)
                    ? t('paywall.accountantPaidRequired')
                    : isClientPremiumUpgradePath(bootstrapCreditStatus.upgrade_path)
                      ? t('paywall.clientPremiumRequired')
                      : t('paywall.insufficientCredits'))
                }
                onUpgrade={() => {
                  const locale = pathname?.match(/^\/(en|nl|fr)/)?.[1] || 'en'
                  trackPaywallUpgradeClick('bootstrap_credit')
                  const base = getMercuryUrl()
                  const upgradePath = isAccountantBillingUpgradePath(
                    bootstrapCreditStatus.upgrade_path
                  )
                    ? `${base}/${locale}/advisor/settings?tab=billing`
                    : isClientPremiumUpgradePath(bootstrapCreditStatus.upgrade_path)
                      ? `${base}/${locale}/pricing?tab=sellers`
                      : audience === 'business_owner'
                        ? `${base}/${locale}/business/dashboard`
                        : `${base}/${locale}/pricing`
                  window.location.href = upgradePath
                }}
              />
            )
          }

          return (
            <ValuationPaywallModal
              isOpen={!!paywallData}
              audience={audience}
              onClose={() => {
                clearPaywall()
                router.push('/')
              }}
              current={paywallData?.current || 0}
              limit={paywallData?.limit || 1}
              message={paywallData?.message}
              onUpgrade={() => {
                const loc = pathname?.match(/^\/(en|nl|fr)/)?.[1] || 'en'
                trackPaywallUpgradeClick('session_credit')
                const base = getMercuryUrl()
                window.location.href =
                  audience === 'business_owner'
                    ? `${base}/${loc}/business/dashboard`
                    : `${base}/${loc}/pricing`
              }}
            />
          )
        })()}
      </>
    )
  }
)

ValuationSessionManager.displayName = 'ValuationSessionManager'
