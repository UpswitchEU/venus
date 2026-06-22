/**
 * Session Bootstrap Service
 *
 * Initialization service that resolves all state before UI renders.
 * Orchestrates parallel resolution of auth, session, and prefill data.
 *
 * Bank-grade session bootstrap:
 * - Single request for complete context
 * - Explicit error states (no silent fallbacks)
 * - Clear state machine transitions
 *
 * @module lib/bootstrap/SessionBootstrapService
 */

import { getIdentifierType, isUuid } from '../../utils/identifiers'
import { getInitTraceId } from '../auth'
import {
  buildMercuryDelegatedHandoffSignalsFromBootstrapContext,
  isDelegatedClientContextReadyForBootstrap,
  isDelegatedMercuryAccountantHandoff,
  shouldWaitForMercuryClientContextBeforeBootstrap,
} from '../mercury/sessionReadiness'
import { syncBootstrapClientContext } from './BootstrapClientContextSync'
import {
  isDelegatedBootstrapCacheAllowed,
  waitForBootstrapAuthReadiness,
} from './BootstrapReadinessGate'
import { recordBootstrapReportMode } from './bootstrapReportModeRegistry'
import {
  type ClientSideBootstrapOptions,
  executeClientSideBootstrapPipeline,
} from './ClientSideBootstrapPipeline'
import { getBootstrapContextCacheKey } from './contextCacheKey'
import { AuthenticationRequiredError, AuthResolver, authResolver } from './resolvers/AuthResolver'
import { PrefillResolver, prefillResolver } from './resolvers/PrefillResolver'
import { SessionResolver, sessionResolver } from './resolvers/SessionResolver'
import {
  buildBootstrapCircuitBreakerMessage,
  buildTitanBootstrapCacheKey,
  buildTitanBootstrapFailureError,
  getScopedBootstrapCachedResult,
  getTitanBootstrapFailureDiagnostic,
  hasCompletedBootstrapFor,
  pruneBootstrapCallTimestamps,
  shouldTripBootstrapCircuitBreaker,
} from './SessionBootstrapServiceModel'
import { fetchTitanBootstrapPayloadWithStructuredRetry } from './TitanBootstrapClient'
import {
  buildTitanBootstrapRequestPolicy,
  type TitanBootstrapClientContextSnapshot,
} from './TitanBootstrapRequestPolicy'
import {
  buildCreditBlockedTitanState,
  buildSuccessfulTitanState,
  type SuccessfulTitanBootstrapData,
} from './TitanBootstrapResponseMapper'
import type { BootstrapContext, SessionBootstrapState } from './types'
import { parseBootstrapHints, parseUrlToContext } from './utils'

/**
 * Source-contract sentinel: transport is implemented in `TitanBootstrapClient`,
 * but this public bootstrap boundary must continue treating 503/504 from Venus
 * BFF as terminal pool-pressure/timeouts. Client retry only applies when
 * response.status !== 503 and response.status !== 504;
 * response.status === 504 || response.status === 408 || response.status === 503 maps to
 * BOOTSTRAP_TIMEOUT_USER_MESSAGE. AbortError also maps to
 * BOOTSTRAP_TIMEOUT_USER_MESSAGE, and malformed bodies still throw
 * "Invalid response from bootstrap service".
 */
type BootstrapOptions = ClientSideBootstrapOptions

const DEFAULT_OPTIONS: BootstrapOptions = {
  timeout: 10000, // Reduced from 15s - auth wait optimization makes this safer
  skipAuth: false,
  useCache: true,
}

export class SessionBootstrapService {
  private readonly logger = console
  private readonly authResolver: AuthResolver
  private readonly sessionResolver: SessionResolver
  private readonly prefillResolver: PrefillResolver

  // In-flight bootstrap cache to prevent duplicate requests
  private bootstrapPromiseCache: Map<string, Promise<SessionBootstrapState>> = new Map()
  private bootstrapAbortControllers: Set<AbortController> = new Set()
  private responseAbortControllers: WeakMap<Response, AbortController> = new WeakMap()
  private bootstrapCancellationEpoch = 0

  // Sliding-window rate limiter: allows legitimate calls (SPA navigations)
  // but blocks rapid-fire calls from remount loops.
  // If MAX_CALLS_IN_WINDOW calls happen within WINDOW_MS, the breaker trips.
  private static readonly MAX_CALLS_IN_WINDOW = 4
  private static readonly CIRCUIT_BREAKER_WINDOW_MS = 30_000
  private callTimestamps: number[] = []

