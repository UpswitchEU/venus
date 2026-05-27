'use client'

/**
 * Bootstrap Provider
 *
 * React context provider for bootstrap state hydration.
 * Provides the complete bootstrap state to all child components.
 *
 * @module lib/bootstrap/BootstrapProvider
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { shouldWaitForMercuryClientContextBeforeBootstrap } from '../mercury/sessionReadiness'
import { useIsMountedRef } from '../../features/manual/hooks/useNavigationCancellation'
import { useClientContext } from '../../stores/clientContext'
import { generalLogger } from '../../utils/logger'
import { clearInitThrottle, clearReloadCounter, useAuthStore } from '../auth'
import { setBootstrapState } from '../sessionInitialization'
import { getBootstrapContextCacheKey, getBootstrapReportCacheKey } from './contextCacheKey'
import { shouldHydrateBootstrapPackage } from './packageHydration'
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
  REQUIRE_AUTH_FOR_VALUATION,
} from './types'
import { parseUrlToContext } from './utils'

// Module-level flag: once bootstrap completes successfully, prevent
// re-triggering for the same existing report from any source (effect re-run,
// remount, auth toggle). Only reset on explicit forceRefresh or page reload.
let bootstrapCompletedGlobally = false
// Module-level snapshot of the last successful result. Unlike the service's
// TTL-based cache (10s), this never expires for existing reports — it survives
// component remounts indefinitely, but only for the exact requested context.
// Cleared only on logout, explicit force-refresh, or context key mismatch.
let lastGlobalResult: SessionBootstrapState | null = null
let lastGlobalContextKey: string | null = null

function getScopedGlobalResult(
  context: BootstrapContextShape | null | undefined
): SessionBootstrapState | null {
  const requestedContextKey = getBootstrapContextCacheKey(context)
  const requestedReportKey = getBootstrapReportCacheKey(context?.reportId)
  if (
    !bootstrapCompletedGlobally ||
    lastGlobalContextKey !== requestedContextKey ||
    !lastGlobalResult
  ) {
    return null
  }

  // Do not hydrate /reports/new from an immortal module cache. The service TTL
  // handles short remount deduplication for new report creation.
  if (requestedReportKey === 'new') {
    return null
  }

  const returnedId = lastGlobalResult.report.reportId?.trim()
  return returnedId === requestedReportKey ? lastGlobalResult : null
}

function rememberScopedGlobalResult(
  context: BootstrapContextShape | null | undefined,
  result: SessionBootstrapState
) {
  const requestedContextKey = getBootstrapContextCacheKey(context)
  const requestedReportKey = getBootstrapReportCacheKey(context?.reportId)
  const returnedId = result.report.reportId?.trim()

  if (requestedReportKey === 'new' || returnedId !== requestedReportKey) {
    bootstrapCompletedGlobally = false
    lastGlobalResult = null
    lastGlobalContextKey = null
    return
  }

  bootstrapCompletedGlobally = true
  lastGlobalResult = result
  lastGlobalContextKey = requestedContextKey
}

function hasMeaningfulBootstrapPrefill(prefillData: SessionBootstrapState['prefillData']): boolean {
  if ((prefillData.fieldsPopulated?.length ?? 0) > 0) return true
  if (prefillData.confidence >= 0.05) return true
  if (prefillData.companyInfo?.companyName?.trim()) return true
  if (prefillData.companyInfo?.kboNumber || prefillData.companyInfo?.vatNumber) return true
  if (prefillData.kboData?.kboNumber || prefillData.kboData?.vatNumber) return true
  if (prefillData.businessType?.id) return true
  if (prefillData.financials?.yearData && Object.keys(prefillData.financials.yearData).length > 0) {
    return true
  }
  if (
    prefillData.financials?.revenue != null &&
    Number.isFinite(Number(prefillData.financials.revenue))
  ) {
    return true
  }
  if (
    prefillData.financials?.ebitda != null &&
    Number.isFinite(Number(prefillData.financials.ebitda))
  ) {
    return true
  }
  return false
}

/** Reset the module-level bootstrap guard (call on logout) */
export function resetBootstrapGuard() {
  bootstrapCompletedGlobally = false
  lastGlobalResult = null
  lastGlobalContextKey = null
}

// ============================================================================
// Context Types
// ============================================================================

interface BootstrapContextValue {
  // State
  state: SessionBootstrapState
  isBootstrapping: boolean
  bootstrapError: string | null

