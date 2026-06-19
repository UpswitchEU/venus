'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useTransitionRouter } from 'next-view-transitions'
import React, { useCallback, useEffect, useRef } from 'react'
import { buildStaleReportRecoveryUrl } from '../features/manual/utils/deleteValuationEntry'
import { trackPaywallShown } from '../lib/analytics'
import { useAuthStore } from '../lib/auth'
import { useBootstrapSafe } from '../lib/bootstrap'
import {
  buildMercuryDelegatedHandoffSignals,
  buildSeedIdentity,
  hasAssetsInSession,
  isDelegatedMercuryAccountantHandoff,
  shouldSeedOptimisticMercuryShell,
} from '../lib/mercury/sessionReadiness'
import { useSessionStore } from '../store/useSessionStore'
import { useClientContext } from '../stores/clientContext'
import type { ValuationSession } from '../types/valuation'
import { generalLogger } from '../utils/logger'
import { useSessionManagerTimeouts } from './useSessionManagerTimeouts'
import { useValuationSessionLoader } from './useValuationSessionLoader'
import { resolveValuationSessionStage, type Stage } from './ValuationSessionManager.stage'
import { ValuationSessionPaywall } from './ValuationSessionPaywall'

const MERCURY_OPTIMISTIC_SHELL_DELAY_MS = 1200

function readStringField(source: unknown, key: string): string | null {
  if (!source || typeof source !== 'object') return null
  const value = (source as Record<string, unknown>)[key]
  return typeof value === 'string' && value.length > 0 ? value : null
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

    const bootstrapMismatch = !!(
      bootstrap &&
      bootstrapComplete &&
      bootstrap.report.mode === 'new' &&
      reportId &&
      urlIndicatesExisting
    )

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

    const optimisticMercuryShellSeededRef = useRef<string | null>(null)
    const delegatedShellSkipLoggedRef = useRef(false)
    /** One-shot: redirect off stale deleted-report URLs after load failure */
    const staleRecoveryAttemptedRef = useRef(false)

    // Reset refs when reportId changes (component reused for different report)
    useEffect(() => {
      const scopedReportId = reportId
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

    // ✅ FIX: Show loading until session is loaded AND initialized
    // WORLD CLASS: Also consider bootstrap state for stage calculation
    // If bootstrap is still running, we're loading. If bootstrap failed but
    // session store has data, continue with session store data.
    //
    // OPTIMISTIC: Mercury flows render 'data-entry' while bootstrap is in progress.
    // The form shows immediately with empty/placeholder state. When bootstrap
    // completes the session hydrates and the form fills in. The useCanSave hook
    // prevents destructive actions until auth + bootstrap are ready.
    const stage: Stage = resolveValuationSessionStage({
      bootstrapError: bootstrap?.bootstrapError,
      bootstrapMode: bootstrap?.report.mode ?? null,
      delegatedHandoffSignals,
      isBootstrapping,
      isFromMercury,
      isInitializing,
      isLoading,
      reportId,
      requiresRenderableAssets,
      session,
      status,
      urlIndicatesExisting,
    })

    const showTimeoutWarning = useSessionManagerTimeouts({
      hasSession: !!session,
      isBootstrapping,
      isDelegatedAccountantHandoff,
      isInitializing,
      isLoading,
      reportId,
      stage,
      status,
    })

    const { handleRetry } = useValuationSessionLoader({
      bootstrapComplete,
      bootstrapError: bootstrap?.bootstrapError,
      bootstrapHasExistingSession,
      bootstrapHasNewReport,
      bootstrapHasSession,
      bootstrapMismatch,
      bootstrapReportHasExistingData: bootstrap?.report.hasExistingData,
      bootstrapReportId,
      bootstrapReportMode: bootstrap?.report.mode,
      bootstrapReportReady: bootstrap?.report.reportReady,
      detectedFlow,
      isBootstrapping,
      loadSession,
      prefilledQuery,
      refreshBootstrap: bootstrap?.refreshBootstrap,
      reportId,
      session,
      sessionHasAssets,
      urlPrefilledQuery,
    })

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

        <ValuationSessionPaywall
          authUserRole={authUser?.role}
          bootstrapCreditStatus={bootstrapCreditStatus}
          bootstrapIsAccountantFlow={bootstrap?.isAccountantFlow}
          clearPaywall={clearPaywall}
          onNavigateHome={() => router.push('/')}
          pathname={pathname}
          paywallData={paywallData}
          showCreditError={showCreditError}
        />
      </>
    )
  }
)

ValuationSessionManager.displayName = 'ValuationSessionManager'