  // Result cache: returns cached result for repeated calls within the cooldown window.
  // This survives component remounts because the service is a module-level singleton.
  private static readonly RESULT_CACHE_TTL_MS = 10_000
  private lastSuccessfulResult: SessionBootstrapState | null = null
  private lastSuccessfulAt = 0
  private lastSuccessfulCacheKey: string | null = null

  constructor(
    authResolver?: AuthResolver,
    sessionResolver?: SessionResolver,
    prefillResolver?: PrefillResolver
  ) {
    this.authResolver = authResolver || new AuthResolver()
    this.sessionResolver = sessionResolver || new SessionResolver()
    this.prefillResolver = prefillResolver || new PrefillResolver()
  }

  private rememberSuccessfulBootstrapResult(
    result: SessionBootstrapState,
    cacheKey: string
  ): SessionBootstrapState {
    this.lastSuccessfulResult = result
    this.lastSuccessfulAt = Date.now()
    this.lastSuccessfulCacheKey = cacheKey
    recordBootstrapReportMode(result.report.reportId, result.report.mode)
    return result
  }

  /**
   * Main bootstrap entry point
   *
   * Resolves ALL state needed for UI rendering in a single orchestrated call.
   * Uses parallel resolution where possible for performance.
   */
  async bootstrap(
    context: BootstrapContext,
    options: BootstrapOptions = {}
  ): Promise<SessionBootstrapState> {
    const cacheKey = this.getCacheKey(context)

    // Guard 1: Sliding-window circuit breaker (shared with bootstrapViaTitan)
    const now = Date.now()
    this.callTimestamps = pruneBootstrapCallTimestamps(
      this.callTimestamps,
      now,
      SessionBootstrapService.CIRCUIT_BREAKER_WINDOW_MS
    )
    if (
      shouldTripBootstrapCircuitBreaker(
        this.callTimestamps,
        SessionBootstrapService.MAX_CALLS_IN_WINDOW
      )
    ) {
      const cachedResult = this.getCachedResult(context)
      if (cachedResult && (await isDelegatedBootstrapCacheAllowed(context))) {
        recordBootstrapReportMode(cachedResult.report.reportId, cachedResult.report.mode)
        return cachedResult
      }
      throw new Error('[Bootstrap] Circuit breaker tripped (client-side path)')
    }

    // Guard 2: Result cache
    if (this.hasCompletedFor(context)) {
      if (this.lastSuccessfulResult && (await isDelegatedBootstrapCacheAllowed(context))) {
        recordBootstrapReportMode(
          this.lastSuccessfulResult.report.reportId,
          this.lastSuccessfulResult.report.mode
        )
        return this.lastSuccessfulResult
      }
    }

    const opts = { ...DEFAULT_OPTIONS, ...options }
    const startTime = performance.now()

    // Guard 3: In-flight dedup (only while delegated gate still matches the URL)
    const inflight = this.bootstrapPromiseCache.get(cacheKey)
    if (inflight && opts.useCache && (await isDelegatedBootstrapCacheAllowed(context))) {
      this.logger.info('[Bootstrap] Returning in-flight request')
      return inflight
    }
    if (inflight) {
      this.bootstrapPromiseCache.delete(cacheKey)
    }

    this.callTimestamps.push(now)
    const bootstrapPromise = executeClientSideBootstrapPipeline({
      authResolver: this.authResolver,
      context,
      logger: this.logger,
      options: opts,
      prefillResolver: this.prefillResolver,
      sessionResolver: this.sessionResolver,
      startTime,
    })
    this.bootstrapPromiseCache.set(cacheKey, bootstrapPromise)

    try {
      const result = await bootstrapPromise
      return this.rememberSuccessfulBootstrapResult(result, cacheKey)
    } finally {
      this.bootstrapPromiseCache.delete(cacheKey)
    }
  }

  /**
   * Bootstrap from URL string (convenience method)
   */
  async bootstrapFromUrl(
    url: string,
    cookies?: string,
    options?: BootstrapOptions
  ): Promise<SessionBootstrapState> {
    const context = parseUrlToContext(url, cookies)
    return this.bootstrap(context, options)
  }

