/**
 * Session Bootstrap Service
 * 
 * World-class initialization service that resolves ALL state before UI renders.
 * Orchestrates parallel resolution of auth, session, and prefill data.
 * 
 * Following patterns from:
 * - Stripe: Single request for complete context
 * - Klarna: Graceful degradation with fallbacks
 * - Linear: Optimistic UI with server verification
 * 
 * @module lib/bootstrap/SessionBootstrapService
 */

import { AuthResolver, authResolver } from './resolvers/AuthResolver';
import { PrefillResolver, prefillResolver } from './resolvers/PrefillResolver';
import { SessionResolver, sessionResolver } from './resolvers/SessionResolver';
import type {
  BootstrapContext,
  BootstrapHints,
  FlowType,
  IdentityState,
  PrefillData,
  ReportState,
  SessionBootstrapState,
  UIHints,
} from './types';
import {
  BOOTSTRAP_VERSION,
  DEFAULT_BOOTSTRAP_STATE,
  DEFAULT_IDENTITY,
  DEFAULT_PREFILL,
  DEFAULT_REPORT,
  DEFAULT_UI_HINTS,
} from './types';
import { generateReportId, parseBootstrapHints, parseUrlToContext, truncateForLog } from './utils';

interface BootstrapOptions {
  /** Timeout for bootstrap process in ms */
  timeout?: number;
  /** Skip auth resolution (for server-side where cookies aren't available) */
  skipAuth?: boolean;
  /** Use cached bootstrap if available */
  useCache?: boolean;
}

const DEFAULT_OPTIONS: BootstrapOptions = {
  timeout: 5000,
  skipAuth: false,
  useCache: true,
};

export class SessionBootstrapService {
  private readonly logger = console;
  private readonly authResolver: AuthResolver;
  private readonly sessionResolver: SessionResolver;
  private readonly prefillResolver: PrefillResolver;

  // In-flight bootstrap cache to prevent duplicate requests
  private bootstrapPromiseCache: Map<string, Promise<SessionBootstrapState>> = new Map();

  constructor(
    authResolver?: AuthResolver,
    sessionResolver?: SessionResolver,
    prefillResolver?: PrefillResolver
  ) {
    this.authResolver = authResolver || new AuthResolver();
    this.sessionResolver = sessionResolver || new SessionResolver();
    this.prefillResolver = prefillResolver || new PrefillResolver();
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
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const startTime = performance.now();
    const cacheKey = this.getCacheKey(context);

    // Check for in-flight request (deduplication)
    const inflight = this.bootstrapPromiseCache.get(cacheKey);
    if (inflight && opts.useCache) {
      this.logger.info('[Bootstrap] Returning in-flight request');
      return inflight;
    }

    // Create and cache the bootstrap promise
    const bootstrapPromise = this.executeBootstrap(context, opts, startTime);
    this.bootstrapPromiseCache.set(cacheKey, bootstrapPromise);

    try {
      const result = await bootstrapPromise;
      return result;
    } finally {
      // Clean up cache after completion
      this.bootstrapPromiseCache.delete(cacheKey);
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
    const context = parseUrlToContext(url, cookies);
    return this.bootstrap(context, options);
  }

  /**
   * Execute the bootstrap process
   */
  private async executeBootstrap(
    context: BootstrapContext,
    options: BootstrapOptions,
    startTime: number
  ): Promise<SessionBootstrapState> {
    const hints = parseBootstrapHints(context);

    this.logger.info('[Bootstrap] Starting bootstrap', {
      reportId: context.reportId ? truncateForLog(context.reportId) : 'new',
      hasClientToken: hints.hasClientToken,
      hasGuestSessionId: hints.hasGuestSessionId,
      isEmbedded: hints.isEmbedded,
    });

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Bootstrap timeout')), options.timeout);
      });

      // Execute bootstrap with timeout
      const result = await Promise.race([
        this.resolveAllState(context, hints, options),
        timeoutPromise,
      ]);

      const durationMs = performance.now() - startTime;

