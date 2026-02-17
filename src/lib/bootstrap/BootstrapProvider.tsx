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
import { useAuthStore } from '../auth';
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
    
    // ✅ FIX: Double-check auth is stable before proceeding
    // This handles edge cases where runBootstrap is called directly
    // OPTIMISTIC: Mercury flows skip this wait — cookies are already present,
    // the Titan proxy will forward them automatically.
    if (!isFromMercury) {
      const authState = useAuthStore.getState();
      if (authState.loading) {
        console.log('[BootstrapProvider] Auth still loading, waiting 500ms before bootstrap');
        await new Promise(r => setTimeout(r, 500));
        
        // Check again after waiting
        const updatedAuthState = useAuthStore.getState();
        if (updatedAuthState.loading) {
          console.warn('[BootstrapProvider] Auth still loading after wait, proceeding anyway');
        }
      }
    } else {
      console.log('[BootstrapProvider] Mercury flow — skipping auth wait, cookies already present');
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
      // WORLD-CLASS: Only block NEW reports - existing reports should ALWAYS be viewable
      // Users must be able to view their completed valuations regardless of credit status
      const isExistingReport = result.report.mode === 'existing';
      
      if (result.creditStatus && !result.creditStatus.allowed && !isExistingReport) {
        const creditError = result.creditStatus.message || 'Insufficient credits to create valuation';
        setBootstrapError(creditError);
        onBootstrapError?.(creditError);
        
        console.error('[BootstrapProvider] Credit check failed - preventing new valuation', {
          message: creditError,
          upgradePath: result.creditStatus.upgrade_path,
          creditsRemaining: result.creditStatus.credits_remaining,
          reportMode: result.report.mode,
        });
        
        // Still set state so UI can display credit error
        setState(result);
        bootstrapCompletedRef.current = true;
        setBootstrapState(result);
        return;
      }
      
      // Log if existing report viewed with insufficient credits (allowed, but noted)
      if (result.creditStatus && !result.creditStatus.allowed && isExistingReport) {
        console.log('[BootstrapProvider] Viewing existing report despite insufficient credits', {
          reportId: result.report.reportId.substring(0, 20),
          creditsRemaining: result.creditStatus.credits_remaining,
        });
      }

      setState(result);
      bootstrapCompletedRef.current = true;
      
      // Sync with SessionInitializer for backward compatibility
      setBootstrapState(result);
      
      // WORLD-CLASS: Instant hydration from valuationPackage
      // If package is present, hydrate stores immediately for < 100ms render
      if (result.valuationPackage && result.report.mode === 'existing') {
        try {
          const { SessionRestorationService } = await import('../../services/session/SessionRestorationService');
          SessionRestorationService.hydrateFromPackage(
            result.report.reportId,
            result.valuationPackage,
            result.ui.suggestedFlow || 'manual'
          );
          console.log('[BootstrapProvider] WORLD-CLASS: Instant hydration complete', {
            reportId: result.report.reportId.substring(0, 20),
            hasHtmlReport: !!result.valuationPackage.htmlReport,
          });
        } catch (hydrationError) {
          console.warn('[BootstrapProvider] Package hydration failed - triggering full restoration', {
            error: hydrationError instanceof Error ? hydrationError.message : String(hydrationError),
          });
          
          // FALLBACK: Trigger full session restoration when package hydration fails
          // This ensures data is loaded even if the fast path fails
          try {
            const { SessionRestorationService } = await import('../../services/session/SessionRestorationService');
            // Check if report has existing data that needs restoration
            if (result.report.hasExistingData) {
              console.log('[BootstrapProvider] Marking report for fallback restoration...', {
                reportId: result.report.reportId.substring(0, 20),
              });
              // Mark for restoration so ManualLayout/ConversationalLayout know to restore
              SessionRestorationService.markForRestoration(result.report.reportId);
            }
          } catch (fallbackError) {
            console.error('[BootstrapProvider] Fallback restoration setup failed', {
              error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
            });
          }
        }
      }
      
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
      
      // Check if this is an authentication error that requires redirect
      if (error instanceof AuthenticationRequiredError) {
        console.log('[BootstrapProvider] Authentication required - redirecting to login', {
          redirectUrl: error.redirectUrl,
          currentUrl: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
        });
        
        // Immediate redirect - no error state, no loading state
        if (typeof window !== 'undefined') {
          window.location.href = error.redirectUrl;
        }
        return; // Stop execution - redirect is happening
      }
      
      // Handle other errors normally
      setBootstrapError(errorMessage);
      onBootstrapError?.(errorMessage);

      console.error('[BootstrapProvider] Bootstrap failed:', errorMessage);
    } finally {
      setIsBootstrapping(false);
    }
  }, [context, method, onBootstrapComplete, onBootstrapError, isFromMercury]);

  // Subscribe to auth state for stability check
  const authLoading = useAuthStore((s) => s.loading);
  const authError = useAuthStore((s) => s.error);
  
  // Auto-bootstrap on mount if no initial state
  // BANK GRADE: AuthGate ensures auth and client context are ready BEFORE this runs
  // We can now trust that client context is in the store (if applicable)
  useEffect(() => {
    // Skip if already started or has initial state
    if (bootstrapStartedRef.current || initialState) {
      return;
    }

    // OPTIMISTIC: Mercury flows start bootstrap immediately — no auth wait, no delay.
    // Cookies from .upswitch.app are already present and the proxy forwards them.
    if (isFromMercury && autoBootstrap) {
      console.log('[BootstrapProvider] Mercury flow — starting bootstrap immediately (no auth wait, no delay)');
      runBootstrap();
      return;
    }
    
    // ✅ FIX: Wait for auth to be stable before running bootstrap
    // This prevents race condition where bootstrap runs with stale/expired token
    if (authLoading) {
      console.log('[BootstrapProvider] Waiting for auth to stabilize before bootstrap');
      return; // Will re-run when authLoading changes
    }
    
    if (autoBootstrap) {
      // Small delay to ensure token refresh has propagated
      // This handles the edge case where authLoading just became false
      // but the new token hasn't been applied to all pending requests yet
      const stabilityDelay = setTimeout(() => {
        if (!bootstrapStartedRef.current) {
          runBootstrap();
        }
      }, 100);
      
      return () => clearTimeout(stabilityDelay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isFromMercury]); // Re-run when auth loading state changes

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
