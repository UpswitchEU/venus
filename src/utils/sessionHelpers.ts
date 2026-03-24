/**
 * Session Helper Utilities
 *
 * Single Responsibility: Session ID generation and base session object creation.
 * Pure functions for creating consistent session structures.
 *
 * @module utils/sessionHelpers
 */

import { backendAPI } from '../services/backendApi'
import type { ValuationResponse, ValuationSession } from '../types/valuation'
import { is409Conflict } from './errorDetection'
import { isRetryable } from './errors/errorGuards'
import { createContextLogger } from './logger'
import { markReportExists } from './reportExistenceCache'
import { retryWithBackoff } from './retryWithBackoff'
import { globalSessionCache } from './sessionCacheManager'

const sessionHelpersLogger = createContextLogger('SessionHelpers')

/**
 * Creates a base ValuationSession object with default values
 *
 * Single source of truth for session structure.
 * Ensures consistency across session creation points.
 *
 * @param reportId - Unique report identifier
 * @param sessionId - Unique session identifier
 * @param currentView - Current flow view (manual or conversational)
 * @param prefilledQuery - Optional prefilled query from homepage
 * @returns Base ValuationSession object
 *
 * @example
 * ```typescript
 * const session = createBaseSession(
 *   'val_123',
 *   generateSessionId(),
 *   'conversational',
 *   'Restaurant'
 * )
 * ```
 */
export function createBaseSession(
  reportId: string,
  currentView: 'manual' | 'conversational',
  prefilledQuery?: string | null
): ValuationSession {
  return {
    reportId,
    currentView,
    dataSource: currentView,
    createdAt: new Date(),
    updatedAt: new Date(),
    partialData: prefilledQuery ? ({ _prefilledQuery: prefilledQuery } as any) : {},
    sessionData: {},
  }
}

/**
 * Merges prefilled query into existing partial data
 *
 * Only adds prefilled query if:
 * 1. prefilledQuery is provided
 * 2. partialData doesn't already have _prefilledQuery
 *
 * @param partialData - Existing partial data
 * @param prefilledQuery - Query to merge
 * @returns Updated partial data
 */
export function mergePrefilledQuery(partialData: any, prefilledQuery?: string | null): any {
  if (!prefilledQuery) return partialData

  const updated = { ...partialData }
  if (!updated._prefilledQuery) {
    updated._prefilledQuery = prefilledQuery
  }

  return updated
}

/**
 * Merge top-level session fields (valuationResult, htmlReport) into sessionData
 *
 * Backend stores these separately as top-level fields, but frontend needs them in sessionData
 * for consistent access across restoration and UI components.
 *
 * This is the SINGLE SOURCE OF TRUTH for data merging - all code paths should use this function
 * to ensure consistent data structure.
 *
 * @param session - Session object from backend or cache
 * @returns Session with merged fields in sessionData
 *
 * @example
 * ```typescript
 * const backendSession = await backendAPI.getValuationSession(reportId)
 * const mergedSession = mergeSessionFields(backendSession.session)
 * // mergedSession.sessionData now contains:
 * // - All original sessionData fields
 * // - valuation_result (from session.valuationResult)
 * // - html_report (from session.htmlReport)
 * ```
 */
export function mergeSessionFields(session: ValuationSession): ValuationSession {
  if (!session) return session

  // ✅ FIX: Preserve ALL existing sessionData fields
  // Only add/override the special fields (valuation_result, html_report)
  // Cast to any to access session_data (backend may return snake_case)
  const sessionAny = session as any
  const existingSessionData = session.sessionData || sessionAny.session_data || {}

  // ✅ BANK-GRADE: Extract from BOTH top-level AND session_data locations
  // Titan controller exposes at top level, but also check session_data for defense-in-depth
  // _htmlReport is bootstrap-injected for instant restoration
  const htmlReport =
    session.htmlReport ||
    (existingSessionData as any).htmlReport ||
    (existingSessionData as any).html_report ||
    (existingSessionData as any)._htmlReport
  const valuationCandidates = [
    session.valuationResult,
    (existingSessionData as any).valuationResult,
    (existingSessionData as any).valuation_result,
  ].filter((candidate) => candidate && typeof candidate === 'object') as Array<Record<string, any>>
  const candidateScore = (candidate: Record<string, any>) => {
    let score = 0
    const valuationResultsCandidate =
      candidate.valuation_results ??
      candidate.details?.valuation_results ??
      candidate.valuation_result?.valuation_results ??
      candidate.valuation_result?.details?.valuation_results
    if (
      valuationResultsCandidate &&
      typeof valuationResultsCandidate === 'object' &&
      Object.keys(valuationResultsCandidate).length > 0
    ) {
      score += 8
    }
    if (candidate.html_report || candidate.htmlReport || candidate.details?.html_report) score += 4
    if (
      candidate.equity_value_mid != null ||
      candidate.valuation_midpoint != null ||
      candidate.pricing_range ||
      candidate.priceRange
    ) {
      score += 2
    }
    score += Math.min(Object.keys(candidate).length, 5)
    return score
  }
  const valuationResult =
    valuationCandidates.length > 0
      ? valuationCandidates.reduce((best, candidate) =>
          candidateScore(candidate) > candidateScore(best) ? candidate : best
        )
      : undefined
  const priceRange =
    (session as any).priceRange ||
    (existingSessionData as any).priceRange ||
    (existingSessionData as any)._pricingRange

  const mergedSessionData = {
    ...existingSessionData,
    ...(valuationResult && { valuation_result: valuationResult }),
    ...(htmlReport && { html_report: htmlReport }),
    ...(priceRange && { _pricingRange: priceRange }),
  }

  return {
    ...session,
    sessionData: mergedSessionData,
    htmlReport,
    valuationResult: valuationResult as ValuationResponse | undefined,
  }
}

