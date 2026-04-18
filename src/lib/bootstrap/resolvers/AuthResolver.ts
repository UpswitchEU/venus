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

import { fetchWithTimeoutClient } from '@/utils/auth-fetch-timeout'
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
          ? window.location.pathname.match(/^\/(en|nl|fr|de)\//)?.[1] || 'en'
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

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          data: this.fallback(),
          error: errorData.message || `Token exchange failed (${response.status})`,
          durationMs: performance.now() - startTime,
        }
      }

      const contextData = await response.json()

      // Validate response structure (clientUser null when invitation not accepted)
      if (!contextData.accountantUser || !contextData.relationship) {
        return {
          success: false,
          data: this.fallback(),
          error: 'Invalid client context structure',
          durationMs: performance.now() - startTime,
        }
      }

      const clientContext: ClientContext = {
        clientUserId: contextData.clientUser?.id ?? null,
        clientEmail: contextData.clientUser?.email ?? null,
        clientCompanyName: contextData.clientUser?.company_name ?? contextData.relationship.customer_name,
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
      return {
        success: false,
        data: this.fallback(),
        error: error instanceof Error ? error.message : 'Network error',
        durationMs: performance.now() - startTime,
      }
    }
  }

  /**
   * Verify authentication via cookies
   */
  private async resolveCookieAuth(): Promise<ResolverResult<IdentityState>> {
    const startTime = performance.now()

    try {
      // Use Venus proxy route for same-origin request
      const response = await fetchWithTimeoutClient('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
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
      const user = data.success ? data.data?.user || data.data : data.user || data

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
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
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
   * Try to refresh expired access token
   */
  private async tryRefreshToken(): Promise<boolean> {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      })
      return response.ok
    } catch {
      return false
    }
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
      if (
        contextState.isActingAsClient &&
        contextState.accountant &&
        contextState.relationshipId
      ) {
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
