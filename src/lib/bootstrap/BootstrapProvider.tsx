'use client';

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
} from 'react';
import type {
  BootstrapContext,
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
  REQUIRE_AUTH_FOR_VALUATION,
} from './types';
import { bootstrapService } from './SessionBootstrapService';
import { parseUrlToContext } from './utils';
import { setBootstrapState } from '../sessionInitialization';
import { AuthenticationRequiredError } from './resolvers/AuthResolver';

// ============================================================================
// Context Types
// ============================================================================

interface BootstrapContextValue {
  // State
  state: SessionBootstrapState;
  isBootstrapping: boolean;
  bootstrapError: string | null;

  // Derived state for convenience
  identity: IdentityState;
  report: ReportState;
  prefillData: PrefillData;
  ui: UIHints;
  creditStatus?: SessionBootstrapState['creditStatus']; // Credit status from bootstrap state

  // Convenience booleans
  /** @deprecated Guest flow is no longer supported - always returns false */
  isGuest: boolean;
  isAuthenticated: boolean;
  /** Whether authentication is required (always true in auth-first architecture) */
  requiresAuth: boolean;
  isAccountantFlow: boolean;
  isNewReport: boolean;
  isExistingReport: boolean;
  hasPrefilledData: boolean;

  // Actions
  refreshBootstrap: () => Promise<void>;
  updateIdentity: (identity: Partial<IdentityState>) => void;
  updateReport: (report: Partial<ReportState>) => void;
  updatePrefillData: (prefillData: Partial<PrefillData>) => void;
  updateUIHints: (ui: Partial<UIHints>) => void;
}

// ============================================================================
// Context Creation
// ============================================================================

const BootstrapContext = createContext<BootstrapContextValue | null>(null);

// ============================================================================
// Provider Props
// ============================================================================