/**
 * Normalizes session dates from backend (strings to Date objects)
 *
 * @param session - Session from backend with string dates
 * @returns Session with Date objects
 */
export function normalizeSessionDates(session: any): ValuationSession {
  // ✅ CRITICAL FIX: Ensure sessionData and partialData are preserved
  // Backend may return session_data which needs to be mapped to sessionData/partialData
  // ✅ FIX: Robust date parsing with fallback for invalid dates
  const parseDate = (dateValue: any): Date => {
    if (!dateValue) return new Date()
    if (dateValue instanceof Date) {
      return isNaN(dateValue.getTime()) ? new Date() : dateValue
    }
    try {
      const parsed = new Date(dateValue)
      return isNaN(parsed.getTime()) ? new Date() : parsed
    } catch {
      return new Date()
    }
  }

  const normalized: ValuationSession = {
    ...session,
    createdAt: parseDate(session.createdAt),
    updatedAt: parseDate(session.updatedAt),
    completedAt: session.completedAt ? parseDate(session.completedAt) : undefined,
    // ✅ FIX: Preserve sessionData and partialData if they exist
    sessionData: session.sessionData || session.session_data || {},
    partialData: session.partialData || session.session_data || {},
  }

  return normalized
}

/**
 * Creates a session optimistically (locally without backend calls)
 *
 * FAST PATH for NEW reports:
 * - Creates session locally using createBaseSession()
 * - Caches session immediately
 * - Marks report as existing
 * - Returns synchronously (<50ms)
 *
 * This allows instant UI rendering while backend sync happens in background.
 *
 * @param reportId - Report identifier
 * @param currentView - Current flow view (manual or conversational)
 * @param prefilledQuery - Optional prefilled query from homepage
 * @returns Created session (local only, not synced to backend yet)
 *
 * @example
 * ```typescript
 * if (isNewReport(reportId)) {
 *   const session = createSessionOptimistically(reportId, 'manual', 'Restaurant')
 *   // UI ready instantly!
 *   syncSessionToBackend(session) // Sync in background
 * }
 * ```
 */
export function createSessionOptimistically(
  reportId: string,
  currentView: 'manual' | 'conversational',
  prefilledQuery?: string | null
): ValuationSession {
  const session = createBaseSession(reportId, currentView, prefilledQuery)

  // Cache immediately for instant retrieval
  globalSessionCache.set(reportId, session)

  // Mark as existing (so we don't check again)
  markReportExists(reportId)

  sessionHelpersLogger.info('Created session optimistically', {
    reportId,
    currentView,
    hasPrefilledQuery: !!prefilledQuery,
  })

  return session
}

/**
 * Syncs optimistically created session to backend (non-blocking)
 *
 * BACKGROUND SYNC:
 * - Non-blocking (doesn't await)
 * - Handles 409 conflicts (session already exists - load it)
 * - Updates cache with backend response
 * - Prevents duplicate syncs via store state (atomic)
 * - Logs sync results
 *
 * This runs in the background after optimistic creation,
 * allowing UI to render instantly while sync completes.
 *
 * @param session - Session to sync to backend
 *
 * @example
 * ```typescript
 * const session = createSessionOptimistically(reportId, 'manual', query)
 * syncSessionToBackend(session) // Non-blocking
 * ```
 */
