/**
 * Session Service
 *
 * Shared service for session management across Manual and Conversational flows.
 * Provides a single, consistent API for session operations.
 *
 * Key Features:
 * - Load sessions from backend or cache
 * - Save/update sessions atomically
 * - Cache management (globalSessionCache integration)
 * - Session field merging (SINGLE SOURCE OF TRUTH)
 * - Error handling and retry logic
 *
 * Used by:
 * - Unified Session Store (useSessionStore)
 *
 * @module services/session/SessionService
 */

import { ApplicationError, NetworkError, NotFoundError, ValidationError } from '../../types/errors'
import type { ValuationSession } from '../../types/valuation'
import { sessionCircuitBreaker } from '../../utils/circuitBreaker'
import { getErrorMessage } from '../../utils/errors/errorConverter'
import { createContextLogger } from '../../utils/logger'
import { retrySessionOperation } from '../../utils/retryWithBackoff'
import { globalSessionCache } from '../../utils/sessionCacheManager'
import { fetchValuationSessionWithCompletedReportRetry } from './SessionBackendLookup'
import { revalidateSessionCacheInBackground } from './SessionBackgroundRevalidation'
import { loadCompleteValuationDataPackage } from './SessionCompleteDataLoader'
import {
  type CompleteSessionSaveData,
  saveCompleteValuationSession,
} from './SessionCompleteSaveService'
import { hydrateExistingValuationSession } from './SessionExistingLoadHydrator'
import { loadCachedValuationSession } from './SessionLoadCache'
import { createSessionForNewReportIfAllowed } from './SessionNewReportCreator'
import { type SaveSessionUpdates, saveValuationSession } from './SessionSaveService'

const logger = createContextLogger('SessionService')

/**
 * SessionService - Shared session management
 *
 * Singleton service for consistent session operations across all flows.
 */
export class SessionService {
  private static instance: SessionService

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SessionService {
    if (!SessionService.instance) {
      SessionService.instance = new SessionService()
    }
    return SessionService.instance
  }

  /**
   * Load complete valuation data package (session + report + versions + packages)
   *
   * This method provides unified data loading for restoration with zero race conditions.
   * All related data is fetched in parallel after the session loads.
   *
   * @param reportId - Report identifier
   * @returns Complete data package or null if session not found
   */
  async loadCompleteValuationData(reportId: string): Promise<{
    session: ValuationSession
    currentReport?: {
      html_report: string
      valuation_result: Record<string, unknown>
    }
    versions?: unknown[]
    pricingRange?: {
      min: number
      max: number
      suggested: number
    }
    previousPackages?: unknown[]
  } | null> {
    return loadCompleteValuationDataPackage(reportId, (id) => this.loadSession(id))
  }

