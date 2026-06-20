'use client'

/**
 * Bootstrap Provider
 *
 * React context provider for bootstrap state hydration.
 * Provides the complete bootstrap state to all child components.
 *
 * @module lib/bootstrap/BootstrapProvider
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useIsMountedRef } from '../../features/manual/hooks/useNavigationCancellation'
import { resetBootstrapSyncGateForRetry } from '../../hooks/useBootstrapSync'
import { useClientContext } from '../../stores/clientContext'
import { generalLogger } from '../../utils/logger'
import { clearInitThrottle, clearReloadCounter, useAuthStore } from '../auth'
import { refreshDelegatedClientContextIfNeeded } from '../auth/delegatedClientContextRefresh'
import {
  isDelegatedClientContextReadyForBootstrap,
  shouldWaitForMercuryClientContextBeforeBootstrap,
} from '../mercury/sessionReadiness'
import { setBootstrapState } from '../sessionInitialization'
import {
  BootstrapContext,
  type BootstrapContextValue,
  resolveBootstrapConvenienceFlags,
} from './BootstrapContext'
import {
  clearScopedGlobalBootstrapResult,
  hasScopedGlobalBootstrapResult,
  rememberScopedGlobalBootstrapResult,
} from './BootstrapProviderCache'
import {
  commitBootstrapCacheResult,
  resolveScopedBootstrapCacheResult,
} from './BootstrapProviderCacheHydration'
import {
  evaluateBootstrapCreditPolicy,
  evaluateBootstrapReportIdentity,
  hasMeaningfulBootstrapPrefill,
} from './BootstrapProviderModel'
import { getBootstrapContextCacheKey } from './contextCacheKey'
import { applyBootstrapPackageHydration } from './packageHydration'
import { AuthenticationRequiredError } from './resolvers/AuthResolver'
import { bootstrapService } from './SessionBootstrapService'
import type {
  BootstrapContext as BootstrapContextShape,
  FlowType,
  IdentityState,
  PrefillData,
  ReportState,
  SessionBootstrapState,
  UIHints,
} from './types'
import {
  BOOTSTRAP_VERSION,
  DEFAULT_BOOTSTRAP_STATE,
  DEFAULT_IDENTITY,
  DEFAULT_PREFILL,
  DEFAULT_REPORT,
  DEFAULT_UI_HINTS,
} from './types'
import { parseUrlToContext } from './utils'

function readDelegatedBootstrapReadiness(activeContext: BootstrapContextShape): {
  authSettled: boolean
  needsDelegatedContext: boolean
  ready: boolean
} {
  const authState = useAuthStore.getState()
  const authSettled = !authState.loading && !authState.isInitializing && !authState.isRefreshing
  const needsDelegatedContext = shouldWaitForMercuryClientContextBeforeBootstrap({
    sourceApp: activeContext.sourceApp,
    reportId: activeContext.reportId,
    clientId: activeContext.clientId,
    clientToken: activeContext.clientToken,
    mercuryPersonaMode: activeContext.mercuryPersonaMode,
    url: activeContext.url,
    hasClientTokenHint: !!activeContext.clientToken?.trim(),
  })

  if (!authSettled) {
    return { authSettled, needsDelegatedContext, ready: false }
  }

  if (!needsDelegatedContext) {
    return { authSettled, needsDelegatedContext, ready: true }
  }

  const ctx = useClientContext.getState()
  const ready = isDelegatedClientContextReadyForBootstrap({
    needsMercuryClientContext: true,
    contextGateResolved: ctx.contextGateResolved,
    clientId: activeContext.clientId,
    isActingAsClient: ctx.isActingAsClient,
    accountantId: ctx.accountant?.id ?? null,
    relationshipId: ctx.relationshipId,
  })

  return { authSettled, needsDelegatedContext, ready }
}

export type { BootstrapContextValue } from './BootstrapContext'
export {
  useBootstrap,
  useBootstrapIdentity,
  useBootstrapPrefill,
  useBootstrapReport,
  useBootstrapSafe,
  useBootstrapUI,
  useIsBootstrapComplete,
} from './BootstrapContext'
/** Reset the module-level bootstrap guard (call on logout) */
export { clearScopedGlobalBootstrapResult as resetBootstrapGuard } from './BootstrapProviderCache'

