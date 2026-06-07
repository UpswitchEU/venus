/**
 * Auth Resolver
 *
 * AUTH-FIRST ARCHITECTURE: Resolves identity state for authenticated users only.
 * Guest flow has been removed - users must authenticate before accessing valuation features.
 *
 * Supported identity types:
 * - 'authenticated': Regular logged-in user
 * - 'accountant_for_client': Accountant acting on behalf of a client
 *
 * @module lib/bootstrap/resolvers/AuthResolver
 */

import { markRefreshCompleted, wasRefreshedRecently } from '@/utils/auth/cross-tab-refresh'
import { getLogoutAbortSignal } from '@/utils/auth/logout-abort'
import {
  awaitMercuryAuthBootstrap,
  getCapturedMercuryAuthBootstrap,
  installMercuryAuthBootstrapListener,
  type MercuryAuthBootstrap,
} from '@/utils/auth/mercury-auth-bootstrap'
import { extractAuthMeUserPayload } from '@/utils/auth/parse-auth-me-response'
import { getActiveRefreshPromise, setActiveRefreshPromise } from '@/utils/auth/refreshMutex'
import {
  CLIENT_AUTH_REFRESH_FETCH_TIMEOUT_MS,
  fetchWithTimeoutClient,
} from '@/utils/auth-fetch-timeout'
import { getApiUrl, getMercuryUrl } from '@/utils/getMercuryUrl'
import type {
  BootstrapContext,
  BootstrapHints,
  BootstrapResolver,
  ClientContext,
  IdentityState,
  ResolverResult,
} from '../types'
import { DEFAULT_IDENTITY, REQUIRE_AUTH_FOR_VALUATION } from '../types'
import { truncateForLog } from '../utils'

/**
 * Error thrown when authentication is required but user is not authenticated
 */
export class AuthenticationRequiredError extends Error {
  constructor(
    message: string = 'Authentication required to access valuation features',
    public readonly redirectUrl: string = '/auth/login'
  ) {
    super(message)
    this.name = 'AuthenticationRequiredError'
  }
}

const API_URL = getApiUrl()

// ============================================================================
// Module-level last-failure record
// ============================================================================
// Captures the most recent /exchange-client-context failure so the AuthGate
// error overlay can render the Titan correlation id (parity with Mercury BFF
// error overlays). Cleared on successful exchange.

export interface ClientTokenExchangeFailure {
  /** HTTP status from Titan (0 for network error). */
  status: number
  /** Titan-issued correlation id (response header). */
  correlationId: string | null
  /** Human-readable reason (Titan body or thrown error). */
  reason: string
  /** Performance.now() when captured. */
  at: number
}

let lastClientTokenExchangeFailure: ClientTokenExchangeFailure | null = null

export function getLastClientTokenExchangeFailure(): ClientTokenExchangeFailure | null {
  return lastClientTokenExchangeFailure
}

export function clearLastClientTokenExchangeFailure(): void {
  lastClientTokenExchangeFailure = null
}

export class AuthResolver implements BootstrapResolver<IdentityState> {
  private readonly logger = console