  /**
   * Load session from cache or backend
   *
   * CACHE-FIRST STRATEGY:
   * 1. Check globalSessionCache
   * 2. If cache hit, return immediately
   * 3. If cache miss, load from backend
   * 4. Merge top-level fields into sessionData
   * 5. Cache for next time
   *
   * @param reportId - Report identifier
   * @param flow - Optional flow type ('manual' | 'conversational') for new session creation
   * @param prefilledQuery - Optional prefilled query from URL to merge into partialData
   * @returns Session object or null if not found
   */
  async loadSession(
    reportId: string,
    flow?: 'manual' | 'conversational',
    prefilledQuery?: string | null
  ): Promise<ValuationSession | null> {
    const startTime = performance.now()
    const ABSOLUTE_TIMEOUT = 12000 // 12 seconds max

    try {
      // SECURITY: prefilledQuery should come from session data, not URL
      // URL parameter is only for backward compatibility
      logger.debug('Loading session', { reportId, flow, prefilledQuery })

      const cached = loadCachedValuationSession(reportId, prefilledQuery, startTime)
      if (cached.status === 'hit') {
        return cached.session
      }

      logger.debug('Cache miss - loading from backend', { reportId })

      // Wrap the entire load operation with an absolute timeout
      const loadPromise = retrySessionOperation(
        async () => {
          return await sessionCircuitBreaker.execute(async () => {
            const sessionResponse = await fetchValuationSessionWithCompletedReportRetry(reportId)

            if (!sessionResponse?.session) {
              return createSessionForNewReportIfAllowed(reportId, flow, prefilledQuery)
            }

            return hydrateExistingValuationSession(
              reportId,
              sessionResponse.session,
              prefilledQuery
            )
          })
        },
        {
          onRetry: (attempt, error, delay) => {
            logger.warn('Retrying session load', {
              reportId,
              attempt,
              delay_ms: delay,
              error: error instanceof Error ? error.message : String(error),
            })
          },
        }
      )

      // Create timeout promise that rejects after ABSOLUTE_TIMEOUT
      let timeoutId: NodeJS.Timeout | null = null
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          const elapsed = performance.now() - startTime
          logger.error('Session load exceeded absolute timeout', {
            reportId,
            elapsedMs: elapsed,
            timeoutMs: ABSOLUTE_TIMEOUT,
          })
          reject(
            new ApplicationError('Session load exceeded absolute timeout', 'SESSION_LOAD_TIMEOUT', {
              reportId,
              elapsedMs: elapsed,
              timeoutMs: ABSOLUTE_TIMEOUT,
            })
          )
        }, ABSOLUTE_TIMEOUT)
      })

      // Race between load and timeout
      let session: ValuationSession | null
      try {
        session = await Promise.race([loadPromise, timeoutPromise])
      } finally {
        // Clean up timeout to prevent memory leak
        if (timeoutId !== null) {
          clearTimeout(timeoutId)
        }
      }

      const duration = performance.now() - startTime

      if (session) {
        logger.debug('Session loaded successfully', {
          reportId,
          duration_ms: duration.toFixed(2),
          fromCache: false,
        })
      } else {
        logger.debug('Session not found (404)', {
          reportId,
          duration_ms: duration.toFixed(2),
        })
      }

      return session
    } catch (error) {
      const duration = performance.now() - startTime

      // Use instanceof checks for specific error handling
      if (error instanceof NotFoundError) {
        logger.debug('Session not found - returning null', {
          reportId,
          resourceType: error.resourceType,
          duration_ms: duration.toFixed(2),
        })
        return null // Not found is expected, return null
      } else if (error instanceof NetworkError && error.retryable) {
        logger.warn('Failed to load session - network error (retryable)', {
          error: error.message,
          reportId,
          duration_ms: duration.toFixed(2),
        })
        return null // Return null for retryable network errors
      } else if (error instanceof ValidationError) {
        logger.error('Failed to load session - validation error', {
          error: error.message,
          field: error.field,
          reportId,
          duration_ms: duration.toFixed(2),
        })
        return null
      } else {
        logger.error('Failed to load session - unknown error', {
          error: getErrorMessage(error),
          reportId,
          duration_ms: duration.toFixed(2),
        })
        return null
      }
    }
  }

  /**
   * Save session to backend.
   *
   * The create/update/cache/retry behavior lives in SessionSaveService so this class remains
   * the public orchestration surface for callers.
   */
  async saveSession(reportId: string, updates: SaveSessionUpdates): Promise<ValuationSession> {
    return saveValuationSession(reportId, updates, (id) => this.loadSession(id))
  }

  /**
   * Save complete session with form data, valuation assets, cache refresh, and broadcast.
   */
  async saveCompleteSession(reportId: string, data: CompleteSessionSaveData): Promise<void> {
    return saveCompleteValuationSession(reportId, data, (id) => this.loadSession(id))
  }

  /**
   * Clear session from cache
   *
   * @param reportId - Report identifier
   */
  clearSessionCache(reportId: string): void {
    globalSessionCache.remove(reportId)
    logger.debug('Session cache cleared', { reportId })
  }

  /**
   * Trigger background revalidation (public API)
   * Use when bootstrap path has session but lacks HTML assets - fetches from backend.
   */
  revalidateSessionInBackground(reportId: string): void {
    revalidateSessionCacheInBackground(reportId).catch((err) => {
      logger.warn('Background revalidation failed', {
        reportId,
        error: err instanceof Error ? err.message : String(err),
      })
    })
  }
}

// Export singleton instance
export const sessionService = SessionService.getInstance()