      this.logger.info('[Bootstrap] Bootstrap complete', {
        durationMs: Math.round(durationMs),
        identityType: result.identity.type,
        reportMode: result.report.mode,
        prefillConfidence: result.prefillData.confidence.toFixed(2),
        prefilledFields: result.prefillData.fieldsPopulated.length,
      });

      return {
        ...result,
        bootstrapDurationMs: durationMs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[Bootstrap] Bootstrap failed:', errorMessage);

      // Return graceful fallback
      return this.buildFallbackState(context, hints, startTime, errorMessage);
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
    // Phase 1: Resolve identity (required for other resolutions)
    let identity: IdentityState;
    if (options.skipAuth) {
      identity = DEFAULT_IDENTITY;
    } else {
      const authResult = await this.authResolver.resolve(context, hints);
      identity = authResult.data;
    }

    // Phase 2: Parallel resolution of session and prefill
    const [sessionResult, prefillResult] = await Promise.all([
      this.sessionResolver.resolve(context, hints, identity),
      this.prefillResolver.resolve(context, hints, identity),
    ]);

    const report = sessionResult.data;
    const prefillData = prefillResult.data;

    // Phase 3: Build UI hints
    const ui = this.buildUIHints(context, hints, identity, report, prefillData);

    return {
      identity,
      report,
      prefillData,
      ui,
      bootstrapVersion: BOOTSTRAP_VERSION,
      bootstrappedAt: new Date(),
      bootstrapDurationMs: 0, // Will be set by caller
    };
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
    let suggestedFlow: FlowType = 'manual';
    if (hints.requestedFlow) {
      suggestedFlow = hints.requestedFlow;
    } else if (prefillData.confidence < 0.3) {
      // Low confidence = conversational might help gather more data
      suggestedFlow = 'conversational';
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
    };
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
    const reportId = context.reportId || generateReportId();

    return {
      identity: {
        ...DEFAULT_IDENTITY,
        guestSessionId: context.guestSessionId,
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
    };
  }

  /**
   * Generate cache key for deduplication
   */
  private getCacheKey(context: BootstrapContext): string {
    return [
      context.reportId || 'new',
      context.clientToken?.substring(0, 10) || 'no-token',
      context.guestSessionId?.substring(0, 10) || 'no-guest',
    ].join(':');
  }

  /**
   * Bootstrap via Titan API endpoint (single-request optimization)
   * 
   * This method uses the Titan bootstrap endpoint which performs all
   * resolution server-side, reducing network round-trips.
   * 
   * Use this for production for optimal performance.
   */
  async bootstrapViaTitan(
    context: BootstrapContext,
    options: BootstrapOptions = {}
  ): Promise<SessionBootstrapState> {
    const startTime = performance.now();
    const hints = parseBootstrapHints(context);

    try {
      // Build request body
      // CRITICAL: Ensure reportId is always sent if present (not empty string)
      const validReportId = context.reportId?.trim() || undefined;
      
      // ✅ CRITICAL FIX: Only include mode if it's a valid value ('edit' or 'view')
      // The Zod schema on the backend only accepts these two values, so invalid values cause 400 errors
      // Mercury may send mode=accountant in the URL, but we should NOT send this to Titan
      const validMode = context.mode === 'edit' || context.mode === 'view' ? context.mode : undefined;
      
      const requestBody = {
        reportId: validReportId,
        clientToken: context.clientToken,
        prefilledQuery: context.prefilledQuery,
        guestSessionId: context.guestSessionId,
        flow: context.flow,
        // ✅ CRITICAL: Only include mode if it's valid - omit entirely if invalid (don't send mode=accountant)
        ...(validMode && { mode: validMode }),
        version: context.version,
        locale: context.locale,
      };
      
      // ✅ DEBUG LOGGING: Log mode filtering to trace issues
      if (context.mode && !validMode) {
        this.logger.warn('[Bootstrap] Filtered out invalid mode value', {
          invalidMode: context.mode,
          note: 'Only "edit" or "view" are valid - mode will be omitted from request',
        });
      }

      // CRITICAL LOGGING: Log exactly what we're sending to debug ID mismatch
      this.logger.info('[Bootstrap] Sending to Titan API', {
        reportIdFromContext: context.reportId?.substring(0, 25) || 'none',
        reportIdInRequest: validReportId?.substring(0, 25) || 'none',
        reportIdLength: validReportId?.length || 0,
      });

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      if (context.guestSessionId) {
        headers['X-Guest-Session-Id'] = context.guestSessionId;
      }

      // ✅ CRITICAL FIX: Add client context headers for accountant flow
      // These headers are required for Titan to identify the client and accountant
      // ALWAYS check the store for client context, not just when clientToken is present
      // This allows accountant flows to work even when URL doesn't have clientToken
      try {
        // Try to get client context from store (set by exchange-client-context or BootstrapSync)
        const { useClientContext } = await import('../../stores/clientContext');
        const clientContextState = useClientContext.getState();
        
        if (clientContextState.isActingAsClient && clientContextState.client && clientContextState.accountant) {
          // ✅ CRITICAL FIX: Use correct header names expected by Titan bootstrap controller
          // Bootstrap controller expects: X-Client-User-Id, X-Accountant-User-Id, X-Relationship-Id
          headers['X-Client-User-Id'] = clientContextState.client.id;
          headers['X-Accountant-User-Id'] = clientContextState.accountant.id;
          if (clientContextState.relationshipId) {
            headers['X-Relationship-Id'] = clientContextState.relationshipId;
          }
          
          this.logger.info('[Bootstrap] Added client context headers from store', {
            clientUserId: clientContextState.client.id.substring(0, 8) + '...',
            accountantUserId: clientContextState.accountant.id.substring(0, 8) + '...',
            relationshipId: clientContextState.relationshipId?.substring(0, 8) + '...' || 'none',
            hasClientToken: hints.hasClientToken || !!context.clientToken,
          });
        } else if (hints.hasClientToken || context.clientToken) {
          // Only warn if clientToken was present but context not in store
          this.logger.warn('[Bootstrap] Client token present but client context not in store yet', {
            hasClientToken: hints.hasClientToken,
            isActingAsClient: clientContextState.isActingAsClient,
            hasClient: !!clientContextState.client,
            hasAccountant: !!clientContextState.accountant,
            hasRelationshipId: !!clientContextState.relationshipId,
          });
        }
      } catch (error) {
        this.logger.warn('[Bootstrap] Failed to get client context headers (non-critical)', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // ✅ CRITICAL: Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      try {
        // Call Venus proxy route (which forwards to Titan)
        const response = await fetch('/api/bootstrap', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error('[Bootstrap] Bootstrap API failed', {
            status: response.status,
            statusText: response.statusText,
            error: errorText.substring(0, 200),
          });
          throw new Error(`Bootstrap API failed (${response.status}): ${errorText.substring(0, 100)}`);
        }

        const data = await response.json();

        // ✅ CREDIT CHECK: Handle credit errors gracefully
        if (!data.success) {
          // Check if this is a credit error
          if (data.data?.creditStatus && !data.data.creditStatus.allowed) {
            // Credit check failed - return state with credit error
            const { identity, report, prefill, ui, creditStatus } = data.data;
            return {
              identity: identity ? {
                type: identity.type,
                userId: identity.userId,
                guestSessionId: identity.guestSessionId,
                clientContext: identity.clientContext,
                email: identity.email,
                firstName: identity.firstName,
                lastName: identity.lastName,
              } : DEFAULT_IDENTITY,
              report: report ? {
                mode: report.mode,
                reportId: report.reportId || context.reportId || generateReportId(),
                hasExistingData: report.hasExistingData || false,
                version: report.version,
                status: report.status || 'active',
                createdAt: report.createdAt ? new Date(report.createdAt) : undefined,
                updatedAt: report.updatedAt ? new Date(report.updatedAt) : undefined,
                completedAt: report.completedAt ? new Date(report.completedAt) : undefined,
                currentStep: report.currentStep,
              } : DEFAULT_REPORT,
              prefillData: prefill ? {
                sources: prefill.sources || [],
                companyInfo: prefill.companyInfo,
                financials: prefill.financials,
                businessType: prefill.businessType,
                kboData: prefill.kboData,
                confidence: prefill.confidence || 0,
                fieldsPopulated: prefill.fieldsPopulated || [],
                fieldsRemaining: prefill.fieldsRemaining || [],
              } : DEFAULT_PREFILL,
              ui: ui ? {
                showWelcomeBack: ui.showWelcomeBack || false,
                resumableSession: ui.resumableSession || false,
                suggestedFlow: ui.suggestedFlow || 'manual',
                prefilledFieldCount: ui.prefilledFieldCount || 0,
                totalFieldCount: ui.totalFieldCount || 0,
                showKboVerification: ui.showKboVerification || false,
                showAccountantBanner: ui.showAccountantBanner || false,
                returnUrl: ui.returnUrl,
                sourceApp: ui.sourceApp,
              } : DEFAULT_UI_HINTS,
              creditStatus: creditStatus, // Include credit status
              bootstrapVersion: BOOTSTRAP_VERSION,
              bootstrappedAt: new Date(),
              bootstrapDurationMs: performance.now() - startTime,
            };
          }
          // Other errors - throw as before
          throw new Error(data.error || 'Bootstrap returned no data');
        }

        if (!data.data) {
          throw new Error('Bootstrap returned no data');
        }

        // Transform Titan response to SessionBootstrapState
        const { identity, report, prefill, ui, creditStatus } = data.data;

        const state: SessionBootstrapState = {
        identity: {
          type: identity.type,
          userId: identity.userId,
          guestSessionId: identity.guestSessionId,
          clientContext: identity.clientContext,
          email: identity.email,
          firstName: identity.firstName,
          lastName: identity.lastName,
        },
        report: {
          mode: report.mode,
          reportId: report.reportId,
          hasExistingData: report.hasExistingData,
          version: report.version,
          status: report.status,
          createdAt: report.createdAt ? new Date(report.createdAt) : undefined,
          updatedAt: report.updatedAt ? new Date(report.updatedAt) : undefined,
          completedAt: report.completedAt ? new Date(report.completedAt) : undefined,
          currentStep: report.currentStep,
        },
        prefillData: {
          sources: prefill.sources,
          companyInfo: prefill.companyInfo,
          financials: prefill.financials,
          businessType: prefill.businessType,
          kboData: prefill.kboData,
          confidence: prefill.confidence,
          fieldsPopulated: prefill.fieldsPopulated,
          fieldsRemaining: prefill.fieldsRemaining,
        },
        ui: {
          showWelcomeBack: ui.showWelcomeBack,
          resumableSession: ui.resumableSession,
          suggestedFlow: ui.suggestedFlow,
          prefilledFieldCount: ui.prefilledFieldCount,
          totalFieldCount: ui.totalFieldCount,
          showKboVerification: ui.showKboVerification,
          showAccountantBanner: ui.showAccountantBanner,
          returnUrl: context.returnUrl,
          sourceApp: context.sourceApp,
        },
        creditStatus: creditStatus, // Include credit status if present
        bootstrapVersion: BOOTSTRAP_VERSION,
        bootstrappedAt: new Date(),
        bootstrapDurationMs: data.bootstrapDurationMs || (performance.now() - startTime),
      };

        this.logger.info('[Bootstrap] Titan API bootstrap complete', {
          durationMs: state.bootstrapDurationMs,
          identityType: state.identity.type,
          reportMode: state.report.mode,
          prefillConfidence: state.prefillData.confidence.toFixed(2),
        });

        return state;
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('Bootstrap request timed out after 30 seconds');
        }
        throw fetchError;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn('[Bootstrap] Titan API failed, falling back to client-side', {
        error: errorMessage,
      });

      // Fall back to client-side resolution
      return this.bootstrap(context, options);
    }
  }
}

// Export singleton instance for convenience
export const bootstrapService = new SessionBootstrapService(
  authResolver,
  sessionResolver,
  prefillResolver
);