  // Derived state for convenience
  identity: IdentityState
  report: ReportState
  prefillData: PrefillData
  ui: UIHints
  creditStatus?: SessionBootstrapState['creditStatus'] // Credit status from bootstrap state

  // Convenience booleans
  /** @deprecated Guest flow is no longer supported - always returns false */
  isGuest: boolean
  isAuthenticated: boolean
  /** Whether authentication is required (always true in auth-first architecture) */
  requiresAuth: boolean
  isAccountantFlow: boolean
  isNewReport: boolean
  isExistingReport: boolean
  hasPrefilledData: boolean

  // Actions
  refreshBootstrap: () => Promise<void>
  updateIdentity: (identity: Partial<IdentityState>) => void
  updateReport: (report: Partial<ReportState>) => void
  updatePrefillData: (prefillData: Partial<PrefillData>) => void
  updateUIHints: (ui: Partial<UIHints>) => void
}

// ============================================================================
// Context Creation
// ============================================================================

const BootstrapContext = createContext<BootstrapContextValue | null>(null)

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
  // ✅ WORLD CLASS: Detect if coming from Mercury to optimize loading flow
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
  const _contextReportIdRef = useRef(context?.reportId)

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

    // Guard 2 (module-level): bootstrap already completed in a previous mount
    if (bootstrapCompletedGlobally) {
      const cached =
        bootstrapService.getCachedResult(activeContext) || getScopedGlobalResult(activeContext)
      if (cached) {
        generalLogger.debug(
          '[BootstrapProvider] Module-level guard — hydrating scoped cache (no callbacks)',
          {
            reportId: activeContext.reportId?.substring(0, 30),
          }
        )
        bootstrapStartedRef.current = true
        bootstrapCompletedRef.current = true
        setState(cached)
        setIsBootstrapping(false)
        setBootstrapState(cached)
        return
      }

      generalLogger.debug('[BootstrapProvider] Ignoring stale module-level bootstrap cache', {
        requestedReportId: activeContext.reportId?.substring(0, 30),
        cachedReportId: lastGlobalResult?.report.reportId?.substring(0, 30),
      })
      bootstrapCompletedGlobally = false
      lastGlobalResult = null
      lastGlobalContextKey = null
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
      bootstrapStartedRef.current = true
      bootstrapCompletedRef.current = true
      rememberScopedGlobalResult(activeContext, cachedResult)
      setState(cachedResult)
      setIsBootstrapping(false)
      setBootstrapState(cachedResult)
      onBootstrapCompleteRef.current?.(cachedResult)
      return
    }

    // RELOAD LOOP FIX: Always wait for auth before bootstrap.
    // Previously we skipped this when isFromMercury (optimistic), which caused
    // bootstrap to run before auth validated cookies → 401 → redirect → loop.
    const authState = useAuthStore.getState()
    if (authState.loading || authState.isInitializing || authState.isRefreshing) {
      generalLogger.debug('[BootstrapProvider] Auth not settled — deferring bootstrap')
      bootstrapStartedRef.current = false
      return
    }

    const needsDelegatedContext = shouldWaitForMercuryClientContextBeforeBootstrap({
      sourceApp: activeContext.sourceApp,
      reportId: activeContext.reportId,
      clientId: activeContext.clientId,
      clientToken: activeContext.clientToken,
      mercuryPersonaMode: activeContext.mercuryPersonaMode,
      url: activeContext.url,
      hasClientTokenHint: !!activeContext.clientToken?.trim(),
    })
    if (needsDelegatedContext) {
      const ctx = useClientContext.getState()
      if (!ctx.isActingAsClient || !ctx.accountant || !ctx.relationshipId) {
        generalLogger.warn(
          '[BootstrapProvider] Delegated client context not ready — deferring Titan bootstrap',
          {
            reportId: activeContext.reportId?.substring(0, 30),
            hasClientId: !!activeContext.clientId?.trim(),
            authError: authState.error?.substring(0, 80),
          }
        )
        bootstrapStartedRef.current = false
        if (mountedRef.current) {
          setIsBootstrapping(false)
          const message = authState.error?.trim()
          if (message) setBootstrapError(message)
        }
        return
      }
    }

    bootstrapStartedRef.current = true
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

      // CRITICAL VALIDATION: Ensure bootstrap returned the correct reportId
      // If we requested a specific reportId and got a different one, that's a bug
      const requestedId = bootstrapContext.reportId?.trim()
      const returnedId = result.report.reportId?.trim()

      if (requestedId && requestedId !== returnedId) {
        // The "new" → UUID mint is the expected creation path; accept it.
        // Any other mismatch is a contract violation: Titan resolved a session
        // for a different report than the URL asks for. Silently swapping the
        // id (the previous behavior) labelled the wrong report's data as the
        // requested one — saves and edits then leaked across reports.
        // Fail loud so ValuationSessionManager can show the error / trigger
        // its stale-recovery redirect to /reports/new.
        const isExpectedMint = requestedId === 'new' && !!returnedId
        if (!isExpectedMint) {
          generalLogger.error(
            '[BootstrapProvider] Bootstrap returned different reportId than requested - aborting',
            {
              requested: requestedId.substring(0, 30),
              returned: returnedId?.substring(0, 30),
              mode: result.report.mode,
            }
          )
          throw new Error(
            `Report not available: requested ${requestedId.substring(0, 8)} but resolved ${returnedId?.substring(0, 8) ?? 'null'}. ` +
              `The report may not exist, you may not have access, or your session may be stale.`
          )
        }
        generalLogger.debug('[BootstrapProvider] New report minted by server', {
          minted: returnedId?.substring(0, 30),
        })
      }

      // ✅ CREDIT CHECK: Check if credits are insufficient
      // WORLD-CLASS: Only block NEW reports - existing reports should ALWAYS be viewable
      // Users must be able to view their completed valuations regardless of credit status
      const isExistingReport = result.report.mode === 'existing'

      if (result.creditStatus && !result.creditStatus.allowed && !isExistingReport) {
        const creditError =
          result.creditStatus.message || 'Insufficient credits to create valuation'
        onBootstrapErrorRef.current?.(creditError)

        generalLogger.error('[BootstrapProvider] Credit check failed - preventing new valuation', {
          message: creditError,
          upgradePath: result.creditStatus.upgrade_path,
          creditsRemaining: result.creditStatus.credits_remaining,
          reportMode: result.report.mode,
        })

        if (mountedRef.current) {
          setState(result)
          setBootstrapError(creditError)
        }
        bootstrapCompletedRef.current = true
        setBootstrapState(result)
        return
      }

      // Log if existing report viewed with insufficient credits (allowed, but noted)
      if (result.creditStatus && !result.creditStatus.allowed && isExistingReport) {
        generalLogger.debug(
          '[BootstrapProvider] Viewing existing report despite insufficient credits',
          {
            reportId: result.report.reportId.substring(0, 30),
            creditsRemaining: result.creditStatus.credits_remaining,
          }
        )
      }

      if (mountedRef.current) setState(result)
      bootstrapCompletedRef.current = true
      rememberScopedGlobalResult(bootstrapContext, result)

      // Bootstrap succeeded — clear the reload-loop circuit breaker so
      // future legitimate reloads aren't blocked.
      clearReloadCounter()

      // Sync with SessionInitializer for backward compatibility
      setBootstrapState(result)

      // WORLD-CLASS: Instant hydration from valuationPackage
      // If package is present, hydrate stores immediately for < 100ms render
      if (shouldHydrateBootstrapPackage(result.report, result.valuationPackage)) {
        const valuationPackage = result.valuationPackage
        if (valuationPackage) {
          try {
            const { SessionRestorationService } = await import(
              '../../services/session/SessionRestorationService'
            )
            SessionRestorationService.hydrateFromPackage(
              result.report.reportId,
              valuationPackage,
              result.ui.suggestedFlow || 'manual'
            )
            generalLogger.debug('[BootstrapProvider] WORLD-CLASS: Instant hydration complete', {
              reportId: result.report.reportId.substring(0, 30),
              hasHtmlReport: !!valuationPackage.htmlReport,
            })
          } catch (hydrationError) {
            generalLogger.warn(
              '[BootstrapProvider] Package hydration failed - triggering full restoration',
              {
                error:
                  hydrationError instanceof Error ? hydrationError.message : String(hydrationError),
              }
            )

            // FALLBACK: Trigger full session restoration when package hydration fails
            // This ensures data is loaded even if the fast path fails
            try {
              const { SessionRestorationService } = await import(
                '../../services/session/SessionRestorationService'
              )
              // Check if report has existing data that needs restoration
              if (result.report.hasExistingData) {
                generalLogger.debug(
                  '[BootstrapProvider] Marking report for fallback restoration...',
                  {
                    reportId: result.report.reportId.substring(0, 30),
                  }
                )
                // Mark for restoration so ManualLayout/ConversationalLayout know to restore
                SessionRestorationService.markForRestoration(result.report.reportId)
              }
            } catch (fallbackError) {
              generalLogger.error('[BootstrapProvider] Fallback restoration setup failed', {
                error:
                  fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
              })
            }
          }
        }
      } else if (result.report.mode === 'existing' && result.report.hasExistingData) {
        try {
          const { SessionRestorationService } = await import(
            '../../services/session/SessionRestorationService'
          )
          SessionRestorationService.markForRestoration(result.report.reportId)
          generalLogger.debug(
            '[BootstrapProvider] Deferred package hydration until explicit report readiness',
            {
              reportId: result.report.reportId.substring(0, 30),
              reportReady: result.report.reportReady,
              hasPackage: !!result.valuationPackage,
            }
          )
        } catch (fallbackError) {
          generalLogger.error('[BootstrapProvider] Failed to mark pending restoration', {
            error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
          })
        }
      }

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
      if (mountedRef.current) setIsBootstrapping(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContext, method, mountedRef])

  // Explicit retry: resets all guards and forces a fresh bootstrap call.
  // Used when bootstrap fails and the user/UI needs to retry.
  const forceRefreshBootstrap = useCallback(async () => {
    generalLogger.debug('[BootstrapProvider] Force refresh — resetting all guards')
    bootstrapStartedRef.current = false
    bootstrapCompletedRef.current = false
    bootstrapCompletedGlobally = false
    lastGlobalResult = null
    lastGlobalContextKey = null
    bootstrapService.clearCache()
    bootstrapService.resetCircuitBreaker()
    if (mountedRef.current) setBootstrapError(null)
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

  const mercuryClientContextReady = useClientContext((s) =>
    !needsMercuryClientContext
      ? true
      : !!(s.isActingAsClient && s.accountant && s.relationshipId)
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
    if (bootstrapCompletedGlobally) {
      if (bootstrapStartedRef.current) {
        return
      }

      const cached =
        bootstrapService.getCachedResult(activeContext) || getScopedGlobalResult(activeContext)
      if (cached) {
        bootstrapStartedRef.current = true
        bootstrapCompletedRef.current = true
        setState(cached)
        setIsBootstrapping(false)
        setBootstrapState(cached)
        return
      }

      generalLogger.debug('[BootstrapProvider] Global bootstrap cache missed current report', {
        requestedReportId: activeContext.reportId?.substring(0, 30),
        cachedReportId: lastGlobalResult?.report.reportId?.substring(0, 30),
      })
      bootstrapCompletedGlobally = false
      lastGlobalResult = null
      lastGlobalContextKey = null
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

      // Convenience booleans
      /** @deprecated Guest flow is no longer supported - always returns false */
      isGuest: false,
      isAuthenticated:
        state.identity.type === 'authenticated' || state.identity.type === 'accountant_for_client',
      requiresAuth: REQUIRE_AUTH_FOR_VALUATION,
      isAccountantFlow: state.identity.type === 'accountant_for_client',
      isNewReport: state.report.mode === 'new',
      isExistingReport: state.report.mode === 'existing',
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
// Hooks
// ============================================================================

/**
 * Use bootstrap context - throws if not within provider
 */
export function useBootstrap(): BootstrapContextValue {
  const context = useContext(BootstrapContext)
  if (!context) {
    throw new Error('useBootstrap must be used within a BootstrapProvider')
  }
  return context
}

/**
 * Use bootstrap context - returns null if not within provider (safe version)
 */
export function useBootstrapSafe(): BootstrapContextValue | null {
  return useContext(BootstrapContext)
}

/**
 * Use identity from bootstrap
 */
export function useBootstrapIdentity(): IdentityState {
  const { identity } = useBootstrap()
  return identity
}

/**
 * Use report from bootstrap
 */
export function useBootstrapReport(): ReportState {
  const { report } = useBootstrap()
  return report
}

/**
 * Use prefill data from bootstrap
 */
export function useBootstrapPrefill(): PrefillData {
  const { prefillData } = useBootstrap()
  return prefillData
}

/**
 * Use UI hints from bootstrap
 */
export function useBootstrapUI(): UIHints {
  const { ui } = useBootstrap()
  return ui
}

/**
 * Check if bootstrap is complete
 */
export function useIsBootstrapComplete(): boolean {
  const context = useBootstrapSafe()
  if (!context) return false
  return !context.isBootstrapping && !context.bootstrapError
}

// ============================================================================
// Default Export
// ============================================================================

export default BootstrapProvider