  /**
   * Generate a context-aware cache key for deduplication.
   *
   * IMPORTANT: Do NOT include clientToken, cookies, or the raw URL. Auth may
   * sanitize clientToken after the first call, cookies are volatile, and the URL
   * can contain non-semantic cache-busting params. The explicit context fields
   * below are the stable inputs that can alter bootstrap output.
   */
  private getCacheKey(context: BootstrapContext): string {
    return getBootstrapContextCacheKey(context)
  }

  /**
   * Check if a successful bootstrap result is cached for the given context.
   * Used by BootstrapProvider to avoid re-triggering bootstrap after remounts.
   */
  hasCompletedFor(contextOrReportId: BootstrapContext | string | undefined): boolean {
    return hasCompletedBootstrapFor({
      contextOrReportId,
      lastSuccessfulAt: this.lastSuccessfulAt,
      lastSuccessfulCacheKey: this.lastSuccessfulCacheKey,
      lastSuccessfulResult: this.lastSuccessfulResult,
      now: Date.now(),
      scopeProvided: true,
      ttlMs: SessionBootstrapService.RESULT_CACHE_TTL_MS,
    })
  }

  /**
   * Invalidate the result cache. Called by BootstrapProvider.refreshBootstrap
   * to allow a forced re-fetch.
   */
  clearCache(): void {
    this.lastSuccessfulResult = null
    this.lastSuccessfulAt = 0
    this.lastSuccessfulCacheKey = null
  }

  /** Drop in-flight bootstrap promises (e.g. after deleting the active report). */
  clearInflightCache(): void {
    this.bootstrapCancellationEpoch += 1
    for (const controller of this.bootstrapAbortControllers) {
      controller.abort()
    }
    this.bootstrapAbortControllers.clear()
    this.bootstrapPromiseCache.clear()
  }

  /**
   * Reset the circuit breaker. Only for explicit user-triggered retry —
   * never call this from automated code paths.
   */
  resetCircuitBreaker(): void {
    this.callTimestamps = []
  }

  /**
   * Return the cached result if available and still fresh, or null.
   * When a reportId is provided, the cache is scoped to that requested report
   * so a rapid SPA navigation cannot hydrate another report's payload.
   */
  getCachedResult(contextOrReportId?: BootstrapContext | string): SessionBootstrapState | null {
    return getScopedBootstrapCachedResult({
      contextOrReportId,
      lastSuccessfulAt: this.lastSuccessfulAt,
      lastSuccessfulCacheKey: this.lastSuccessfulCacheKey,
      lastSuccessfulResult: this.lastSuccessfulResult,
      now: Date.now(),
      scopeProvided: arguments.length > 0,
      ttlMs: SessionBootstrapService.RESULT_CACHE_TTL_MS,
    })
  }