  /**
   * Resolve identity from auth state and client context
   */
  async resolve(
    context: BootstrapContext,
    hints: BootstrapHints
  ): Promise<ResolverResult<IdentityState>> {
    const startTime = performance.now()

    try {
      // Priority 1: Client token (accountant-for-client flow)
      if (hints.hasClientToken && context.clientToken) {
        const result = await this.resolveClientContext(context.clientToken)
        if (result.success) {
          return {
            success: true,
            data: result.data,
            source: 'client_token',
            durationMs: performance.now() - startTime,
          }
        }
        // Client token invalid - fall through to cookie auth
        this.logger.warn('[AuthResolver] Client token exchange failed, trying cookie auth')
      }

      // Priority 1.5: Check if client context already exists in store
      // This handles the case where auth.ts restored context from report's accountant_customer_id
      // when an accountant returns to an existing report page (no clientToken in URL)
      const existingContextResult = await this.checkExistingClientContext()
      if (existingContextResult.success) {
        this.logger.info('[AuthResolver] Using existing client context from store')
        return {
          success: true,
          data: existingContextResult.data,
          source: 'existing_store',
          durationMs: performance.now() - startTime,
        }
      }

      // Priority 1.7: Mercury embedded modal — Mercury posts the auth user
      // via `postMessage` (`upswitch-auth-bootstrap`) the moment the iframe
      // loads. Use it instead of round-tripping `/api/auth/me`.
      const bootstrapResult = await this.resolveFromMercuryBootstrap()
      if (bootstrapResult.success && bootstrapResult.data.type === 'authenticated') {
        return {
          success: true,
          data: bootstrapResult.data,
          source: 'mercury_bootstrap',
          durationMs: performance.now() - startTime,
        }
      }

      // Priority 2: Cookie-based auth
      const cookieResult = await this.resolveCookieAuth()
      if (cookieResult.success && cookieResult.data.type === 'authenticated') {
        return {
          success: true,
          data: cookieResult.data,
          source: 'cookie',
          durationMs: performance.now() - startTime,
        }
      }

      // AUTH-FIRST: No guest fallback - require authentication
      // Build redirect URL to return user to current page after login
      // Redirect to Mercury login page (Venus doesn't have its own auth)
      const currentUrl = typeof window !== 'undefined' ? window.location.href : '/reports/new'
      const mercuryUrl = getMercuryUrl()
      const locale =
        typeof window !== 'undefined'
          ? window.location.pathname.match(/^\/(en|nl|fr)\//)?.[1] || 'en'
          : 'en'
      // Mercury expects 'returnUrl' parameter (not 'redirect')
      const redirectUrl = `${mercuryUrl}/${locale}/auth/login?returnUrl=${encodeURIComponent(currentUrl)}`

      this.logger.warn('[AuthResolver] Authentication required - redirecting to Mercury login', {
        authRequired: REQUIRE_AUTH_FOR_VALUATION,
        redirectUrl,
        currentUrl,
      })

      // Let AuthenticationRequiredError propagate to BootstrapProvider which
      // handles the redirect via its catch block (line ~396). Redirecting here
      // AND throwing causes the redirect to fire before the error can be caught,
      // which can contribute to redirect loops.
      throw new AuthenticationRequiredError(
        'Please sign in to access valuation features',
        redirectUrl
      )
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // BANK-GRADE: Log error with full context
      this.logger.error('[AuthResolver] Resolution failed - returning error state', {
        error: errorMessage,
        note: 'UI will redirect to login',
      })

      return {
        success: false,
        data: this.fallback(),
        error: errorMessage,
        source: 'error',
        durationMs: performance.now() - startTime,
      }
    }
  }

  /**
   * Default identity state for errors
   * AUTH-FIRST: Returns unauthenticated state that triggers login redirect
   */
  fallback(): IdentityState {
    return {
      ...DEFAULT_IDENTITY,
    }
  }

  /**
   * Exchange client token for client context
   *
   * On failure, captures the Titan correlation id (response header) into a
   * module-level record so the AuthGate error overlay can display it. This
   * mirrors the diagnostic chip Mercury BFF routes attach to error responses
   * via `bff-structured-log` — without it, support has no way to trace which
   * Titan request actually failed.
   */
  private async resolveClientContext(clientToken: string): Promise<ResolverResult<IdentityState>> {
    const startTime = performance.now()

    try {
      const response = await fetch(`${API_URL}/api/v2/auth/exchange-client-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: clientToken }),
      })

      const correlationId = response.headers.get('x-correlation-id')

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const reason = errorData.message || `Token exchange failed (${response.status})`
        lastClientTokenExchangeFailure = {
          status: response.status,
          correlationId,
          reason,
          at: performance.now(),
        }
        return {
          success: false,
          data: this.fallback(),
          error: reason,
          durationMs: performance.now() - startTime,
        }
      }

      const contextData = await response.json()

      // Validate response structure (clientUser null when invitation not accepted)
      if (!contextData.accountantUser || !contextData.relationship) {
        const reason = 'Invalid client context structure'
        lastClientTokenExchangeFailure = {
          status: response.status,
          correlationId,
          reason,
          at: performance.now(),
        }
        return {
          success: false,
          data: this.fallback(),
          error: reason,
          durationMs: performance.now() - startTime,
        }
      }

      // Success — clear any stale failure so a follow-up error can capture
      // its own correlation id without confusion.
      lastClientTokenExchangeFailure = null

      const clientContext: ClientContext = {
        clientUserId: contextData.clientUser?.id ?? null,
        clientEmail: contextData.clientUser?.email ?? null,
        clientCompanyName:
          contextData.clientUser?.company_name ?? contextData.relationship.customer_name,
        accountantUserId: contextData.accountantUser.id,
        accountantEmail: contextData.accountantUser.email,
        relationshipId: contextData.relationship.id,
        permissions: {
          canCreateValuations: true,
          canViewReports: true,
          canEditReports: true,
        },
      }

      // When clientUser null (pending invitation), session owned by accountant
      const effectiveUserId = contextData.clientUser?.id ?? contextData.accountantUser.id

      const identity: IdentityState = {
        type: 'accountant_for_client',
        userId: effectiveUserId,
        clientContext,
        email: contextData.accountantUser.email,
        firstName: contextData.accountantUser.first_name,
        lastName: contextData.accountantUser.last_name,
      }

      this.logger.info('[AuthResolver] Client context resolved', {
        clientUserId: truncateForLog(clientContext.clientUserId ?? undefined),
        accountantUserId: truncateForLog(clientContext.accountantUserId),
      })

      return {
        success: true,
        data: identity,
        source: 'client_token',
        durationMs: performance.now() - startTime,
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Network error'
      lastClientTokenExchangeFailure = {
        status: 0,
        correlationId: null,
        reason,
        at: performance.now(),
      }
      return {
        success: false,
        data: this.fallback(),
        error: reason,
        durationMs: performance.now() - startTime,
      }
    }
  }

  /**
   * Resolve identity from a Mercury → Engine `upswitch-auth-bootstrap`
   * `postMessage` payload. Only attempts the wait when running inside an
   * iframe — otherwise we exit immediately so standalone Venus loads keep
   * the cookie/refresh path on the critical timeline.
   *
   * Budget:
   *   - 0 ms when the message has already arrived (synchronous read).
   *   - 1500 ms when waiting for it (Mercury posts on `iframe.onload`,
   *     which usually fires within a few hundred ms).
   */
  private async resolveFromMercuryBootstrap(): Promise<ResolverResult<IdentityState>> {
    const startTime = performance.now()
    if (typeof window === 'undefined') {
      return {
        success: false,
        data: this.fallback(),
        error: 'No window',
        durationMs: performance.now() - startTime,
      }
    }
    const isEmbedded = (() => {
      try {
        return window.parent !== window
      } catch {
        return true
      }
    })()
    if (!isEmbedded) {
      return {
        success: false,
        data: this.fallback(),
        error: 'Standalone — skipping Mercury bootstrap',
        durationMs: performance.now() - startTime,
      }
    }
    installMercuryAuthBootstrapListener()
    let payload: MercuryAuthBootstrap | null = getCapturedMercuryAuthBootstrap()
    if (!payload) {
      payload = await awaitMercuryAuthBootstrap(1500)
    }
    if (!payload?.user?.id) {
      return {
        success: false,
        data: this.fallback(),
        error: 'No Mercury bootstrap payload',
        durationMs: performance.now() - startTime,
      }
    }
    const identity: IdentityState = {
      type: 'authenticated',
      userId: payload.user.id,
      email: payload.user.email,
      firstName: payload.user.firstName,
      lastName: payload.user.lastName,
    }
    this.logger.info('[AuthResolver] Mercury bootstrap accepted', {
      userId: truncateForLog(payload.user.id),
      mode: payload.mode,
    })
    return {
      success: true,
      data: identity,
      source: 'mercury_bootstrap',
      durationMs: performance.now() - startTime,
    }
  }

  /**
   * Verify authentication via cookies
   */
  private async resolveCookieAuth(): Promise<ResolverResult<IdentityState>> {
    const startTime = performance.now()

    try {
      // Use Venus proxy route for same-origin request.
      // Logout signal aborts mid-flight so /me's BFF refresh hop can't
      // write rotated `Set-Cookie` after a concurrent logout.
      const response = await fetchWithTimeoutClient('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        signal: getLogoutAbortSignal(),
      })

      if (!response.ok) {
        // Try token refresh if 401
        if (response.status === 401) {
          const refreshed = await this.tryRefreshToken()
          if (refreshed) {
            return this.resolveCookieAuth() // Retry after refresh
          }
        }

        return {
          success: false,
          data: this.fallback(),
          error: `Auth check failed (${response.status})`,
          durationMs: performance.now() - startTime,
        }
      }

      const data = await response.json()
      const user = extractAuthMeUserPayload(data)

      if (!user || !user.id) {
        return {
          success: false,
          data: this.fallback(),
          error: 'No user in response',
          durationMs: performance.now() - startTime,
        }
      }

      const identity: IdentityState = {
        type: 'authenticated',
        userId: user.id,
        email: typeof user.email === 'string' ? user.email : undefined,
        firstName: typeof user.first_name === 'string' ? user.first_name : undefined,
        lastName: typeof user.last_name === 'string' ? user.last_name : undefined,
      }

      this.logger.info('[AuthResolver] Cookie auth resolved', {
        userId: truncateForLog(user.id),
      })

      return {
        success: true,
        data: identity,
        source: 'cookie',
        durationMs: performance.now() - startTime,
      }
    } catch (error) {
      return {
        success: false,
        data: this.fallback(),
        error: error instanceof Error ? error.message : 'Network error',
        durationMs: performance.now() - startTime,
      }
    }
  }

  /**
   * Try to refresh expired access token.
   *
   * Coordinates with `useTokenRefresh` and `checkSession` via three layers:
   *   1. Cross-tab dedup — skip if any tab refreshed recently
   *   2. Shared in-tab mutex — wait on an existing refresh if one is in flight
   *   3. Mark the result so other tabs can defer their own refresh
   */
  private async tryRefreshToken(): Promise<boolean> {
    // Cross-tab dedup: another tab just rotated tokens; the new cookies are
    // already in our jar — no need to race the now-rotated refresh token.
    if (wasRefreshedRecently()) {
      return true
    }
    const existing = getActiveRefreshPromise()
    if (existing) {
      return existing
    }
    const promise = (async () => {
      try {
        const response = await fetchWithTimeoutClient('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json' },
          signal: getLogoutAbortSignal(),
          timeoutMs: CLIENT_AUTH_REFRESH_FETCH_TIMEOUT_MS,
        })
        if (response.ok) {
          markRefreshCompleted()
        }
        return response.ok
      } catch {
        return false
      } finally {
        setActiveRefreshPromise(null)
      }
    })()
    setActiveRefreshPromise(promise)
    return promise
  }

  /**
   * Check if client context already exists in store
   *
   * This handles the case where auth.ts has already restored client context
   * from the report's accountant_customer_id (when returning to an existing report).
   * By checking the store, we ensure bootstrap picks up the context regardless
   * of timing between auth.ts and bootstrap initialization.
   */
  private async checkExistingClientContext(): Promise<ResolverResult<IdentityState>> {
    const startTime = performance.now()

    try {
      // Dynamic import to avoid circular dependencies
      const { useClientContext } = await import('../../../stores/clientContext')
      const contextState = useClientContext.getState()

      // Check if we have valid client context (client null when invitation not accepted)
      if (contextState.isActingAsClient && contextState.accountant && contextState.relationshipId) {
        this.logger.info('[AuthResolver] Found existing client context in store', {
          clientId: truncateForLog(contextState.client?.id ?? 'null'),
          accountantId: truncateForLog(contextState.accountant.id),
        })

        const clientContext: ClientContext = {
          clientUserId: contextState.client?.id ?? null,
          clientEmail: contextState.client?.email ?? null,
          clientCompanyName: contextState.client?.fullName ?? undefined,
          accountantUserId: contextState.accountant.id,
          accountantEmail: contextState.accountant.email || '',
          relationshipId: contextState.relationshipId,
          permissions: {
            canCreateValuations: true,
            canViewReports: true,
            canEditReports: true,
          },
        }

        const effectiveUserId = contextState.client?.id ?? contextState.accountant.id
        const identity: IdentityState = {
          type: 'accountant_for_client',
          userId: effectiveUserId,
          clientContext,
          email: contextState.accountant.email,
        }

        return {
          success: true,
          data: identity,
          source: 'existing_store',
          durationMs: performance.now() - startTime,
        }
      }

      // No existing context found
      return {
        success: false,
        data: this.fallback(),
        error: 'No existing client context in store',
        durationMs: performance.now() - startTime,
      }
    } catch (error) {
      // If store access fails, just return false (will fall through to cookie auth)
      this.logger.debug('[AuthResolver] Failed to check existing client context', {
        error: error instanceof Error ? error.message : String(error),
      })

      return {
        success: false,
        data: this.fallback(),
        error: error instanceof Error ? error.message : 'Store access failed',
        durationMs: performance.now() - startTime,
      }
    }
  }
}

// Export singleton instance
export const authResolver = new AuthResolver()
