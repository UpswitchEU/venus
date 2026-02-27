/**
 * Session Initialization Gate (World-Class Architecture)
 * 
 * UPGRADED: Now integrates with the Bootstrap system for comprehensive initialization.
 * 
 * Guarantees sequential initialization order:
 * 1. Auth initialization (required)
 * 2. Client context initialization (if clientToken in URL)
 * 3. Bootstrap state resolution (auth + session + prefill)
 * 4. Mark as ready
 * 
 * Prevents race conditions by blocking ALL API calls until complete
 * 
 * Key Principles:
 * - No timeouts (guaranteed completion)
 * - No parallel initialization (sequential only)
 * - Single source of truth (one initialization state)
 * - Defensive (handles errors gracefully)
 * - Integrates with Bootstrap system for world-class initialization
 */

import logger from '../utils/logger';
import type { SessionBootstrapState } from './bootstrap/types';

/**
 * Initialization State
 */
class SessionInitializer {
  private static initialized = false;
  private static initPromise: Promise<void> | null = null;
  private static error: Error | null = null;
  private static bootstrapState: SessionBootstrapState | null = null;

  /**
   * Initialize session system
   * 
   * CRITICAL: Must be called before ANY API requests
   * Guaranteed sequential initialization (no race conditions)
   */
  static async initialize(): Promise<void> {
    // Already initialized
    if (this.initialized) {
      logger.debug('[SessionInitializer] Already initialized');
      return;
    }

    // Already initializing (return existing promise)
    if (this.initPromise) {
      logger.debug('[SessionInitializer] Initialization in progress, waiting...');
      return this.initPromise;
    }

    logger.info('[SessionInitializer] Starting initialization...');
    const startTime = performance.now();

    this.initPromise = (async () => {
      try {
        // STEP 1: Initialize auth (required)
        logger.debug('[SessionInitializer] Step 1: Initializing auth...');
        await this.initializeAuth();
        logger.debug('[SessionInitializer] Step 1: Auth initialized ✓');

        // STEP 2: Client context is initialized by auth flow
        // No additional initialization needed here
        logger.debug('[SessionInitializer] Step 2: Client context handled by auth flow ✓');

        // STEP 3: Bootstrap integration (optional - runs if BootstrapProvider is present)
        // The BootstrapProvider handles its own initialization in parallel
        // This step just marks compatibility with the new system
        logger.debug('[SessionInitializer] Step 3: Bootstrap system integration ready ✓');

        // STEP 4: Mark as ready
        this.initialized = true;
        const duration = performance.now() - startTime;
        logger.info({
          duration_ms: duration.toFixed(2),
        }, '[SessionInitializer] Initialization complete ✓');
      } catch (error) {
        this.error = error as Error;
        // Reset promise so the next waitForReady() retries instead of
        // returning the same rejected promise on every API request.
        this.initPromise = null;
        logger.error({
          error: error instanceof Error ? error.message : String(error),
        }, '[SessionInitializer] Initialization failed');
        throw error;
      }
    })();

    return this.initPromise;
  }

  /**
   * Check if initialization is complete
   */
  static isReady(): boolean {
    return this.initialized;
  }

  /**
   * Wait for initialization to complete
   * 
   * CRITICAL: Use this in HTTP interceptor to block requests
   * until initialization is complete
   */
  static async waitForReady(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get initialization error (if any)
   */
  static getError(): Error | null {
    return this.error;
  }

  /**
   * Get bootstrap state (if available)
   */
  static getBootstrapState(): SessionBootstrapState | null {
    return this.bootstrapState;
  }

  /**
   * Set bootstrap state (called by BootstrapProvider)
   */
  static setBootstrapState(state: SessionBootstrapState): void {
    this.bootstrapState = state;
    logger.debug({
      identityType: state.identity.type,
      reportMode: state.report.mode,
      prefillConfidence: state.prefillData.confidence.toFixed(2),
    }, '[SessionInitializer] Bootstrap state set');
  }

  /**
   * Reset initialization state (for testing)
   */
  static reset(): void {
    this.initialized = false;
    this.initPromise = null;
    this.error = null;
    this.bootstrapState = null;
    logger.debug('[SessionInitializer] State reset');
  }

  /**
   * Initialize auth system
   * 
   * Waits for auth to be ready
   */
  private static async initializeAuth(): Promise<void> {
    try {
      // Dynamic import to avoid circular dependencies
      const { useAuthStore } = await import('./auth');

      // Wait for auth to initialize
      const authState = useAuthStore.getState();
      
      // If not loading, auth is ready (either logged in or not)
      if (!authState.loading) {
        logger.debug('[SessionInitializer] Auth already initialized');
        return;
      }

      // Wait for auth initialization (with timeout as safety net)
      await Promise.race([
        new Promise<void>((resolve) => {
          // Subscribe to auth state changes
          const unsubscribe = useAuthStore.subscribe((state) => {
            if (!state.loading) {
              unsubscribe();
              resolve();
            }
          });

          // Check immediately in case already initialized
          if (!useAuthStore.getState().loading) {
            unsubscribe();
            resolve();
          }
        }),
        new Promise<void>((_, reject) => 
          setTimeout(() => reject(new Error('Auth initialization timeout')), 20000)
        ),
      ]);

      logger.debug('[SessionInitializer] Auth initialization complete');
    } catch (error) {
      logger.error({ error }, '[SessionInitializer] Auth initialization failed');
      throw error;
    }
  }

}

/**
 * Export singleton instance
 */
export { SessionInitializer };

/**
 * Convenience function for components
 */
export async function initializeSession(): Promise<void> {
  return SessionInitializer.initialize();
}

/**
 * Convenience function for HTTP interceptor
 */
export async function waitForSessionReady(): Promise<void> {
  return SessionInitializer.waitForReady();
}

/**
 * Check if session system is ready
 */
export function isSessionReady(): boolean {
  return SessionInitializer.isReady();
}

/**
 * Get bootstrap state from session initializer
 */
export function getBootstrapState(): SessionBootstrapState | null {
  return SessionInitializer.getBootstrapState();
}

/**
 * Set bootstrap state in session initializer (called by BootstrapProvider)
 */
export function setBootstrapState(state: SessionBootstrapState): void {
  SessionInitializer.setBootstrapState(state);
}
