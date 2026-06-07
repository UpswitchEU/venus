/**
 * Session Bootstrap Service
 *
 * World-class initialization service that resolves ALL state before UI renders.
 * Orchestrates parallel resolution of auth, session, and prefill data.
 *
 * Bank-grade session bootstrap:
 * - Single request for complete context
 * - Explicit error states (no silent fallbacks)
 * - Clear state machine transitions
 *
 * @module lib/bootstrap/SessionBootstrapService
 */

import { getMercuryUrl } from '../../utils/getMercuryUrl'
import { getIdentifierType, isUuid, looksLikeExistingReportId } from '../../utils/identifiers'
import { getInitTraceId } from '../auth'
import {
  buildMercuryDelegatedHandoffSignalsFromBootstrapContext,
  isDelegatedMercuryAccountantHandoff,
  shouldWaitForMercuryClientContextBeforeBootstrap,
} from '../mercury/sessionReadiness'
import { VENUS_BOOTSTRAP_CLIENT_ABORT_MS } from './bootstrapProxyTimeouts'
import { recordBootstrapReportMode } from './bootstrapReportModeRegistry'
import { BOOTSTRAP_TIMEOUT_USER_MESSAGE } from './bootstrapUserMessages'
import { getBootstrapCacheLookupKey, getBootstrapContextCacheKey } from './contextCacheKey'
import { AuthenticationRequiredError, AuthResolver, authResolver } from './resolvers/AuthResolver'
import { PrefillResolver, prefillResolver } from './resolvers/PrefillResolver'
import { SessionResolver, sessionResolver } from './resolvers/SessionResolver'
import {
  buildCreditBlockedTitanState,
  buildSuccessfulTitanState,
  type SuccessfulTitanBootstrapData,
  type TitanBootstrapResponsePayload,
} from './TitanBootstrapResponseMapper'
import type {
  BootstrapContext,
  BootstrapErrorInfo,
  BootstrapHints,
  FlowType,
  IdentityState,
  PrefillData,
  ReportState,
  SessionBootstrapState,
  UIHints,
} from './types'
import {
  BOOTSTRAP_ERROR_CODES,
  BOOTSTRAP_VERSION,
  DEFAULT_BOOTSTRAP_STATE,
  DEFAULT_IDENTITY,
  DEFAULT_PREFILL,
  DEFAULT_REPORT,
  DEFAULT_UI_HINTS,
} from './types'
import { generateReportId, parseBootstrapHints, parseUrlToContext, truncateForLog } from './utils'

interface BootstrapOptions {
  /** Timeout for bootstrap process in ms */
  timeout?: number
  /** Skip auth resolution (for server-side where cookies aren't available) */
  skipAuth?: boolean
  /** Use cached bootstrap if available */
  useCache?: boolean
}

