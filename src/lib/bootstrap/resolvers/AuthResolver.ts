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

import type {
  BootstrapContext,
  BootstrapHints,
  BootstrapResolver,
  ClientContext,
  IdentityState,
  ResolverResult,
} from '../types';
import { DEFAULT_IDENTITY, REQUIRE_AUTH_FOR_VALUATION } from '../types';
import { truncateForLog } from '../utils';

/**
 * Error thrown when authentication is required but user is not authenticated
 */
export class AuthenticationRequiredError extends Error {
  constructor(
    message: string = 'Authentication required to access valuation features',
    public readonly redirectUrl: string = '/auth/login'
  ) {
    super(message);
    this.name = 'AuthenticationRequiredError';
  }
}

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 
                process.env.NEXT_PUBLIC_API_BASE_URL || 
                'https://api.upswitch.app';

export class AuthResolver implements BootstrapResolver<IdentityState> {
  private readonly logger = console;

  /**
   * Resolve identity from auth state and client context
   */
  async resolve(
    context: BootstrapContext,
    hints: BootstrapHints
  ): Promise<ResolverResult<IdentityState>> {
    const startTime = performance.now();
    
    try {
      // Priority 1: Client token (accountant-for-client flow)
      if (hints.hasClientToken && context.clientToken) {
        const result = await this.resolveClientContext(context.clientToken);
        if (result.success) {
          return {
            success: true,
            data: result.data,
            source: 'client_token',
            durationMs: performance.now() - startTime,
          };
        }
        // Client token invalid - fall through to cookie auth
        this.logger.warn('[AuthResolver] Client token exchange failed, trying cookie auth');
      }

      // Priority 2: Cookie-based auth
      const cookieResult = await this.resolveCookieAuth();
      if (cookieResult.success && cookieResult.data.type === 'authenticated') {
        return {
          success: true,
          data: cookieResult.data,
          source: 'cookie',
          durationMs: performance.now() - startTime,
        };
      }

      // AUTH-FIRST: No guest fallback - require authentication
      // Build redirect URL to return user to current page after login
      // Redirect to Mercury login page (Venus doesn't have its own auth)
      const currentUrl = typeof window !== 'undefined' ? window.location.href : 'https://valuation.upswitch.app/reports/new';
      const mercuryUrl = process.env.NEXT_PUBLIC_MERCURY_URL || 'https://upswitch.app';
      const locale = typeof window !== 'undefined' ? window.location.pathname.match(/^\/(en|nl|fr|de)\//)?.[1] || 'en' : 'en';
      // Mercury expects 'returnUrl' parameter (not 'redirect')
      const redirectUrl = `${mercuryUrl}/${locale}/auth/login?returnUrl=${encodeURIComponent(currentUrl)}`;
      
      this.logger.warn('[AuthResolver] Authentication required - redirecting to Mercury login', {
        authRequired: REQUIRE_AUTH_FOR_VALUATION,
        redirectUrl,
        currentUrl,
      });

      // WORLD-CLASS FIX: Redirect IMMEDIATELY instead of just throwing error
      // The throw below gets caught by our own catch block, so we must redirect first
      // This ensures user is redirected before any error handling interferes
      if (typeof window !== 'undefined') {
        window.location.href = redirectUrl;
      }

      // Still throw for SSR/non-browser contexts (will be caught, but that's OK)
      throw new AuthenticationRequiredError(
        'Please sign in to access valuation features',
        redirectUrl
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // BANK-GRADE: Log error with full context
      this.logger.error('[AuthResolver] Resolution failed - returning error state', {
        error: errorMessage,
        note: 'UI will redirect to login',
      });
      
      return {
        success: false,
        data: this.fallback(),
        error: errorMessage,
        source: 'error',
        durationMs: performance.now() - startTime,
      };
    }
  }

  /**
   * Default identity state for errors
   * AUTH-FIRST: Returns unauthenticated state that triggers login redirect
   */
  fallback(): IdentityState {
    return {
      ...DEFAULT_IDENTITY,
    };
  }

  /**
   * Exchange client token for client context
   */
  private async resolveClientContext(clientToken: string): Promise<ResolverResult<IdentityState>> {
    const startTime = performance.now();

    try {
      const response = await fetch(`${API_URL}/api/v2/auth/exchange-client-context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: clientToken }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          data: this.fallback(),
          error: errorData.message || `Token exchange failed (${response.status})`,
          durationMs: performance.now() - startTime,
        };
      }

      const contextData = await response.json();

      // Validate response structure
      if (!contextData.accountantUser || !contextData.clientUser || !contextData.relationship) {
        return {
          success: false,
          data: this.fallback(),
          error: 'Invalid client context structure',
          durationMs: performance.now() - startTime,
        };
      }

      const clientContext: ClientContext = {
        clientUserId: contextData.clientUser.id,
        clientEmail: contextData.clientUser.email,
        clientCompanyName: contextData.clientUser.company_name,
        accountantUserId: contextData.accountantUser.id,
        accountantEmail: contextData.accountantUser.email,
        relationshipId: contextData.relationship.id,
        permissions: {
          canCreateValuations: true,
          canViewReports: true,
          canEditReports: true,
        },
      };

      const identity: IdentityState = {
        type: 'accountant_for_client',
        userId: contextData.clientUser.id, // Session owned by client
        clientContext,
        email: contextData.accountantUser.email,
        firstName: contextData.accountantUser.first_name,
        lastName: contextData.accountantUser.last_name,
      };

      this.logger.info('[AuthResolver] Client context resolved', {
        clientUserId: truncateForLog(clientContext.clientUserId),
        accountantUserId: truncateForLog(clientContext.accountantUserId),
      });

      return {
        success: true,
        data: identity,
        source: 'client_token',
        durationMs: performance.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        data: this.fallback(),
        error: error instanceof Error ? error.message : 'Network error',
        durationMs: performance.now() - startTime,
      };
    }
  }

  /**
   * Verify authentication via cookies
   */
  private async resolveCookieAuth(): Promise<ResolverResult<IdentityState>> {
    const startTime = performance.now();

    try {
      // Use Venus proxy route for same-origin request
      const response = await fetch('/api/auth/me', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        // Try token refresh if 401
        if (response.status === 401) {
          const refreshed = await this.tryRefreshToken();
          if (refreshed) {
            return this.resolveCookieAuth(); // Retry after refresh
          }
        }

        return {
          success: false,
          data: this.fallback(),
          error: `Auth check failed (${response.status})`,
          durationMs: performance.now() - startTime,
        };
      }

      const data = await response.json();
      const user = data.success ? data.data?.user || data.data : data.user || data;

      if (!user || !user.id) {
        return {
          success: false,
          data: this.fallback(),
          error: 'No user in response',
          durationMs: performance.now() - startTime,
        };
      }

      const identity: IdentityState = {
        type: 'authenticated',
        userId: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      };

      this.logger.info('[AuthResolver] Cookie auth resolved', {
        userId: truncateForLog(user.id),
      });

      return {
        success: true,
        data: identity,
        source: 'cookie',
        durationMs: performance.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        data: this.fallback(),
        error: error instanceof Error ? error.message : 'Network error',
        durationMs: performance.now() - startTime,
      };
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
      });
      return response.ok;
    } catch {
      return false;
    }
  }

}

// Export singleton instance
export const authResolver = new AuthResolver();