// ============================================================================
// Provider Props
// ============================================================================

interface BootstrapProviderProps {
  children: React.ReactNode
  /** Initial state from server-side bootstrap (optional) */
  initialState?: SessionBootstrapState
  /** Bootstrap context for client-side bootstrap (optional) */
  context?: BootstrapContextShape
  /** Whether to auto-bootstrap on mount if no initial state */
  autoBootstrap?: boolean
  /** Bootstrap method: 'titan' uses server API, 'client' uses client-side resolvers */
  method?: 'titan' | 'client'
  /** Callback when bootstrap completes */
  onBootstrapComplete?: (state: SessionBootstrapState) => void
  /** Callback when bootstrap fails */
  onBootstrapError?: (error: string) => void
}

// ============================================================================
// Provider Component
// ============================================================================

export function BootstrapProvider({
  children,
  initialState,
  context,
  autoBootstrap = true,
  method = 'titan', // Default to Titan API for optimal performance
  onBootstrapComplete,
  onBootstrapError,
}: BootstrapProviderProps) {
  // Detect Mercury handoffs to optimize loading flow.
  const _isFromMercury = React.useMemo(() => {
    if (context?.sourceApp === 'mercury') return true
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      return urlParams.get('source') === 'mercury'
    }
    return false
  }, [context?.sourceApp])
  // State
  const [state, setState] = useState<SessionBootstrapState>(initialState || DEFAULT_BOOTSTRAP_STATE)
  const [isBootstrapping, setIsBootstrapping] = useState(!initialState && autoBootstrap)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)

  // Prevent duplicate bootstrap calls using refs
  const bootstrapStartedRef = useRef(false)
  const bootstrapCompletedRef = useRef(false)
  const bootstrapRunIdRef = useRef(0)
  const _contextReportIdRef = useRef(context?.reportId)
  const prevDelegationCacheKeyRef = useRef<string | null>(null)

  // Stable refs for parent callbacks — avoids runBootstrap re-creation
  // when parent passes new closure references on every render.
  const onBootstrapCompleteRef = useRef(onBootstrapComplete)
  const onBootstrapErrorRef = useRef(onBootstrapError)
  useEffect(() => {
    onBootstrapCompleteRef.current = onBootstrapComplete
  }, [onBootstrapComplete])
  useEffect(() => {
    onBootstrapErrorRef.current = onBootstrapError
  }, [onBootstrapError])

  // Abort guard: prevents stale setState calls after unmount
  const mountedRef = useIsMountedRef()
  const activeContext = useMemo(
    () => context || parseUrlToContext(typeof window !== 'undefined' ? window.location.href : '/'),
    [context]
  )

  // Bootstrap function
  const runBootstrap = useCallback(async () => {
    // Guard 1 (React ref): prevent duplicate calls within same mount
    if (bootstrapStartedRef.current) {
      generalLogger.debug(
        '[BootstrapProvider] Bootstrap already started, skipping duplicate call',
        {
          reportId: activeContext.reportId?.substring(0, 30),
        }
      )
      return
    }

    const { authSettled, ready: delegatedReady } = readDelegatedBootstrapReadiness(activeContext)

    if (!authSettled) {
      generalLogger.debug('[BootstrapProvider] Auth not settled — deferring bootstrap')
      bootstrapStartedRef.current = false
      return
    }

    if (!delegatedReady) {
      generalLogger.warn(
        '[BootstrapProvider] Delegated client context not ready — deferring Titan bootstrap',
        {
          reportId: activeContext.reportId?.substring(0, 30),
          hasClientId: !!activeContext.clientId?.trim(),
          storedRelationshipId: useClientContext.getState().relationshipId?.substring(0, 8) ?? null,
          authError: useAuthStore.getState().error?.substring(0, 80),
        }
      )
      bootstrapStartedRef.current = false
      if (mountedRef.current) {
        setIsBootstrapping(false)
        const message = useAuthStore.getState().error?.trim()
        if (message) setBootstrapError(message)
      }
      return
    }

    // Guard 2 (module-level): bootstrap already completed in a previous mount
    if (hasScopedGlobalBootstrapResult()) {
      const cached = resolveScopedBootstrapCacheResult(activeContext)
      if (cached) {
        generalLogger.debug(
          '[BootstrapProvider] Module-level guard — hydrating scoped cache (no callbacks)',
          {
            reportId: activeContext.reportId?.substring(0, 30),
          }
        )
        commitBootstrapCacheResult({
          activeContext,
          bootstrapCompletedRef,
          bootstrapStartedRef,
          result: cached,
          setIsBootstrapping,
          setState,
        })
        return
      }
    }

    // Guard 3 (singleton cache): prevent re-bootstrap after component remount
    const cachedResult = bootstrapService.getCachedResult(activeContext)
    if (cachedResult) {
      generalLogger.debug(
        '[BootstrapProvider] Singleton cache hit — using cached result instead of re-fetching',
        {
          reportId: activeContext.reportId?.substring(0, 30),
        }
      )
      commitBootstrapCacheResult({
        activeContext,
        bootstrapCompletedRef,
        bootstrapStartedRef,
        notifyComplete: onBootstrapCompleteRef.current,
        rememberScopedResult: true,
        result: cachedResult,
        setIsBootstrapping,
        setState,
      })
      return
    }

    bootstrapStartedRef.current = true
    const runId = ++bootstrapRunIdRef.current
    if (!mountedRef.current) return
    setIsBootstrapping(true)
    setBootstrapError(null)

    const _startTime = performance.now()

    try {
      const bootstrapContext = activeContext

      generalLogger.debug('[BootstrapProvider] Starting bootstrap', {
        contextReportId: bootstrapContext.reportId?.substring(0, 30) || 'none',
        method,
      })

      // Choose bootstrap method
      let result: SessionBootstrapState
      if (method === 'titan') {
        // Use Titan API for single-request bootstrap (optimal performance)
        result = await bootstrapService.bootstrapViaTitan(bootstrapContext)
      } else {
        // Use client-side resolvers (fallback)
        result = await bootstrapService.bootstrap(bootstrapContext)
      }

      if (runId !== bootstrapRunIdRef.current) {
        generalLogger.debug('[BootstrapProvider] Ignoring stale bootstrap result', {
          reportId: bootstrapContext.reportId?.substring(0, 30),
        })
        return
      }

      // CRITICAL VALIDATION: Ensure bootstrap returned the correct reportId
      // If we requested a specific reportId and got a different one, that's a bug
      const reportIdentity = evaluateBootstrapReportIdentity({
        requestedReportId: bootstrapContext.reportId,
        returnedReportId: result.report.reportId,
        reportMode: result.report.mode,
      })

      if (reportIdentity.kind !== 'match') {
        // The "new" → UUID mint is the expected creation path; accept it.
        // Any other mismatch is a contract violation: Titan resolved a session
        // for a different report than the URL asks for. Silently swapping the
        // id (the previous behavior) labelled the wrong report's data as the
        // requested one — saves and edits then leaked across reports.
        // Fail loud so ValuationSessionManager can show the error / trigger
        // its stale-recovery redirect to /reports/new.
        if (reportIdentity.kind === 'mismatch') {
          generalLogger.error(
            '[BootstrapProvider] Bootstrap returned different reportId than requested - aborting',
            {
              requested: reportIdentity.requestedId.substring(0, 30),
              returned: reportIdentity.returnedId?.substring(0, 30),
              mode: reportIdentity.reportMode,
            }
          )
          throw new Error(reportIdentity.message)
        }
        generalLogger.debug('[BootstrapProvider] New report minted by server', {
          minted: reportIdentity.returnedId.substring(0, 30),
        })
      }

      // Credit check: only block new reports.
      // Users must be able to view their completed valuations regardless of credit status
      const creditPolicy = evaluateBootstrapCreditPolicy({
        creditStatus: result.creditStatus,
        reportMode: result.report.mode,
      })

      if (creditPolicy.kind === 'block-new-report') {
        onBootstrapErrorRef.current?.(creditPolicy.message)

        generalLogger.error('[BootstrapProvider] Credit check failed - preventing new valuation', {
          message: creditPolicy.message,
          upgradePath: creditPolicy.creditStatus.upgrade_path,
          creditsRemaining: creditPolicy.creditStatus.credits_remaining,
          reportMode: result.report.mode,
        })

        if (mountedRef.current) {
          setState(result)
          setBootstrapError(creditPolicy.message)
        }
        bootstrapCompletedRef.current = true
        setBootstrapState(result)
        return
      }

      // Log if existing report viewed with insufficient credits (allowed, but noted)
      if (creditPolicy.kind === 'allow-existing-report-with-credit-warning') {
        generalLogger.debug(
          '[BootstrapProvider] Viewing existing report despite insufficient credits',
          {
            reportId: result.report.reportId.substring(0, 30),
            creditsRemaining: creditPolicy.creditStatus.credits_remaining,
          }
        )
      }

      if (mountedRef.current) setState(result)
      bootstrapCompletedRef.current = true
      rememberScopedGlobalBootstrapResult(bootstrapContext, result)

      // Bootstrap succeeded — clear the reload-loop circuit breaker so
      // future legitimate reloads aren't blocked.
      clearReloadCounter()

      // Sync with SessionInitializer for backward compatibility
      setBootstrapState(result)

      // Defer valuationPackage hydration to a microtask so it does not run in the
      // same commit window as `setState(result)`. The callback must stay synchronous
      // (no dynamic import) so this microtask finishes before useBootstrapSync's.
      queueMicrotask(() => {
        if (!mountedRef.current) return
        applyBootstrapPackageHydration(result)
      })

      // Session engine is set in useBootstrapSync's deferred microtask together with
      // session/form hydration — avoids a separate Zustand commit between
      // `setState(result)` and ManualLayout's sync (React #185 on Mercury handoffs).

      onBootstrapCompleteRef.current?.(result)

      generalLogger.debug('[BootstrapProvider] Bootstrap complete', {
        method,
        reportId: result.report.reportId.substring(0, 30),
        identityType: result.identity.type,
        reportMode: result.report.mode,
        prefillConfidence: result.prefillData.confidence.toFixed(2),
        durationMs: result.bootstrapDurationMs,
        creditStatus: result.creditStatus
          ? {
              allowed: result.creditStatus.allowed,
              creditsRemaining: result.creditStatus.credits_remaining,
            }
          : 'not checked',
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (runId !== bootstrapRunIdRef.current) {
        generalLogger.debug('[BootstrapProvider] Ignoring stale bootstrap error', {
          error: errorMessage,
        })
        return
      }

      // Check if this is an authentication error that requires redirect
      if (error instanceof AuthenticationRequiredError) {
        // Navigational logout may clear cookies before the document unloads; resolver
        // can throw auth-required. Do not send user to Mercury login on top of /api/auth/logout.
        if (typeof window !== 'undefined' && window.__isLoggingOut) {
          generalLogger.debug(
            '[BootstrapProvider] Skip login redirect — logout in progress (cookies clearing)'
          )
          return
        }

        generalLogger.debug('[BootstrapProvider] Authentication required - redirecting to login', {
          redirectUrl: error.redirectUrl,
          currentUrl: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
        })

        // Immediate redirect - no error state, no loading state
        if (typeof window !== 'undefined') {
          clearInitThrottle()
          window.location.href = error.redirectUrl
        }
        return // Stop execution - redirect is happening
      }

      // Handle other errors normally
      if (mountedRef.current) setBootstrapError(errorMessage)
      onBootstrapErrorRef.current?.(errorMessage)

      generalLogger.error('[BootstrapProvider] Bootstrap failed:', errorMessage)
    } finally {
      if (runId === bootstrapRunIdRef.current && mountedRef.current) setIsBootstrapping(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContext, method, mountedRef])

  // Explicit retry: resets all guards and forces a fresh bootstrap call.
  // Used when bootstrap fails and the user/UI needs to retry.
  const forceRefreshBootstrap = useCallback(async () => {
    generalLogger.debug('[BootstrapProvider] Force refresh — resetting all guards')
    bootstrapStartedRef.current = false
    bootstrapCompletedRef.current = false
    clearScopedGlobalBootstrapResult()
    bootstrapRunIdRef.current += 1
    resetBootstrapSyncGateForRetry()
    bootstrapService.clearCache()
    bootstrapService.clearInflightCache()
    bootstrapService.resetCircuitBreaker()
    if (mountedRef.current) {
      setBootstrapError(null)
      setIsBootstrapping(true)
    }
    await runBootstrap()
  }, [runBootstrap, mountedRef])

  // Auth-readiness subscription. Required for optimistic AuthGate paths:
  // when AuthGate renders children before auth has settled, the first
  // runBootstrap() call exits early at the auth guard (line 260-264) and
  // resets bootstrapStartedRef. Without watching auth state, bootstrap would
  // never retry. Subscribing here re-renders the provider when auth flips
  // and our effect below picks up the second chance.
  // Single derived boolean keeps the re-render count to one per auth-readiness
  // transition (previously each of the three selectors fired independently,
  // tripling provider renders on every auth tick).
  const delegationCacheKey = useMemo(
    () => getBootstrapContextCacheKey(activeContext),
    [activeContext]
  )

  const needsMercuryClientContext = useMemo(
    () =>
      shouldWaitForMercuryClientContextBeforeBootstrap({
        sourceApp: activeContext.sourceApp,
        reportId: activeContext.reportId,
        clientId: activeContext.clientId,
        clientToken: activeContext.clientToken,
        mercuryPersonaMode: activeContext.mercuryPersonaMode,
        url: activeContext.url,
        hasClientTokenHint: !!activeContext.clientToken?.trim(),
      }),
    [
      activeContext.sourceApp,
      activeContext.reportId,
      activeContext.clientId,
      activeContext.clientToken,
      activeContext.mercuryPersonaMode,
      activeContext.url,
    ]
  )

  useEffect(() => {
    if (!needsMercuryClientContext) return
    if (prevDelegationCacheKeyRef.current === null) {
      prevDelegationCacheKeyRef.current = delegationCacheKey
      return
    }
    if (prevDelegationCacheKeyRef.current === delegationCacheKey) return

    prevDelegationCacheKeyRef.current = delegationCacheKey
    bootstrapStartedRef.current = false
    bootstrapCompletedRef.current = false
    clearScopedGlobalBootstrapResult()
    bootstrapService.clearCache()
    bootstrapService.clearInflightCache()

    void refreshDelegatedClientContextIfNeeded({
      clientId: activeContext.clientId,
      reportId: activeContext.reportId,
      sourceApp: activeContext.sourceApp,
      mercuryPersonaMode: activeContext.mercuryPersonaMode,
      clientToken: activeContext.clientToken,
      url: activeContext.url,
    })
  }, [
    delegationCacheKey,
    needsMercuryClientContext,
    activeContext.clientId,
    activeContext.reportId,
    activeContext.sourceApp,
    activeContext.mercuryPersonaMode,
    activeContext.clientToken,
    activeContext.url,
  ])

  const mercuryClientContextReady = useClientContext((s) =>
    isDelegatedClientContextReadyForBootstrap({
      needsMercuryClientContext,
      contextGateResolved: s.contextGateResolved,
      clientId: activeContext.clientId,
      isActingAsClient: s.isActingAsClient,
      accountantId: s.accountant?.id ?? null,
      relationshipId: s.relationshipId,
    })
  )

  const authStoreReady = useAuthStore((s) => !s.loading && !s.isInitializing && !s.isRefreshing)
  const authError = useAuthStore((s) => s.error)
  const authReady = authStoreReady && mercuryClientContextReady

  // Delegated Mercury opens: if get-client-context failed, surface auth error instead of
  // spinning on loading until the 30s session timeout (optimistic AuthGate still renders children).
  useEffect(() => {
    if (!needsMercuryClientContext || mercuryClientContextReady || !authStoreReady) return
    const message = authError?.trim()
    if (!message || bootstrapCompletedRef.current) return

    generalLogger.warn('[BootstrapProvider] Mercury client context failed — surfacing error', {
      reportId: activeContext.reportId?.substring(0, 30),
      hasClientId: !!activeContext.clientId?.trim(),
    })
    setBootstrapError(message)
    setIsBootstrapping(false)
  }, [
    needsMercuryClientContext,
    mercuryClientContextReady,
    authStoreReady,
    authError,
    activeContext.reportId,
    activeContext.clientId,
  ])

  // Auto-bootstrap when auth is ready and no initial state is provided.
  // Fires on mount (non-optimistic path: AuthGate already gated) and again
  // when auth settles (optimistic path: AuthGate let children through early).
  // Internal guards (bootstrapCompletedGlobally, bootstrapStartedRef, in-flight
  // promise cache) ensure at-most-once execution per report.
  useEffect(() => {
    if (hasScopedGlobalBootstrapResult()) {
      if (bootstrapStartedRef.current) {
        return
      }

      if (!authReady) {
        return
      }

      const cached = resolveScopedBootstrapCacheResult(activeContext)
      if (cached) {
        commitBootstrapCacheResult({
          activeContext,
          bootstrapCompletedRef,
          bootstrapStartedRef,
          result: cached,
          setIsBootstrapping,
          setState,
        })
        return
      }
    }

    if (bootstrapStartedRef.current || initialState) {
      return
    }

    if (autoBootstrap && authReady) {
      runBootstrap()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, autoBootstrap, activeContext, initialState, runBootstrap])

  // NOTE: setEngine is intentionally NOT called here via a reactive useEffect.
  // It is already invoked in two authoritative places:
  //   1. useBootstrapSync.syncEngine() — deferred microtask after Titan bootstrap
  //   2. updateIdentity() — when identity is explicitly mutated after bootstrap
  // A third reactive effect using require() would create a third engine instance on
  // every identity re-render, race with the primary invocations, and cause unnecessary
  // SessionEngine churn during the bootstrap → sync cycle.

  // Update functions
  const updateIdentity = useCallback((identity: Partial<IdentityState>) => {
    setState((prev) => {
      const updatedIdentity = { ...prev.identity, ...identity }

      // AUTH-FIRST: Update engine when identity changes
      try {
        const { useSessionStore } = require('../../store/useSessionStore')
        useSessionStore.getState().setEngine(updatedIdentity)
      } catch (error) {
        generalLogger.error('[BootstrapProvider] Failed to set session engine on identity update', {
          error: error instanceof Error ? error.message : String(error),
        })
      }

      return {
        ...prev,
        identity: updatedIdentity,
      }
    })
  }, [])

  const updateReport = useCallback((report: Partial<ReportState>) => {
    setState((prev) => ({
      ...prev,
      report: { ...prev.report, ...report },
    }))
  }, [])

  const updatePrefillData = useCallback((prefillData: Partial<PrefillData>) => {
    setState((prev) => ({
      ...prev,
      prefillData: { ...prev.prefillData, ...prefillData },
    }))
  }, [])

  const updateUIHints = useCallback((ui: Partial<UIHints>) => {
    setState((prev) => ({
      ...prev,
      ui: { ...prev.ui, ...ui },
    }))
  }, [])

  // Context value with memoization
  const value = useMemo<BootstrapContextValue>(
    () => ({
      // State
      state,
      isBootstrapping,
      bootstrapError,

      // Derived state
      identity: state.identity,
      report: state.report,
      prefillData: state.prefillData,
      ui: state.ui,
      creditStatus: state.creditStatus, // Credit status from bootstrap state

      ...resolveBootstrapConvenienceFlags(state),
      hasPrefilledData: hasMeaningfulBootstrapPrefill(state.prefillData),

      // Actions
      refreshBootstrap: forceRefreshBootstrap,
      updateIdentity,
      updateReport,
      updatePrefillData,
      updateUIHints,
    }),
    [
      state,
      isBootstrapping,
      bootstrapError,
      forceRefreshBootstrap,
      updateIdentity,
      updateReport,
      updatePrefillData,
      updateUIHints,
    ]
  )

  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>
}

// ============================================================================
// Default Export
// ============================================================================

export default BootstrapProvider