interface TitanBootstrapFetchResult {
  data: TitanBootstrapResponsePayload
  responseStatus: number
}

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

  private static readonly STRUCTURED_ERROR_MAX_RETRIES = 1
  private static readonly STRUCTURED_ERROR_RETRY_BASE_DELAY_MS = 400

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
   * Sync client context from bootstrap response to Zustand store
   *
   * This ensures the useClientContext store always has the correct context
   * from the authoritative bootstrap response, preventing stale localStorage data
   * from causing access issues on subsequent requests.
   */
  private async syncClientContext(identity: IdentityState): Promise<void> {
    try {
      const { useClientContext } = await import('../../stores/clientContext')
      const contextStore = useClientContext.getState()

      if (identity.type === 'accountant_for_client' && identity.clientContext) {
        // Accountant-for-client flow: Update store with bootstrap context
        // Transform bootstrap ClientContext to ClientContextResponseDto format
        const bootstrapContext = identity.clientContext

        // Check if context is different from stored context
        const storedClientId = contextStore.client?.id
        const storedRelationshipId = contextStore.relationshipId

        if (
          (storedClientId ?? null) !== (bootstrapContext.clientUserId ?? null) ||
          storedRelationshipId !== bootstrapContext.relationshipId
        ) {
          this.logger.info('[Bootstrap] Syncing client context from bootstrap response', {
            oldClientId: storedClientId?.substring(0, 8) || 'none',
            newClientId: bootstrapContext.clientUserId?.substring(0, 8) ?? 'null',
            oldRelationshipId: storedRelationshipId?.substring(0, 8) || 'none',
            newRelationshipId: bootstrapContext.relationshipId.substring(0, 8),
          })

          const clientUserId = bootstrapContext.clientUserId
          contextStore.setClientContext({
            accountantUser: {
              id: bootstrapContext.accountantUserId,
              email: bootstrapContext.accountantEmail || '',
              full_name: '',
            },
            clientUser: clientUserId
              ? {
                  id: clientUserId,
                  email: bootstrapContext.clientEmail || '',
                  full_name: bootstrapContext.clientCompanyName || '',
                  avatar_url: null,
                }
              : null,
            relationship: {
              id: bootstrapContext.relationshipId,
              customer_name: bootstrapContext.clientCompanyName || '',
            },
          })
        }
      } else if (identity.type === 'authenticated' && contextStore.isActingAsClient) {
        // Direct authenticated flow but store has stale client context
        // This can happen when accountant switches back to their own account
        // but localStorage still has old client context
        this.logger.warn('[Bootstrap] Clearing stale client context', {
          storedClientId: contextStore.client?.id?.substring(0, 8) || 'none',
          identityType: identity.type,
          note: 'Bootstrap returned authenticated identity but store had client context',
        })

        contextStore.clearClientContext()
      }
    } catch (error) {
      // Non-critical - log but don't fail bootstrap
      this.logger.warn('[Bootstrap] Failed to sync client context (non-critical)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
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
    this.callTimestamps = this.callTimestamps.filter(
      (t) => now - t < SessionBootstrapService.CIRCUIT_BREAKER_WINDOW_MS
    )
    if (this.callTimestamps.length >= SessionBootstrapService.MAX_CALLS_IN_WINDOW) {
      const cachedResult = this.getCachedResult(context)
      if (cachedResult) {
        recordBootstrapReportMode(cachedResult.report.reportId, cachedResult.report.mode)
        return cachedResult
      }
      throw new Error('[Bootstrap] Circuit breaker tripped (client-side path)')
    }

    // Guard 2: Result cache
    if (this.hasCompletedFor(context)) {
      if (this.lastSuccessfulResult) {
        recordBootstrapReportMode(
          this.lastSuccessfulResult.report.reportId,
          this.lastSuccessfulResult.report.mode
        )
        return this.lastSuccessfulResult
      }
    }

    const opts = { ...DEFAULT_OPTIONS, ...options }
    const startTime = performance.now()

    // Guard 3: In-flight dedup
    const inflight = this.bootstrapPromiseCache.get(cacheKey)
    if (inflight && opts.useCache) {
      this.logger.info('[Bootstrap] Returning in-flight request')
      return inflight
    }

    this.callTimestamps.push(now)
    const bootstrapPromise = this.executeBootstrap(context, opts, startTime)
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
   * Execute the bootstrap process
   */
  private async executeBootstrap(
    context: BootstrapContext,
    options: BootstrapOptions,
    startTime: number
  ): Promise<SessionBootstrapState> {
    const hints = parseBootstrapHints(context)

    this.logger.info('[Bootstrap] Starting bootstrap', {
      reportId: context.reportId ? truncateForLog(context.reportId) : 'new',
      hasClientToken: hints.hasClientToken,
      isEmbedded: hints.isEmbedded,
    })

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Bootstrap timeout')), options.timeout)
      })

      // Execute bootstrap with timeout
      const result = await Promise.race([
        this.resolveAllState(context, hints, options),
        timeoutPromise,
      ])

      const durationMs = performance.now() - startTime

      this.logger.info('[Bootstrap] Bootstrap complete', {
        durationMs: Math.round(durationMs),
        identityType: result.identity.type,
        reportMode: result.report.mode,
        prefillConfidence: result.prefillData.confidence.toFixed(2),
        prefilledFields: result.prefillData.fieldsPopulated.length,
      })

      return {
        ...result,
        bootstrapDurationMs: durationMs,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.logger.error('[Bootstrap] Bootstrap failed:', errorMessage)

      // Return graceful fallback
      return this.buildFallbackState(context, hints, startTime, errorMessage)
    }
  }

  /**
   * Resolve all state components
   */
  private async resolveAllState(
    context: BootstrapContext,
    hints: BootstrapHints,
    options: BootstrapOptions
  ): Promise<SessionBootstrapState> {
    const phaseStart = performance.now()

    // Phase 1: Resolve identity (required for other resolutions)
    let identity: IdentityState
    if (options.skipAuth) {
      identity = DEFAULT_IDENTITY
    } else {
      const authResult = await this.authResolver.resolve(context, hints)
      identity = authResult.data
    }
    const phase1Ms = Math.round(performance.now() - phaseStart)
    this.logger.info('[Bootstrap] Phase 1 (auth) complete', { durationMs: phase1Ms })

    // Phase 2: Parallel resolution of session and prefill
    const phase2Start = performance.now()
    const [sessionResult, prefillResult] = await Promise.all([
      this.sessionResolver.resolve(context, hints, identity),
      this.prefillResolver.resolve(context, hints, identity),
    ])
    const phase2Ms = Math.round(performance.now() - phase2Start)
    this.logger.info('[Bootstrap] Phase 2 (session+prefill) complete', { durationMs: phase2Ms })

    const report = sessionResult.data
    const prefillData = prefillResult.data

    // Phase 3: Build UI hints
    const ui = this.buildUIHints(context, hints, identity, report, prefillData)
    const totalMs = Math.round(performance.now() - phaseStart)
    this.logger.info('[Bootstrap] Phase 3 (ui hints) complete', { totalDurationMs: totalMs })

    return {
      identity,
      report,
      prefillData,
      ui,
      bootstrapVersion: BOOTSTRAP_VERSION,
      bootstrappedAt: new Date(),
      bootstrapDurationMs: 0, // Will be set by caller
    }
  }

  /**
   * Build UI hints based on resolved state
   */
  private buildUIHints(
    context: BootstrapContext,
    hints: BootstrapHints,
    identity: IdentityState,
    report: ReportState,
    prefillData: PrefillData
  ): UIHints {
    // Determine suggested flow
    let suggestedFlow: FlowType = 'manual'
    if (hints.requestedFlow) {
      suggestedFlow = hints.requestedFlow
    } else if (prefillData.confidence < 0.3) {
      // Low confidence = conversational might help gather more data
      suggestedFlow = 'conversational'
    }

    return {
      showWelcomeBack: report.mode === 'existing' && report.hasExistingData,
      resumableSession: report.mode === 'existing' && report.status === 'active',
      suggestedFlow,
      prefilledFieldCount: prefillData.fieldsPopulated.length,
      totalFieldCount: prefillData.fieldsPopulated.length + prefillData.fieldsRemaining.length,
      showKboVerification: !!prefillData.kboData && prefillData.sources.includes('kbo'),
      showAccountantBanner: identity.type === 'accountant_for_client',
      returnUrl: context.returnUrl,
      sourceApp: context.sourceApp,
    }
  }

  /**
   * Build fallback state for graceful degradation
   */
  private buildFallbackState(
    context: BootstrapContext,
    hints: BootstrapHints,
    startTime: number,
    error?: string
  ): SessionBootstrapState {
    const reportId = context.reportId || generateReportId()

    return {
      identity: {
        ...DEFAULT_IDENTITY,
      },
      report: {
        ...DEFAULT_REPORT,
        reportId,
        mode: hints.hasReportId ? 'existing' : 'new',
      },
      prefillData: DEFAULT_PREFILL,
      ui: {
        ...DEFAULT_UI_HINTS,
        suggestedFlow: hints.requestedFlow || 'manual',
      },
      bootstrapVersion: BOOTSTRAP_VERSION,
      bootstrappedAt: new Date(),
      bootstrapDurationMs: performance.now() - startTime,
    }
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
   * Wait for auth to be ready before making bootstrap API call
   *
   * PERFORMANCE OPTIMIZATION:
   * - Skip wait if auth already loaded
   * - When clientToken present: wait for isInitializing=false AND isActingAsClient (client context in store)
   * - Otherwise: maxWaitMs for cookie-based auth (auth/me → 401 → refresh → retry can take ~1–2s)
   */
  private async waitForAuth(maxWaitMs: number, needsClientContext?: boolean): Promise<boolean> {
    const { useAuthStore } = await import('../auth')
    const { useClientContext } = await import('../../stores/clientContext')
    const start = Date.now()
    // When clientToken/needs-context present, client context exchange must complete.
    // 3000ms is enough headroom: get-client-context is a single round-trip that
    // typically completes in 500–2000ms. The previous 5000ms cap routinely added
    // dead-air on Mercury→Venus accountant opens when context arrived in <1s.
    const effectiveMaxWait = needsClientContext ? 3000 : maxWaitMs

    const isAuthAndContextReady = (): boolean => {
      const authState = useAuthStore.getState()
      // Require user (not just error) - bootstrap needs valid auth; error means unauthenticated
      // RELOAD LOOP FIX: Also wait for !isRefreshing so we don't bootstrap with stale/null user
      const authReady =
        !authState.loading &&
        !authState.isInitializing &&
        !authState.isRefreshing &&
        !!authState.user
      if (!authReady) return false
      // Delegated flow: require full client context (matches BootstrapProvider gate).
      if (needsClientContext) {
        const ctx = useClientContext.getState()
        if (!ctx.isActingAsClient || !ctx.accountant || !ctx.relationshipId) {
          return false
        }
      }
      return true
    }

    // OPTIMIZATION: Check if auth and context are already ready (common case)
    if (isAuthAndContextReady()) {
      return true
    }

    // Poll until auth and client context (if applicable) are ready
    while (Date.now() - start < effectiveMaxWait) {
      if (isAuthAndContextReady()) {
        return true
      }
      await new Promise((r) => setTimeout(r, 50))
    }

    return false
  }

  /**
   * Make bootstrap API request with retry logic for transient errors.
   *
   * 401 errors are NOT retried here because the Venus proxy route
   * (/api/bootstrap) already handles 401 by refreshing the token and
   * retrying the Titan call. If the proxy still returns 401, the token
   * is genuinely expired and retrying from the client would just
   * compound requests (each attempt triggers another proxy-level retry).
   *
   * Only retryable 5xx (excluding 503/504) and 408 timeout errors are retried.
   * 503/504 are excluded — upstream pool pressure or BFF budget exhaustion;
   * a client retry would compound load and double total wait.
   */
  private async makeBootstrapRequest(
    requestBody: Record<string, unknown>,
    headers: Record<string, string>,
    traceId: string
  ): Promise<Response> {
    const maxRetries = 2
    const baseDelay = 500
    const clientAbortMs = VENUS_BOOTSTRAP_CLIENT_ABORT_MS
    const cancellationEpoch = this.bootstrapCancellationEpoch

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      this.throwIfBootstrapRequestCancelled(cancellationEpoch)

      const controller = new AbortController()
      this.bootstrapAbortControllers.add(controller)
      const timeoutId = setTimeout(() => controller.abort(), clientAbortMs)

      try {
        const response = await fetch('/api/bootstrap', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        // 5xx server errors — retryable except 503/504 (pool pressure / BFF timeout)
        if (
          response.status >= 500 &&
          response.status !== 503 &&
          response.status !== 504 &&
          attempt < maxRetries - 1
        ) {
          this.bootstrapAbortControllers.delete(controller)
          const delay = baseDelay * Math.pow(2, attempt)
          this.logger.warn(
            `[Bootstrap:${traceId}] Server error ${response.status} on attempt ${attempt + 1}/${maxRetries}, retrying in ${delay}ms`
          )
          await new Promise((r) => setTimeout(r, delay))
          this.throwIfBootstrapRequestCancelled(cancellationEpoch)
          continue
        }

        // 408 timeout — retryable. 504 from Venus BFF means Titan already exceeded
        // the proxy budget; a client retry would double total wait (~56s+).
        if (response.status === 408 && attempt < maxRetries - 1) {
          this.bootstrapAbortControllers.delete(controller)
          const delay = baseDelay * Math.pow(2, attempt)
          this.logger.warn(
            `[Bootstrap:${traceId}] Timeout ${response.status} on attempt ${attempt + 1}/${maxRetries}, retrying in ${delay}ms`
          )
          await new Promise((r) => setTimeout(r, delay))
          this.throwIfBootstrapRequestCancelled(cancellationEpoch)
          continue
        }

        this.responseAbortControllers.set(response, controller)
        return response
      } catch (fetchError) {
        clearTimeout(timeoutId)
        this.bootstrapAbortControllers.delete(controller)

        if (this.isAbortError(fetchError)) {
          throw new Error(BOOTSTRAP_TIMEOUT_USER_MESSAGE)
        }

        if (fetchError instanceof Error && fetchError.message === BOOTSTRAP_TIMEOUT_USER_MESSAGE) {
          throw fetchError
        }

        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt)
          this.logger.warn(
            `[Bootstrap:${traceId}] Network error on attempt ${attempt + 1}/${maxRetries}, retrying in ${delay}ms`
          )
          await new Promise((r) => setTimeout(r, delay))
          this.throwIfBootstrapRequestCancelled(cancellationEpoch)
          continue
        }

        throw fetchError
      }
    }

    throw new Error('Bootstrap failed after all retries')
  }

  private getClientBodyBudgetMs(startTime: number): number {
    return Math.max(1_000, VENUS_BOOTSTRAP_CLIENT_ABORT_MS - (performance.now() - startTime))
  }

  private throwIfBootstrapRequestCancelled(cancellationEpoch: number): void {
    if (cancellationEpoch !== this.bootstrapCancellationEpoch) {
      throw new Error(BOOTSTRAP_TIMEOUT_USER_MESSAGE)
    }
  }

  private isAbortError(error: unknown): boolean {
    return (
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
    )
  }

  private releaseResponseAbortController(response?: Response): void {
    if (!response) return
    const controller = this.responseAbortControllers.get(response)
    if (!controller) return
    this.bootstrapAbortControllers.delete(controller)
    this.responseAbortControllers.delete(response)
  }

  private async readResponseBodyWithinClientBudget<T>(
    operation: () => Promise<T>,
    startTime: number,
    traceId: string,
    label: string,
    response?: Response
  ): Promise<T> {
    const timeoutMs = this.getClientBodyBudgetMs(startTime)
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const controller = response ? this.responseAbortControllers.get(response) : undefined

    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            this.logger.warn(`[Bootstrap:${traceId}] Response ${label} exceeded client budget`, {
              timeoutMs: Math.round(timeoutMs),
            })
            controller?.abort()
            reject(new Error(BOOTSTRAP_TIMEOUT_USER_MESSAGE))
          }, timeoutMs)
        }),
      ])
    } catch (error) {
      if (this.isAbortError(error)) {
        throw new Error(BOOTSTRAP_TIMEOUT_USER_MESSAGE)
      }
      throw error
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      this.releaseResponseAbortController(response)
    }
  }

  private async fetchTitanBootstrapPayloadOnce(
    requestBody: Record<string, unknown>,
    headers: Record<string, string>,
    traceId: string,
    startTime: number
  ): Promise<TitanBootstrapFetchResult> {
    const apiStart = performance.now()
    const response = await this.makeBootstrapRequest(requestBody, headers, traceId)
    const apiMs = Math.round(performance.now() - apiStart)
    this.logger.info(`[Bootstrap:${traceId}] Titan API request complete`, {
      durationMs: apiMs,
      status: response.status,
    })

    if (!response.ok) {
      const lastErrorText = await this.readResponseBodyWithinClientBudget(
        () => response.text(),
        startTime,
        traceId,
        'error body',
        response
      )
      this.logger.error('[Bootstrap] Bootstrap API failed', {
        status: response.status,
        statusText: response.statusText,
        error: lastErrorText.substring(0, 200),
      })
      if (response.status === 401) {
        const mercuryUrl = getMercuryUrl()
        const locale =
          typeof window !== 'undefined'
            ? window.location.pathname.match(/^\/(en|nl|fr)\//)?.[1] || 'en'
            : 'en'
        const currentUrl = typeof window !== 'undefined' ? window.location.href : ''
        const redirectUrl = `${mercuryUrl}/${locale}/auth/login?returnUrl=${encodeURIComponent(currentUrl)}`
        throw new AuthenticationRequiredError(
          'Session expired or authentication required',
          redirectUrl
        )
      }
      if (response.status === 504 || response.status === 408 || response.status === 503) {
        throw new Error(BOOTSTRAP_TIMEOUT_USER_MESSAGE)
      }
      throw new Error(
        `Bootstrap API failed (${response.status}): ${lastErrorText.substring(0, 100)}`
      )
    }

    try {
      return {
        data: await this.readResponseBodyWithinClientBudget(
          () => response.json() as Promise<TitanBootstrapResponsePayload>,
          startTime,
          traceId,
          'JSON body',
          response
        ),
        responseStatus: response.status,
      }
    } catch (error) {
      if (error instanceof Error && error.message === BOOTSTRAP_TIMEOUT_USER_MESSAGE) {
        throw error
      }
      throw new Error('Invalid response from bootstrap service')
    }
  }

  private shouldRetryStructuredBootstrapError(
    data: TitanBootstrapResponsePayload,
    attempt: number
  ): boolean {
    if (data.success) return false
    if (attempt >= SessionBootstrapService.STRUCTURED_ERROR_MAX_RETRIES) return false
    if (!data.errorInfo?.retryable) return false
    if (data.data?.creditStatus && !data.data.creditStatus.allowed) return false
    return true
  }

  private getStructuredBootstrapRetryDelayMs(attempt: number): number {
    return SessionBootstrapService.STRUCTURED_ERROR_RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
  }

  private async waitForStructuredBootstrapRetry(
    _attempt: number,
    _traceId: string,
    delayMs: number
  ): Promise<void> {
    await new Promise((r) => setTimeout(r, delayMs))
  }

  private async fetchTitanBootstrapPayloadWithStructuredRetry(
    requestBody: Record<string, unknown>,
    headers: Record<string, string>,
    traceId: string,
    startTime: number
  ): Promise<TitanBootstrapFetchResult> {
    const cancellationEpoch = this.bootstrapCancellationEpoch

    for (let attempt = 0; ; attempt += 1) {
      this.throwIfBootstrapRequestCancelled(cancellationEpoch)

      const result = await this.fetchTitanBootstrapPayloadOnce(
        requestBody,
        headers,
        traceId,
        startTime
      )
      if (!this.shouldRetryStructuredBootstrapError(result.data, attempt)) {
        return result
      }

      const delayMs = this.getStructuredBootstrapRetryDelayMs(attempt)
      this.logger.warn(`[Bootstrap:${traceId}] Retryable structured error from Titan`, {
        code: result.data.errorInfo?.code,
        attempt: attempt + 1,
        maxAttempts: SessionBootstrapService.STRUCTURED_ERROR_MAX_RETRIES + 1,
        delayMs,
      })
      await this.waitForStructuredBootstrapRetry(attempt, traceId, delayMs)
      this.throwIfBootstrapRequestCancelled(cancellationEpoch)
    }
  }

  /**
   * Check if a successful bootstrap result is cached for the given context.
   * Used by BootstrapProvider to avoid re-triggering bootstrap after remounts.
   */
  hasCompletedFor(contextOrReportId: BootstrapContext | string | undefined): boolean {
    const effectiveKey = getBootstrapCacheLookupKey(contextOrReportId)
    return (
      this.lastSuccessfulResult !== null &&
      this.lastSuccessfulCacheKey === effectiveKey &&
      Date.now() - this.lastSuccessfulAt < SessionBootstrapService.RESULT_CACHE_TTL_MS
    )
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
    const hasFreshResult =
      this.lastSuccessfulResult !== null &&
      Date.now() - this.lastSuccessfulAt < SessionBootstrapService.RESULT_CACHE_TTL_MS

    if (!hasFreshResult) {
      return null
    }

    if (
      arguments.length > 0 &&
      this.lastSuccessfulCacheKey !== getBootstrapCacheLookupKey(contextOrReportId)
    ) {
      return null
    }

    if (this.lastSuccessfulResult) {
      return this.lastSuccessfulResult
    }

    return null
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

    // Guard 1: Sliding-window circuit breaker — blocks rapid-fire calls
    const now = Date.now()
    this.callTimestamps = this.callTimestamps.filter(
      (t) => now - t < SessionBootstrapService.CIRCUIT_BREAKER_WINDOW_MS
    )
    if (this.callTimestamps.length >= SessionBootstrapService.MAX_CALLS_IN_WINDOW) {
      const msg = `[Bootstrap] Circuit breaker: ${this.callTimestamps.length} calls in ${SessionBootstrapService.CIRCUIT_BREAKER_WINDOW_MS / 1000}s window — refusing further calls`
      this.logger.error(msg)
      const cachedResult = this.getCachedResult(context)
      if (cachedResult) {
        this.logger.info('[Bootstrap] Returning scoped cached result from circuit breaker')
        recordBootstrapReportMode(cachedResult.report.reportId, cachedResult.report.mode)
        return cachedResult
      }
      throw new Error(msg)
    }

    // Guard 2: Result cache — return cached result if fresh
    if (this.hasCompletedFor(context)) {
      this.logger.info(
        `[Bootstrap] Returning cached result for ${logReportId} (age: ${Date.now() - this.lastSuccessfulAt}ms)`
      )
      if (this.lastSuccessfulResult) {
        recordBootstrapReportMode(
          this.lastSuccessfulResult.report.reportId,
          this.lastSuccessfulResult.report.mode
        )
        return this.lastSuccessfulResult
      }
    }

    const titanCacheKey = `titan:${cacheKey}`

    // Guard 3: Dedup in-flight request
    const inflight = this.bootstrapPromiseCache.get(titanCacheKey)
    if (inflight) {
      this.logger.info('[Bootstrap] Returning in-flight Titan request (dedup)')
      return inflight
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
      const authReady = await this.waitForAuth(2500, needsClientContext)
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

      // Build request body
      // CRITICAL: Ensure reportId is always sent if present (not empty string)
      const validReportId = context.reportId?.trim() || undefined

      // ✅ CRITICAL FIX: Only include mode if it's a valid value ('edit' or 'view')
      // The Zod schema on the backend only accepts these two values, so invalid values cause 400 errors
      // Mercury may send mode=accountant in the URL - this is intentionally omitted. Accountant flow
      // context is conveyed via clientToken, clientId, and X-Client-User-Id headers, not mode.
      const validMode =
        context.mode === 'edit' || context.mode === 'view' ? context.mode : undefined

      // CRITICAL: clientToken in body enables Titan to resolve delegated (accountant) flow identity
      let requestBody: Record<string, unknown> = {
        reportId: validReportId,
        clientToken: context.clientToken, // Required for Mercury/accountant flow - Titan resolves identity from this
        clientId: context.clientId, // Pass clientId for accountant flow verification
        prefilledQuery: context.prefilledQuery,
        flow: context.flow,
        // CRITICAL: Only include mode if it's valid - omit entirely if invalid (don't send mode=accountant)
        ...(validMode && { mode: validMode }),
        version: context.version,
        locale: context.locale,
      }

      if (context.mode && !validMode) {
        this.logger.warn('[Bootstrap] Filtered out invalid mode value', {
          invalidMode: context.mode,
          note: 'Only "edit" or "view" are valid - mode will be omitted from request',
        })
      }

      // CRITICAL LOGGING: Log exactly what we're sending to debug ID mismatch
      this.logger.info('[Bootstrap] Sending to Titan API', {
        reportIdFromContext: context.reportId?.substring(0, 30) || 'none',
        reportIdInRequest: validReportId?.substring(0, 30) || 'none',
        reportIdLength: validReportId?.length || 0,
      })

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Trace flow Venus → Venus API → Titan → ValuationIQ for staging/prod debugging
        'X-Correlation-ID': traceId,
      }

      // BANK GRADE: Add client context headers using the store's getContextHeaders()
      // This uses standardized header names: X-Client-User-Id, X-Accountant-User-Id, X-Relationship-Id
      // AuthGate ensures client context is in the store BEFORE bootstrap runs
      try {
        const { useClientContext } = await import('../../stores/clientContext')
        const contextState = useClientContext.getState()
        const contextHeaders = contextState.getContextHeaders()
        const clientHeader = contextHeaders['X-Client-User-Id']
        const accountantHeader = contextHeaders['X-Accountant-User-Id']
        const relationshipHeader = contextHeaders['X-Relationship-Id']
        const hasAnyContextHeader = !!(clientHeader || accountantHeader || relationshipHeader)
        const hasFullDelegatedHeaderSet = !!(clientHeader && accountantHeader && relationshipHeader)
        const hasPartialDelegatedHeaderSet = !!(accountantHeader && relationshipHeader)

        if (hasFullDelegatedHeaderSet || hasPartialDelegatedHeaderSet) {
          Object.assign(headers, contextHeaders)
          this.logger.info('[Bootstrap] Added delegated client context headers from store', {
            headerCount: Object.keys(contextHeaders).length,
            hasClientUserId: !!clientHeader,
            hasClientToken: hints.hasClientToken || !!context.clientToken,
            partialDelegated: hasPartialDelegatedHeaderSet && !hasFullDelegatedHeaderSet,
          })
        } else if (hasAnyContextHeader) {
          this.logger.warn(
            '[Bootstrap] Incomplete client context in store - cannot send delegated headers',
            {
              hasClientUserId: !!clientHeader,
              hasAccountantUserId: !!accountantHeader,
              hasRelationshipId: !!relationshipHeader,
            }
          )
          if (!requestBody['clientId'] && contextState.relationshipId) {
            requestBody['clientId'] = contextState.relationshipId
          }
        }

        if (!hasAnyContextHeader && (hints.hasClientToken || context.clientToken)) {
          // Only warn if clientToken was present but context not in store
          this.logger.warn('[Bootstrap] Client token present but client context not in store', {
            note: 'AuthGate should have ensured context is ready before bootstrap',
          })
        }
      } catch (error) {
        this.logger.warn('[Bootstrap] Failed to get client context headers (non-critical)', {
          error: error instanceof Error ? error.message : String(error),
        })
      }

      // DIAGNOSTIC: Log before bootstrap request to trace client context propagation
      const hasClientContextHeaders = Object.keys(headers).some(
        (k) =>
          k.toLowerCase() === 'x-client-user-id' ||
          k.toLowerCase() === 'x-accountant-user-id' ||
          k.toLowerCase() === 'x-relationship-id'
      )
      this.logger.info(`[Bootstrap:${traceId}] Pre-request diagnostic`, {
        hasClientContextHeaders,
        authReady,
        authWaitMs,
        headerKeys: Object.keys(headers).filter((k) => k.toLowerCase().startsWith('x-')),
      })

      // Make request (proxy handles 401 refresh; no client-side retry on 401).
      const { data, responseStatus } = await this.fetchTitanBootstrapPayloadWithStructuredRetry(
        requestBody,
        headers,
        traceId,
        startTime
      )

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
        // Extract structured error info if available
        const errorInfo: BootstrapErrorInfo | undefined = data.errorInfo

        // Log structured error details for debugging
        if (errorInfo) {
          this.logger.warn(`[Bootstrap:${traceId}] Received structured error`, {
            code: errorInfo.code,
            message: errorInfo.message,
            retryable: errorInfo.retryable,
          })
        }

        // Check if this is a credit error (allow viewing with limited data)
        if (data.data?.creditStatus && !data.data.creditStatus.allowed) {
          return buildCreditBlockedTitanState(data.data, context, startTime)
        }

        // Check if error is retryable based on structured error info
        const isRetryableError = errorInfo?.retryable ?? false
        const errorCode = errorInfo?.code || 'UNKNOWN'

        // Create rich error message
        const errorMessage = errorInfo
          ? `[${errorCode}] ${errorInfo.message}${isRetryableError ? ' (retryable)' : ''}`
          : data.error || 'Bootstrap returned no data'

        const error = new Error(errorMessage) as Error & {
          code?: string
          retryable?: boolean
        }
        error.code = errorCode
        error.retryable = isRetryableError
        throw error
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
      await this.syncClientContext(state.identity)

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