interface BootstrapProviderProps {
  children: React.ReactNode;
  /** Initial state from server-side bootstrap (optional) */
  initialState?: SessionBootstrapState;
  /** Bootstrap context for client-side bootstrap (optional) */
  context?: BootstrapContext;
  /** Whether to auto-bootstrap on mount if no initial state */
  autoBootstrap?: boolean;
  /** Bootstrap method: 'titan' uses server API, 'client' uses client-side resolvers */
  method?: 'titan' | 'client';
  /** Callback when bootstrap completes */
  onBootstrapComplete?: (state: SessionBootstrapState) => void;
  /** Callback when bootstrap fails */
  onBootstrapError?: (error: string) => void;
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
  const isFromMercury = React.useMemo(() => {
    if (context?.sourceApp === 'mercury') return true
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search)
      return urlParams.get('source') === 'mercury'
    }
    return false
  }, [context?.sourceApp])
  // State
  const [state, setState] = useState<SessionBootstrapState>(
    initialState || DEFAULT_BOOTSTRAP_STATE
  );
  const [isBootstrapping, setIsBootstrapping] = useState(!initialState && autoBootstrap);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  // CRITICAL FIX: Prevent duplicate bootstrap calls using refs
  // This prevents issues with React Strict Mode double-mounting and
  // prevents race conditions when context changes mid-bootstrap
  const bootstrapStartedRef = useRef(false);
  const bootstrapCompletedRef = useRef(false);
  const contextReportIdRef = useRef(context?.reportId);

  // Bootstrap function
  const runBootstrap = useCallback(async () => {
    // ✅ WORLD CLASS: When from Mercury, ensure unified loading experience
    // Bootstrap will handle all initialization, and ValuationSessionManager will show single loading state
    if (isFromMercury) {
      console.log('[BootstrapProvider] Detected Mercury source - optimizing for unified loading', {
        reportId: context?.reportId,
      })
    }

    // CRITICAL: Guard against duplicate calls
    if (bootstrapStartedRef.current) {
      console.log('[BootstrapProvider] Bootstrap already started, skipping duplicate call', {
        reportId: context?.reportId?.substring(0, 20),
      });
      return;
    }
    
    bootstrapStartedRef.current = true;
    setIsBootstrapping(true);
    setBootstrapError(null);

    const startTime = performance.now();

    try {
      const bootstrapContext = context || parseUrlToContext(
        typeof window !== 'undefined' ? window.location.href : '/'
      );

      // CRITICAL: Log the reportId being sent to bootstrap
      console.log('[BootstrapProvider] Starting bootstrap', {
        contextReportId: bootstrapContext.reportId?.substring(0, 20) || 'none',
        method,
      });

      // Choose bootstrap method
      let result: SessionBootstrapState;
      if (method === 'titan') {
        // Use Titan API for single-request bootstrap (optimal performance)
        result = await bootstrapService.bootstrapViaTitan(bootstrapContext);
      } else {
        // Use client-side resolvers (fallback)
        result = await bootstrapService.bootstrap(bootstrapContext);
      }

      // CRITICAL VALIDATION: Ensure bootstrap returned the correct reportId
      // If we requested a specific reportId and got a different one, that's a bug
      const requestedId = bootstrapContext.reportId?.trim();
      const returnedId = result.report.reportId?.trim();
      
      if (requestedId && requestedId !== returnedId) {
        // This is a critical bug that can cause data to be saved to wrong report!
        console.error(
          '%c⚠️ CRITICAL: Bootstrap returned different reportId than requested!',
          'background: #ff0000; color: white; font-weight: bold; padding: 4px 8px;',
          {
            requested: requestedId.substring(0, 30),
            returned: returnedId?.substring(0, 30),
            mode: result.report.mode,
          }
        );
        
        // ALWAYS override with the requested reportId when there's a mismatch
        result = {
          ...result,
          report: {
            ...result.report,
            reportId: requestedId,
          },
        };
        
        console.log('[BootstrapProvider] Overrode reportId to match URL', {
          finalReportId: requestedId.substring(0, 30),
        });
      }

      // ✅ CREDIT CHECK: Check if credits are insufficient
      // AUTH-FIRST: All users are authenticated, so credit checks always apply
      if (result.creditStatus && !result.creditStatus.allowed) {
        const creditError = result.creditStatus.message || 'Insufficient credits to create valuation';
        setBootstrapError(creditError);
        onBootstrapError?.(creditError);
        
        console.error('[BootstrapProvider] Credit check failed - preventing Venus from opening', {
          message: creditError,
          upgradePath: result.creditStatus.upgrade_path,
          creditsRemaining: result.creditStatus.credits_remaining,
        });
        
        // Still set state so UI can display credit error
        setState(result);
        bootstrapCompletedRef.current = true;
        setBootstrapState(result);
        return;
      }

      setState(result);
      bootstrapCompletedRef.current = true;
      
      // Sync with SessionInitializer for backward compatibility
      setBootstrapState(result);
      
      // AUTH-FIRST: Set session engine for authenticated users
      try {
        const { useSessionStore } = await import('../../store/useSessionStore');
        useSessionStore.getState().setEngine(result.identity);
        console.log('[BootstrapProvider] Session engine set', {
          identityType: result.identity.type,
          engineType: 'AuthenticatedSessionEngine',
        });
      } catch (engineError) {
        console.error('[BootstrapProvider] Failed to set session engine', {
          error: engineError instanceof Error ? engineError.message : String(engineError),
        });
      }
      
      onBootstrapComplete?.(result);

      console.log('[BootstrapProvider] Bootstrap complete', {
        method,
        reportId: result.report.reportId.substring(0, 20),
        identityType: result.identity.type,
        reportMode: result.report.mode,
        prefillConfidence: result.prefillData.confidence.toFixed(2),
        durationMs: result.bootstrapDurationMs,
        creditStatus: result.creditStatus ? {
          allowed: result.creditStatus.allowed,
          creditsRemaining: result.creditStatus.credits_remaining,
        } : 'not checked',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setBootstrapError(errorMessage);
      onBootstrapError?.(errorMessage);

      console.error('[BootstrapProvider] Bootstrap failed:', errorMessage);
    } finally {
      setIsBootstrapping(false);
    }
  }, [context, method, onBootstrapComplete, onBootstrapError, isFromMercury]);

  // Auto-bootstrap on mount if no initial state
  // CRITICAL: Only run once, ignoring subsequent renders
  // ✅ FIX: Wait for client context to be ready if clientToken is present
  useEffect(() => {
    // Skip if already started or has initial state
    if (bootstrapStartedRef.current || initialState) {
      return;
    }
    
    if (autoBootstrap) {
      // ✅ CRITICAL FIX: If clientToken is present in URL, wait for client context to be initialized
      // This ensures bootstrap has access to client context headers
      // NOTE: We only wait if clientToken is in URL, not if it's in localStorage (existing session)
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const hasClientTokenInUrl = context?.clientToken || urlParams?.get('clientToken');
      
      if (hasClientTokenInUrl) {
        // ✅ CRITICAL FIX: Wait for client context with timeout to prevent infinite hanging
        // If client context exchange takes too long, proceed anyway - Titan bootstrap can handle clientToken
        const waitForClientContext = async () => {
          try {
            // Import waitForClientContext from auth.ts - uses the actual promise
            const { waitForClientContext } = await import('../auth');
            
            // ✅ FIX: Add timeout to prevent infinite waiting
            // If client context exchange hangs, proceed after 5 seconds
            const timeoutPromise = new Promise<void>((resolve) => {
              setTimeout(() => {
                console.warn('[BootstrapProvider] Client context wait timeout (5s), proceeding with bootstrap');
                resolve();
              }, 5000); // 5 second timeout - increased from 3s
            });
            
            // Race between client context promise and timeout
            await Promise.race([
              waitForClientContext().catch((error) => {
                // If promise rejects, log but don't throw - we'll proceed anyway
                console.warn('[BootstrapProvider] Client context promise rejected, proceeding', error);
              }),
              timeoutPromise,
            ]);
            
            // Verify context is actually set before proceeding
            const { useClientContext } = await import('../../stores/clientContext');
            const clientContextState = useClientContext.getState();

            console.log('[BootstrapProvider] Checking client context state after wait', {
              isActingAsClient: clientContextState.isActingAsClient,
              hasClient: !!clientContextState.client,
              hasAccountant: !!clientContextState.accountant,
              hasRelationshipId: !!clientContextState.relationshipId,
              clientId: clientContextState.client?.id?.substring(0, 8) + '...' || 'none',
              accountantId: clientContextState.accountant?.id?.substring(0, 8) + '...' || 'none',
            });

            if (clientContextState.isActingAsClient && clientContextState.client && clientContextState.accountant) {
              console.log('[BootstrapProvider] Client context ready, starting bootstrap', {
                clientUserId: clientContextState.client.id.substring(0, 8) + '...',
              });
              runBootstrap();
            } else {
              // Context exchange completed but context not set - start bootstrap anyway
              // Titan bootstrap will handle clientToken from request body
              console.warn('[BootstrapProvider] Client context exchange completed but context not fully established, starting bootstrap anyway', {
                reason: !clientContextState.isActingAsClient ? 'not acting as client' :
                       !clientContextState.client ? 'missing client' :
                       !clientContextState.accountant ? 'missing accountant' : 'unknown',
              });
              runBootstrap();
            }
          } catch (error) {
            // Context exchange failed - start bootstrap anyway (Titan will handle clientToken)
            console.warn('[BootstrapProvider] Client context exchange failed, starting bootstrap anyway', error);
            runBootstrap();
          }
        };
        
        waitForClientContext();
      } else {
        // No client token - start bootstrap immediately
        runBootstrap();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps = run only on mount

  // AUTH-FIRST: Update engine when identity changes
  useEffect(() => {
    if (state.identity && state.identity.type) {
      try {
        const { useSessionStore } = require('../../store/useSessionStore');
        useSessionStore.getState().setEngine(state.identity);
      } catch (error) {
        console.error('[BootstrapProvider] Failed to set session engine on identity change', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }, [state.identity.type, state.identity.userId]);

  // Update functions
  const updateIdentity = useCallback((identity: Partial<IdentityState>) => {
    setState((prev) => {
      const updatedIdentity = { ...prev.identity, ...identity };
      
      // AUTH-FIRST: Update engine when identity changes
      try {
        const { useSessionStore } = require('../../store/useSessionStore');
        useSessionStore.getState().setEngine(updatedIdentity);
      } catch (error) {
        console.error('[BootstrapProvider] Failed to set session engine on identity update', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      
      return {
        ...prev,
        identity: updatedIdentity,
      };
    });
  }, []);

  const updateReport = useCallback((report: Partial<ReportState>) => {
    setState((prev) => ({
      ...prev,
      report: { ...prev.report, ...report },
    }));
  }, []);

  const updatePrefillData = useCallback((prefillData: Partial<PrefillData>) => {
    setState((prev) => ({
      ...prev,
      prefillData: { ...prev.prefillData, ...prefillData },
    }));
  }, []);

  const updateUIHints = useCallback((ui: Partial<UIHints>) => {
    setState((prev) => ({
      ...prev,
      ui: { ...prev.ui, ...ui },
    }));
  }, []);

  // Context value with memoization
  const value = useMemo<BootstrapContextValue>(() => ({
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
    isAuthenticated: state.identity.type === 'authenticated' || state.identity.type === 'accountant_for_client',
    requiresAuth: REQUIRE_AUTH_FOR_VALUATION,
    isAccountantFlow: state.identity.type === 'accountant_for_client',
    isNewReport: state.report.mode === 'new',
    isExistingReport: state.report.mode === 'existing',
    hasPrefilledData: state.prefillData.confidence > 0.1,

    // Actions
    refreshBootstrap: runBootstrap,
    updateIdentity,
    updateReport,
    updatePrefillData,
    updateUIHints,
  }), [
    state,
    isBootstrapping,
    bootstrapError,
    runBootstrap,
    updateIdentity,
    updateReport,
    updatePrefillData,
    updateUIHints,
  ]);

  return (
    <BootstrapContext.Provider value={value}>
      {children}
    </BootstrapContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Use bootstrap context - throws if not within provider
 */
export function useBootstrap(): BootstrapContextValue {
  const context = useContext(BootstrapContext);
  if (!context) {
    throw new Error('useBootstrap must be used within a BootstrapProvider');
  }
  return context;
}

/**
 * Use bootstrap context - returns null if not within provider (safe version)
 */
export function useBootstrapSafe(): BootstrapContextValue | null {
  return useContext(BootstrapContext);
}

/**
 * Use identity from bootstrap
 */
export function useBootstrapIdentity(): IdentityState {
  const { identity } = useBootstrap();
  return identity;
}

/**
 * Use report from bootstrap
 */
export function useBootstrapReport(): ReportState {
  const { report } = useBootstrap();
  return report;
}

/**
 * Use prefill data from bootstrap
 */
export function useBootstrapPrefill(): PrefillData {
  const { prefillData } = useBootstrap();
  return prefillData;
}

/**
 * Use UI hints from bootstrap
 */
export function useBootstrapUI(): UIHints {
  const { ui } = useBootstrap();
  return ui;
}

/**
 * Check if bootstrap is complete
 */
export function useIsBootstrapComplete(): boolean {
  const context = useBootstrapSafe();
  if (!context) return false;
  return !context.isBootstrapping && !context.bootstrapError;
}

// ============================================================================
// Default Export
// ============================================================================

export default BootstrapProvider;
