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

import { AuthResolver, authResolver } from './resolvers/AuthResolver';
import { PrefillResolver, prefillResolver } from './resolvers/PrefillResolver';
import { SessionResolver, sessionResolver } from './resolvers/SessionResolver';
import { looksLikeExistingReportId, getIdentifierType } from '../../utils/identifiers';
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
} from './types';
import {
  BOOTSTRAP_ERROR_CODES,
  BOOTSTRAP_VERSION,
  DEFAULT_BOOTSTRAP_STATE,
  DEFAULT_IDENTITY,
  DEFAULT_PREFILL,
  DEFAULT_REPORT,
  DEFAULT_UI_HINTS,
} from './types';
import { generateReportId, parseBootstrapHints, parseUrlToContext, truncateForLog } from './utils';
import { getInitTraceId } from '../auth';

interface BootstrapOptions {
  /** Timeout for bootstrap process in ms */
  timeout?: number;
  /** Skip auth resolution (for server-side where cookies aren't available) */
  skipAuth?: boolean;
  /** Use cached bootstrap if available */
  useCache?: boolean;
}

const DEFAULT_OPTIONS: BootstrapOptions = {
  timeout: 10000, // Reduced from 15s - auth wait optimization makes this safer
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
   * Sync client context from bootstrap response to Zustand store
   * 
   * This ensures the useClientContext store always has the correct context
   * from the authoritative bootstrap response, preventing stale localStorage data
   * from causing access issues on subsequent requests.
   */
  private async syncClientContext(identity: IdentityState): Promise<void> {
    try {
      const { useClientContext } = await import('../../stores/clientContext');
      const contextStore = useClientContext.getState();
      
      if (identity.type === 'accountant_for_client' && identity.clientContext) {
        // Accountant-for-client flow: Update store with bootstrap context
        // Transform bootstrap ClientContext to ClientContextResponseDto format
        const bootstrapContext = identity.clientContext;
        
        // Check if context is different from stored context
        const storedClientId = contextStore.client?.id;
        const storedRelationshipId = contextStore.relationshipId;
        
        if (storedClientId !== bootstrapContext.clientUserId || 
            storedRelationshipId !== bootstrapContext.relationshipId) {
          this.logger.info('[Bootstrap] Syncing client context from bootstrap response', {
            oldClientId: storedClientId?.substring(0, 8) || 'none',
            newClientId: bootstrapContext.clientUserId.substring(0, 8),
            oldRelationshipId: storedRelationshipId?.substring(0, 8) || 'none',
            newRelationshipId: bootstrapContext.relationshipId.substring(0, 8),
          });
          
          // Set the context using the store's method
          contextStore.setClientContext({
            accountantUser: {
              id: bootstrapContext.accountantUserId,
              email: bootstrapContext.accountantEmail || '',
              full_name: '', // Not available from bootstrap, but not critical
            },
            clientUser: {
              id: bootstrapContext.clientUserId,
              email: bootstrapContext.clientEmail || '',
              full_name: bootstrapContext.clientCompanyName || '',
              avatar_url: null,
            },
            relationship: {
              id: bootstrapContext.relationshipId,
              customer_name: bootstrapContext.clientCompanyName || '',
            },
          });
        }
      } else if (identity.type === 'authenticated' && contextStore.isActingAsClient) {
        // Direct authenticated flow but store has stale client context
        // This can happen when accountant switches back to their own account
        // but localStorage still has old client context
        this.logger.warn('[Bootstrap] Clearing stale client context', {
          storedClientId: contextStore.client?.id?.substring(0, 8) || 'none',
          identityType: identity.type,
          note: 'Bootstrap returned authenticated identity but store had client context',
        });
        
        contextStore.clearClientContext();
      }
    } catch (error) {
      // Non-critical - log but don't fail bootstrap
      this.logger.warn('[Bootstrap] Failed to sync client context (non-critical)', {
        error: error instanceof Error ? error.message : String(error),
      });
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
   * Generate cache key for deduplication.
   * 
   * IMPORTANT: Only use reportId — do NOT include clientToken because
   * auth.ts sanitizes the URL (strips clientToken) after the first call.
   * Including it would cause a second call to miss the in-flight cache.
   */
  private getCacheKey(context: BootstrapContext): string {
    return context.reportId || 'new';
  }

  /**
   * Wait for auth to be ready before making bootstrap API call
   * 
   * PERFORMANCE OPTIMIZATION:
   * - Reduced max wait from 5s to 1s for faster page loads
   * - Skip wait entirely if auth already loaded or we have a valid token cookie
   * - Poll interval reduced from 100ms to 50ms for faster response
   */
  private async waitForAuth(maxWaitMs: number): Promise<boolean> {
    const { useAuthStore } = await import('../auth');
    const start = Date.now();
    
    // OPTIMIZATION: Check if auth is already ready (common case)
    const initialState = useAuthStore.getState();
    if (!initialState.loading && (initialState.user || initialState.error)) {
      return true;
    }
    
    // OPTIMIZATION: Check for existing token cookie - if present, skip wait
    // The API call will use the cookie for auth, no need to wait for store
    if (typeof document !== 'undefined') {
      const hasTokenCookie = document.cookie.includes('upswitch_access_token') || 
                             document.cookie.includes('sb-') // Supabase tokens
      if (hasTokenCookie) {
        this.logger.debug('[Bootstrap] Token cookie found, skipping auth wait');
        return true;
      }
    }
    
    // Poll with shorter interval for faster response
    while (Date.now() - start < maxWaitMs) {
      const { loading, user, error } = useAuthStore.getState();
      if (!loading && (user || error)) {
        return true;
      }
      await new Promise(r => setTimeout(r, 50)); // Reduced from 100ms
    }
    
    return false;
  }

  /**
   * Make bootstrap API request with retry logic for 401 errors
   * Handles race condition where token refresh may not have completed
   */
  private async makeBootstrapRequest(
    requestBody: Record<string, unknown>,
    headers: Record<string, string>,
    traceId: string
  ): Promise<Response> {
    const maxRetries = 3;
    const baseDelay = 500; // 500ms initial delay
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        const response = await fetch('/api/bootstrap', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        // Handle 401 specifically - auth token may still be refreshing
        if (response.status === 401 && attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          this.logger.warn(`[Bootstrap:${traceId}] 401 on attempt ${attempt + 1}/${maxRetries}, retrying in ${delay}ms`, {
            note: 'Auth token may still be refreshing',
          });
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        
        // Handle 5xx server errors - these are typically retryable
        if (response.status >= 500 && attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          this.logger.warn(`[Bootstrap:${traceId}] Server error ${response.status} on attempt ${attempt + 1}/${maxRetries}, retrying in ${delay}ms`, {
            note: 'Server error may be transient',
          });
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        
        // Handle 408/504 timeout errors - also retryable
        if ((response.status === 408 || response.status === 504) && attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          this.logger.warn(`[Bootstrap:${traceId}] Timeout ${response.status} on attempt ${attempt + 1}/${maxRetries}, retrying in ${delay}ms`, {
            note: 'Request timed out - may succeed on retry',
          });
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        
        return response;
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('Bootstrap request timed out after 30 seconds');
        }
        
        // Retry network errors on non-final attempts
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          this.logger.warn(`[Bootstrap:${traceId}] Network error on attempt ${attempt + 1}/${maxRetries}, retrying in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        
        throw fetchError;
      }
    }
    
    // Should not reach here, but TypeScript needs this
    throw new Error('Bootstrap failed after all retries');
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
    const cacheKey = `titan:${this.getCacheKey(context)}`;

    // Dedup: return in-flight request if one exists for the same reportId
    const inflight = this.bootstrapPromiseCache.get(cacheKey);
    if (inflight) {
      this.logger.info('[Bootstrap] Returning in-flight Titan request (dedup)');
      return inflight;
    }

    const promise = this._executeBootstrapViaTitan(context, options);
    this.bootstrapPromiseCache.set(cacheKey, promise);

    try {
      return await promise;
    } finally {
      this.bootstrapPromiseCache.delete(cacheKey);
    }
  }

  private async _executeBootstrapViaTitan(
    context: BootstrapContext,
    options: BootstrapOptions = {}
  ): Promise<SessionBootstrapState> {
    const startTime = performance.now();
    const hints = parseBootstrapHints(context);
    const traceId = getInitTraceId() || 'unknown';

    this.logger.info(`[Bootstrap:${traceId}] Starting Titan API bootstrap`, {
      reportId: context.reportId?.substring(0, 20) || 'new',
      hasClientToken: hints.hasClientToken,
    });

    try {
      // PERFORMANCE: Reduced auth wait from 5s to 1s for faster page loads
      // The optimized waitForAuth now skips wait if token cookie exists
      const authReady = await this.waitForAuth(1000);
      if (!authReady) {
        this.logger.warn(`[Bootstrap:${traceId}] Auth not ready after 1s timeout, proceeding anyway`);
      }

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
        clientId: context.clientId, // Pass clientId for accountant flow verification
        prefilledQuery: context.prefilledQuery,
        flow: context.flow,
        // CRITICAL: Only include mode if it's valid - omit entirely if invalid (don't send mode=accountant)
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

      // BANK GRADE: Add client context headers using the store's getContextHeaders()
      // This uses standardized header names: X-Client-User-Id, X-Accountant-User-Id, X-Relationship-Id
      // AuthGate ensures client context is in the store BEFORE bootstrap runs
      try {
        const { useClientContext } = await import('../../stores/clientContext');
        const contextHeaders = useClientContext.getState().getContextHeaders();
        
        if (Object.keys(contextHeaders).length > 0) {
          Object.assign(headers, contextHeaders);
          
          this.logger.info('[Bootstrap] Added client context headers from store', {
            headerCount: Object.keys(contextHeaders).length,
            hasClientToken: hints.hasClientToken || !!context.clientToken,
          });
        } else if (hints.hasClientToken || context.clientToken) {
          // Only warn if clientToken was present but context not in store
          this.logger.warn('[Bootstrap] Client token present but client context not in store', {
            note: 'AuthGate should have ensured context is ready before bootstrap',
          });
        }
      } catch (error) {
        this.logger.warn('[Bootstrap] Failed to get client context headers (non-critical)', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // BANK GRADE: Make request with retry logic for 401 errors
      const response = await this.makeBootstrapRequest(requestBody, headers, traceId);

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

        // ✅ STRUCTURED ERROR HANDLING: Check errorInfo for smarter error handling
        if (!data.success) {
          // Extract structured error info if available
          const errorInfo: BootstrapErrorInfo | undefined = data.errorInfo;
          
          // Log structured error details for debugging
          if (errorInfo) {
            this.logger.warn(`[Bootstrap:${traceId}] Received structured error`, {
              code: errorInfo.code,
              message: errorInfo.message,
              retryable: errorInfo.retryable,
            });
          }

          // Check if this is a credit error (allow viewing with limited data)
          if (data.data?.creditStatus && !data.data.creditStatus.allowed) {
            // Credit check failed - return state with credit error
            const { identity, report, prefill, ui, creditStatus } = data.data;
            return {
              identity: identity ? {
                type: identity.type,
                userId: identity.userId,
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

          // Check if error is retryable based on structured error info
          const isRetryableError = errorInfo?.retryable ?? false;
          const errorCode = errorInfo?.code || 'UNKNOWN';
          
          // Create rich error message
          const errorMessage = errorInfo 
            ? `[${errorCode}] ${errorInfo.message}${isRetryableError ? ' (retryable)' : ''}`
            : (data.error || 'Bootstrap returned no data');
          
          // For retryable errors, we could implement automatic retry here
          // For now, just throw with additional context
          const error = new Error(errorMessage);
          (error as any).code = errorCode;
          (error as any).retryable = isRetryableError;
          throw error;
        }

        if (!data.data) {
          throw new Error('Bootstrap returned no data');
        }

        // Transform Titan response to SessionBootstrapState
        const { identity, report, prefill, ui, creditStatus, valuationPackage } = data.data;

        const state: SessionBootstrapState = {
        identity: {
          type: identity.type,
          userId: identity.userId,
          clientContext: identity.clientContext,
          email: identity.email,
          firstName: identity.firstName,
          lastName: identity.lastName,
        },
        report: {
          mode: report.mode,
          reportId: report.reportId,
          hasExistingData: report.hasExistingData,
          // WORLD-CLASS: Mark as having valuation result if package has HTML
          hasValuationResult: report.hasValuationResult || !!valuationPackage?.htmlReport,
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
        // WORLD-CLASS: Extract valuationPackage for instant UI hydration
        valuationPackage: valuationPackage ? {
          htmlReport: valuationPackage.htmlReport || null,
          infoTabHtml: valuationPackage.infoTabHtml || null,
          pricingRange: valuationPackage.pricingRange || null,
          versions: valuationPackage.versions || { current: 1, total: 1 },
          pdf: valuationPackage.pdf || { url: null, status: 'none' },
        } : undefined,
        bootstrapVersion: BOOTSTRAP_VERSION,
        bootstrappedAt: new Date(),
        bootstrapDurationMs: data.bootstrapDurationMs || (performance.now() - startTime),
      };
      
      // WORLD-CLASS: Log valuationPackage presence for debugging
      if (valuationPackage) {
        this.logger.info(`[Bootstrap:${traceId}] Received valuationPackage`, {
          hasHtmlReport: !!valuationPackage.htmlReport,
          hasInfoTab: !!valuationPackage.infoTabHtml,
          hasPricing: !!valuationPackage.pricingRange,
          versionCount: valuationPackage.versions?.total,
          pdfStatus: valuationPackage.pdf?.status,
        });
      }

      // ✅ FIX: Retry if session was expected but not found
      // This handles race condition where auth token was stale during first request
      // 
      // CRITICAL: Handle BOTH ID formats using centralized identifier utilities:
      // - val_xxx: Direct Venus session key format
      // - UUID: Mercury passes valuation_reports.id (UUID format)
      const urlIndicatesExisting = looksLikeExistingReportId(context.reportId);
      
      if (state.report.mode === 'new' && context.reportId && urlIndicatesExisting) {
        this.logger.warn(`[Bootstrap:${traceId}] Session not found for existing reportId - retrying once`, {
          reportId: context.reportId.substring(0, 25),
          mode: state.report.mode,
          identifierType: getIdentifierType(context.reportId),
        });
        
        // Wait for auth to fully stabilize
        await new Promise(r => setTimeout(r, 1000));
        
        // Retry the request
        const retryResponse = await this.makeBootstrapRequest(requestBody, headers, `${traceId}-retry`);
        
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          
          if (retryData.success && retryData.data) {
            const { identity: retryIdentity, report: retryReport, prefill: retryPrefill, ui: retryUi, creditStatus: retryCreditStatus } = retryData.data;
            
            // If retry found the session, use that instead
            if (retryReport.mode === 'existing') {
              this.logger.info(`[Bootstrap:${traceId}] Retry found existing session`, {
                reportId: retryReport.reportId?.substring(0, 25),
              });
              
              const retryState: SessionBootstrapState = {
                identity: {
                  type: retryIdentity.type,
                  userId: retryIdentity.userId,
                  clientContext: retryIdentity.clientContext,
                  email: retryIdentity.email,
                  firstName: retryIdentity.firstName,
                  lastName: retryIdentity.lastName,
                },
                report: {
                  mode: retryReport.mode,
                  reportId: retryReport.reportId,
                  hasExistingData: retryReport.hasExistingData,
                  version: retryReport.version,
                  status: retryReport.status,
                  createdAt: retryReport.createdAt ? new Date(retryReport.createdAt) : undefined,
                  updatedAt: retryReport.updatedAt ? new Date(retryReport.updatedAt) : undefined,
                  completedAt: retryReport.completedAt ? new Date(retryReport.completedAt) : undefined,
                  currentStep: retryReport.currentStep,
                },
                prefillData: {
                  sources: retryPrefill?.sources || [],
                  companyInfo: retryPrefill?.companyInfo,
                  financials: retryPrefill?.financials,
                  businessType: retryPrefill?.businessType,
                  kboData: retryPrefill?.kboData,
                  confidence: retryPrefill?.confidence || 0,
                  fieldsPopulated: retryPrefill?.fieldsPopulated || [],
                  fieldsRemaining: retryPrefill?.fieldsRemaining || [],
                },
                ui: {
                  showWelcomeBack: retryUi?.showWelcomeBack || false,
                  resumableSession: retryUi?.resumableSession || false,
                  suggestedFlow: retryUi?.suggestedFlow || 'manual',
                  prefilledFieldCount: retryUi?.prefilledFieldCount || 0,
                  totalFieldCount: retryUi?.totalFieldCount || 0,
                  showKboVerification: retryUi?.showKboVerification || false,
                  showAccountantBanner: retryUi?.showAccountantBanner || false,
                  returnUrl: context.returnUrl,
                  sourceApp: context.sourceApp,
                },
                creditStatus: retryCreditStatus,
                bootstrapVersion: BOOTSTRAP_VERSION,
                bootstrappedAt: new Date(),
                bootstrapDurationMs: performance.now() - startTime,
              };
              
              // Sync client context from bootstrap response
              await this.syncClientContext(retryState.identity);
              
              return retryState;
            }
          }
        }
        
        // Retry didn't help - continue with original 'new' response
        this.logger.warn(`[Bootstrap:${traceId}] Retry still returned 'new' mode - session may not exist or access denied`);
      }

      this.logger.info(`[Bootstrap:${traceId}] Titan API bootstrap complete`, {
        durationMs: state.bootstrapDurationMs,
        identityType: state.identity.type,
        reportMode: state.report.mode,
      });

      // Sync client context from bootstrap response to prevent stale context issues
      await this.syncClientContext(state.identity);

      return state;
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