  /**
   * Bootstrap via Titan API endpoint (single-request optimization).
   *
   * This method uses the Titan bootstrap endpoint which performs all
   * resolution server-side, reducing network round-trips.
   */
  async bootstrapViaTitan(
    context: BootstrapContext,
    options: BootstrapOptions = {}
  ): Promise<SessionBootstrapState> {
    // Full ID for cache matching; truncated only for log readability
    const cacheKey = this.getCacheKey(context)
    const logReportId = context.reportId?.substring(0, 30) || 'new'
    const hints = parseBootstrapHints(context)

    // Guard 1: Sliding-window circuit breaker — blocks rapid-fire calls
    const now = Date.now()
    this.callTimestamps = pruneBootstrapCallTimestamps(
      this.callTimestamps,
      now,
      SessionBootstrapService.CIRCUIT_BREAKER_WINDOW_MS
    )
    if (
      shouldTripBootstrapCircuitBreaker(
        this.callTimestamps,
        SessionBootstrapService.MAX_CALLS_IN_WINDOW
      )
    ) {
      const msg = buildBootstrapCircuitBreakerMessage(
        this.callTimestamps.length,
        SessionBootstrapService.CIRCUIT_BREAKER_WINDOW_MS
      )
      this.logger.error(msg)
      const cachedResult = this.getCachedResult(context)
      if (cachedResult && (await isDelegatedBootstrapCacheAllowed(context, hints.hasClientToken))) {
        this.logger.info('[Bootstrap] Returning scoped cached result from circuit breaker')
        recordBootstrapReportMode(cachedResult.report.reportId, cachedResult.report.mode)
        return cachedResult
      }
      throw new Error(msg)
    }

    // Guard 2: Result cache — return cached result if fresh
    if (this.hasCompletedFor(context)) {
      if (
        this.lastSuccessfulResult &&
        (await isDelegatedBootstrapCacheAllowed(context, hints.hasClientToken))
      ) {
        this.logger.info(
          `[Bootstrap] Returning cached result for ${logReportId} (age: ${Date.now() - this.lastSuccessfulAt}ms)`
        )
        recordBootstrapReportMode(
          this.lastSuccessfulResult.report.reportId,
          this.lastSuccessfulResult.report.mode
        )
        return this.lastSuccessfulResult
      }
    }

    const titanCacheKey = buildTitanBootstrapCacheKey(cacheKey)

    // Guard 3: Dedup in-flight request (only while delegated gate still matches the URL)
    const inflight = this.bootstrapPromiseCache.get(titanCacheKey)
    if (inflight && (await isDelegatedBootstrapCacheAllowed(context, hints.hasClientToken))) {
      this.logger.info('[Bootstrap] Returning in-flight Titan request (dedup)')
      return inflight
    }
    if (inflight) {
      this.bootstrapPromiseCache.delete(titanCacheKey)
    }

    const promise = this._executeBootstrapViaTitan(context, options)
    this.bootstrapPromiseCache.set(titanCacheKey, promise)

    try {
      const result = await promise
      return this.rememberSuccessfulBootstrapResult(result, cacheKey)
    } finally {
      this.bootstrapPromiseCache.delete(titanCacheKey)
    }
  }