export function syncSessionToBackend(session: ValuationSession): void {
  const { reportId } = session

  // Background sync (no status tracking needed)
  // NOTE: Store updates are handled by SessionService in the new architecture

  // Sync in background (non-blocking) with retry logic
  Promise.resolve()
    .then(async () => {
      try {
        sessionHelpersLogger.debug('Starting background sync', { reportId })

        // CRITICAL: Try to create session, but handle 409 conflicts immediately (don't retry)
        try {
          await backendAPI.createValuationSession(session)
          sessionHelpersLogger.debug('Background sync completed successfully', {
            reportId,
          })
          // Success - cache already updated by createSessionOptimistically
          return // Exit early on success
        } catch (createError) {
          // CRITICAL: 409 conflicts are EXPECTED - session already exists, don't retry
          if (is409Conflict(createError)) {
            // Re-throw to outer catch block for 409 handling
            throw createError
          }

          // For other errors, retry with exponential backoff
          await retryWithBackoff(
            async () => {
              return await backendAPI.createValuationSession(session)
            },
            {
              maxRetries: 3,
              initialDelay: 200,
              maxDelay: 2000,
              backoffMultiplier: 2,
              onRetry: (attempt, error, delay) => {
                sessionHelpersLogger.debug('Retrying background sync', {
                  reportId,
                  attempt,
                  delay_ms: delay,
                  error: error instanceof Error ? error.message : 'Unknown error',
                })
              },
              onFailure: (error, attempts) => {
                sessionHelpersLogger.warn('Background sync failed after retries', {
                  reportId,
                  attempts,
                  error: error instanceof Error ? error.message : 'Unknown error',
                })
              },
            }
          )

          sessionHelpersLogger.debug('Background sync completed successfully after retries', {
            reportId,
          })
        }
      } catch (error) {
        // Handle 409 conflicts (not retryable - session already exists)
        // CRITICAL: 409 conflicts are EXPECTED in background sync - handle silently
        if (is409Conflict(error)) {
          // Session already exists - load from backend (expected behavior, not an error)
          sessionHelpersLogger.debug('Session already exists (409), loading from backend', {
            reportId,
          })

          try {
            // Retry loading existing session (might be transient)
            const backendSessionResponse = await retryWithBackoff(
              async () => {
                return await backendAPI.getValuationSession(reportId)
              },
              {
                maxRetries: 2,
                initialDelay: 100,
                maxDelay: 1000,
                onRetry: (attempt, loadError) => {
                  sessionHelpersLogger.warn('Retrying load after 409', {
                    reportId,
                    attempt,
                    error: loadError instanceof Error ? loadError.message : 'Unknown error',
                  })
                },
              }
            )

            if (backendSessionResponse?.session) {
              // Merge top-level fields into sessionData (SINGLE SOURCE OF TRUTH)
              const mergedSession = mergeSessionFields(backendSessionResponse.session)

              const backendSession = normalizeSessionDates(mergedSession)

              // Update cache with backend version
              globalSessionCache.set(reportId, backendSession)

              // NOTE: Store updates are handled by SessionService in the new architecture
              // The cache update above ensures SessionService.loadSession() will use cached data
              sessionHelpersLogger.debug('Updated cache after 409 conflict resolution', {
                reportId,
                currentView: backendSession.currentView,
              })

              // Store updates will be handled by SessionService when loadSession is called
              // This maintains flow isolation (Manual vs Conversational stores)

              sessionHelpersLogger.debug('Loaded existing session from backend after 409', {
                reportId,
                currentView: backendSession.currentView,
              })

              // Successfully loaded existing session
            }
          } catch (loadError) {
            sessionHelpersLogger.error('Failed to load existing session after 409', {
              reportId,
              error: loadError instanceof Error ? loadError.message : 'Unknown error',
            })
            // Keep optimistic session - it still works locally
          }
        } else if (isRetryable(error)) {
          // Retryable error but retries exhausted - log warning
          sessionHelpersLogger.warn(
            'Background sync failed after retries, session still works locally',
            {
              reportId,
              error: error instanceof Error ? error.message : 'Unknown error',
            }
          )
          // Session still works locally - user can retry later
        } else {
          // Non-retryable error - log but don't block UI
          sessionHelpersLogger.warn(
            'Background sync failed (non-retryable), session still works locally',
            {
              reportId,
              error: error instanceof Error ? error.message : 'Unknown error',
            }
          )
          // Session still works locally - user can retry later
        }
      }
    })
    .catch((error) => {
      // Unexpected error in promise chain
      sessionHelpersLogger.error('Unexpected error in background sync', {
        reportId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    })
}