  private async _executeBootstrapViaTitan(
    context: BootstrapContext,
    options: BootstrapOptions = {}
  ): Promise<SessionBootstrapState> {
    const startTime = performance.now()
    const hints = parseBootstrapHints(context)
    const traceId = getInitTraceId() || 'unknown'

    this.callTimestamps.push(Date.now())
    this.logger.info(
      `[Bootstrap:${traceId}] Starting Titan API bootstrap (${this.callTimestamps.length} calls in window)`,
      {
        reportId: context.reportId?.substring(0, 30) || 'new',
        hasClientToken: hints.hasClientToken,
      }
    )

    try {
      // When clientToken present, wait for client context exchange to complete (up to 5s)
      // Otherwise wait up to 2.5s for cookie-based auth (auth/me → 401 → refresh → retry can take ~1–2s)
      //
      // MERCURY DELEGATED FLOW: Wait for get-client-context / AuthGate fallback before Titan POST
      // when the URL carries advisor delegation signals (clientId, clientToken, or
      // mode=accountant on an existing report). Owner Mercury opens without those signals
      // must not block on isActingAsClient (was adding ~0–3s dead-air).
      const needsClientContext = shouldWaitForMercuryClientContextBeforeBootstrap({
        sourceApp: context.sourceApp,
        reportId: context.reportId,
        clientId: context.clientId,
        clientToken: context.clientToken,
        mercuryPersonaMode: context.mercuryPersonaMode,
        url: context.url,
        hasClientTokenHint: hints.hasClientToken,
      })

      const delegatedHandoff = isDelegatedMercuryAccountantHandoff(
        buildMercuryDelegatedHandoffSignalsFromBootstrapContext(context)
      )

      if (needsClientContext) {
        this.logger.info(
          `[Bootstrap:${traceId}] Mercury delegated flow — waiting for client context`,
          {
            reportId: context.reportId?.substring(0, 30),
            hasClientId: !!context.clientId?.trim(),
            hasClientToken: !!context.clientToken?.trim(),
            mercuryPersonaMode: context.mercuryPersonaMode,
            delegatedHandoff,
          }
        )
      }

      const authWaitStart = performance.now()
      const authReady = await waitForBootstrapAuthReadiness({
        maxWaitMs: 2500,
        needsClientContext,
        urlClientId: context.clientId,
      })
      const authWaitMs = Math.round(performance.now() - authWaitStart)
      this.logger.info(`[Bootstrap:${traceId}] Auth wait complete`, {
        durationMs: authWaitMs,
        ready: authReady,
        needsClientContext,
      })
      if (!authReady) {
        if (needsClientContext) {
          const { useAuthStore } = await import('../auth')
          const authState = useAuthStore.getState()
          const message =
            authState.error?.trim() ||
            'Delegated client context was not ready before valuation bootstrap'
          this.logger.error(
            `[Bootstrap:${traceId}] Aborting Titan bootstrap — delegated context required`,
            { durationMs: authWaitMs, hasClientId: !!context.clientId?.trim() }
          )
          throw new Error(message)
        }
        this.logger.warn(`[Bootstrap:${traceId}] Auth not ready after timeout, proceeding anyway`)
      }

      if (needsClientContext) {
        const { useClientContext } = await import('../../stores/clientContext')
        const ctx = useClientContext.getState()
        if (
          !isDelegatedClientContextReadyForBootstrap({
            needsMercuryClientContext: true,
            contextGateResolved: ctx.contextGateResolved,
            clientId: context.clientId,
            isActingAsClient: ctx.isActingAsClient,
            accountantId: ctx.accountant?.id ?? null,
            relationshipId: ctx.relationshipId,
          })
        ) {
          const { useAuthStore } = await import('../auth')
          const message =
            useAuthStore.getState().error?.trim() ||
            'Delegated client context does not match the requested client'
          this.logger.error(
            `[Bootstrap:${traceId}] Aborting Titan bootstrap — delegated context mismatch`,
            {
              urlClientId: context.clientId?.substring(0, 8) ?? null,
              storedRelationshipId: ctx.relationshipId?.substring(0, 8) ?? null,
            }
          )
          throw new Error(message)
        }
      }

      let clientContextSnapshot: TitanBootstrapClientContextSnapshot | null = null
      try {
        const { useClientContext } = await import('../../stores/clientContext')
        const contextState = useClientContext.getState()
        clientContextSnapshot = {
          contextHeaders: contextState.getContextHeaders(),
          relationshipId: contextState.relationshipId,
        }
      } catch (error) {
        this.logger.warn('[Bootstrap] Failed to get client context headers (non-critical)', {
          error: error instanceof Error ? error.message : String(error),
        })
      }

      const titanRequest = buildTitanBootstrapRequestPolicy({
        context,
        clientContext: clientContextSnapshot,
        hasClientTokenHint: hints.hasClientToken,
        traceId,
      })

      if (titanRequest.invalidMode) {
        this.logger.warn('[Bootstrap] Filtered out invalid mode value', {
          invalidMode: titanRequest.invalidMode,
          note: 'Only "edit" or "view" are valid - mode will be omitted from request',
        })
      }

      this.logger.info('[Bootstrap] Sending to Titan API', {
        reportIdFromContext: context.reportId?.substring(0, 30) || 'none',
        reportIdInRequest: titanRequest.validReportId?.substring(0, 30) || 'none',
        reportIdLength: titanRequest.validReportId?.length || 0,
      })

      if (titanRequest.clientContextStatus === 'delegated') {
        this.logger.info('[Bootstrap] Added delegated client context headers from store', {
          headerCount: titanRequest.contextHeaderKeys.length,
          hasClientUserId: titanRequest.hasClientUserId,
          hasClientToken: hints.hasClientToken || !!context.clientToken,
          partialDelegated: titanRequest.partialDelegated,
        })
      } else if (titanRequest.clientContextStatus === 'incomplete') {
        this.logger.warn(
          '[Bootstrap] Incomplete client context in store - cannot send delegated headers',
          {
            hasClientUserId: titanRequest.hasClientUserId,
            hasAccountantUserId: titanRequest.hasAccountantUserId,
            hasRelationshipId: titanRequest.hasRelationshipId,
          }
        )
      } else if (titanRequest.clientContextStatus === 'missing-token-context') {
        this.logger.warn('[Bootstrap] Client token present but client context not in store', {
          note: 'AuthGate should have ensured context is ready before bootstrap',
        })
      }

      this.logger.info(`[Bootstrap:${traceId}] Pre-request diagnostic`, {
        hasClientContextHeaders: titanRequest.hasClientContextHeaders,
        authReady,
        authWaitMs,
        headerKeys: titanRequest.contextHeaderKeys,
      })

      // Make request (proxy handles 401 refresh; no client-side retry on 401).
      const { data, responseStatus } = await fetchTitanBootstrapPayloadWithStructuredRetry({
        bootstrapAbortControllers: this.bootstrapAbortControllers,
        getCancellationEpoch: () => this.bootstrapCancellationEpoch,
        logger: this.logger,
        responseAbortControllers: this.responseAbortControllers,
        requestBody: titanRequest.requestBody,
        headers: titanRequest.headers,
        traceId,
        startTime,
      })

      // DIAGNOSTIC (dev only): Log bootstrap response for accountant + clientToken flow
      if (hints.hasClientToken) {
        this.logger.info(`[Bootstrap:${traceId}] Accountant flow response`, {
          status: responseStatus,
          success: data.success,
          reportMode: data.data?.report?.mode,
          reportId: data.data?.report?.reportId?.substring(0, 30),
          identityType: data.data?.identity?.type,
          hasExistingData: data.data?.report?.hasExistingData,
        })
      }

      // ✅ STRUCTURED ERROR HANDLING: Check errorInfo for smarter error handling
      if (!data.success) {
        const diagnostic = getTitanBootstrapFailureDiagnostic(data)
        if (diagnostic) {
          this.logger.warn(`[Bootstrap:${traceId}] Received structured error`, diagnostic)
        }

        // Check if this is a credit error (allow viewing with limited data)
        if (data.data?.creditStatus && !data.data.creditStatus.allowed) {
          return buildCreditBlockedTitanState(data.data, context, startTime)
        }

        throw buildTitanBootstrapFailureError(data)
      }

      if (!data.data) {
        throw new Error('Bootstrap returned no data')
      }

      const valuationPackage = data.data.valuationPackage
      const state = buildSuccessfulTitanState(
        data.data as SuccessfulTitanBootstrapData,
        context,
        startTime,
        data.bootstrapDurationMs
      )
      this.assertExistingReportWasNotDowngraded(context, state, traceId)

      const totalMs = Math.round(performance.now() - startTime)
      this.logger.info(`[Bootstrap:${traceId}] Titan bootstrap complete`, {
        durationMs: totalMs,
        reportMode: state.report.mode,
        identityType: state.identity.type,
      })

      // WORLD-CLASS: Log valuationPackage presence for debugging
      if (valuationPackage) {
        this.logger.info(`[Bootstrap:${traceId}] Received valuationPackage`, {
          hasHtmlReport: !!valuationPackage.htmlReport,
          hasPricing: !!valuationPackage.pricingRange,
          versionCount: valuationPackage.versions?.total,
          pdfStatus: valuationPackage.pdf?.status,
          hasBuyerReadiness: !!valuationPackage.buyerReadiness,
        })
      }

      this.logger.info(`[Bootstrap:${traceId}] Titan API bootstrap complete`, {
        durationMs: state.bootstrapDurationMs,
        identityType: state.identity.type,
        reportMode: state.report.mode,
      })

      // Sync client context from bootstrap response to prevent stale context issues
      await syncBootstrapClientContext(state.identity, this.logger)

      return state
    } catch (error) {
      // Propagate errors — no silent fallback to client-side bootstrap.
      // Falling back would make a separate set of API calls that compound
      // the load on Titan without improving the outcome.
      if (error instanceof AuthenticationRequiredError) {
        throw error
      }
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('[Bootstrap] Titan API bootstrap failed', { error: errorMessage })
      throw error
    }
  }

  private assertExistingReportWasNotDowngraded(
    context: BootstrapContext,
    state: SessionBootstrapState,
    traceId: string
  ): void {
    const requestedReportId = context.reportId?.trim()
    if (!requestedReportId || !isUuid(requestedReportId) || state.report.mode !== 'new') {
      return
    }

    this.logger.error(`[Bootstrap:${traceId}] Expected existing report but got mode=new`, {
      reportId: requestedReportId.substring(0, 30),
      returnedReportId: state.report.reportId?.substring(0, 30),
      identifierType: getIdentifierType(requestedReportId),
    })

    throw new Error(
      `Report ${requestedReportId.substring(0, 8)} was expected to exist, but bootstrap returned a new draft. ` +
        'The report may not exist, you may not have access, or the bootstrap cache is stale.'
    )
  }
}

// Export singleton instance for convenience
export const bootstrapService = new SessionBootstrapService(
  authResolver,
  sessionResolver,
  prefillResolver
)
