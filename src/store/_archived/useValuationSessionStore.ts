import { create } from 'zustand'
import { backendAPI } from '../services/backendApi'
import type { ValuationFormData, ValuationRequest, ValuationSession } from '../types/valuation'
import { sessionCircuitBreaker } from '../utils/circuitBreaker'
import { CorrelationPrefixes, createCorrelationId } from '../utils/correlationId'
import { extractErrorMessage } from '../utils/errorDetection'
import { convertToApplicationError, getErrorMessage } from '../utils/errors/errorConverter'
import {
  isNetworkError,
  isSessionConflictError,
  isValidationError,
} from '../utils/errors/errorGuards'
import { storeLogger } from '../utils/logger'
import { globalSessionMetrics } from '../utils/metrics/sessionMetrics'
import { globalPerformanceMonitor, performanceThresholds } from '../utils/performanceMonitor'
import { retrySessionOperation } from '../utils/retryWithBackoff'
import { globalAuditTrail } from '../utils/sessionAuditTrail'
import { globalSessionCache } from '../utils/sessionCacheManager'
import { hasMeaningfulSessionData } from '../utils/sessionDataUtils'
import { createFallbackSession, createOrLoadSession } from '../utils/sessionErrorHandlers'
import {
  createSessionOptimistically,
  mergePrefilledQuery,
  mergeSessionFields,
  normalizeSessionDates,
  syncSessionToBackend,
} from '../utils/sessionHelpers'
import { validateSessionData } from '../utils/sessionValidation'
import { verifySessionInBackground } from '../utils/sessionVerification'
import { useValuationResultsStore } from './useValuationResultsStore'

export interface ValuationSessionStore {
  // Session state
  session: ValuationSession | null

  // Actions
  initializeSession: (
    reportId: string,
    currentView?: 'manual' | 'conversational',
    prefilledQuery?: string | null
  ) => Promise<void>
  loadSession: (reportId: string) => Promise<void>
  updateSessionData: (data: Partial<ValuationRequest>) => Promise<void>
  switchView: (
    view: 'manual' | 'conversational',
    resetData?: boolean,
    skipConfirmation?: boolean
  ) => Promise<{ needsConfirmation?: boolean } | void>
  getSessionData: () => ValuationRequest | null
  clearSession: () => void

  // Get session completeness (percentage of required fields filled)
  getCompleteness: () => number

  // Save complete session (all data atomically)
  saveCompleteSession: (data: {
    formData?: ValuationFormData
    valuationResult?: any
    htmlReport?: string
    infoTabHtml?: string
  }) => Promise<void>

  // Sync state
  isSyncing: boolean
  syncError: string | null

  // Save status (for M&A workflow - trust indicators)
  isSaving: boolean
  lastSaved: Date | null
  hasUnsavedChanges: boolean
  markReportSaved: () => void
  markReportSaving: () => void
  markReportSaveFailed: (error: string) => void

  // Flow switch confirmation
  pendingFlowSwitch: 'manual' | 'conversational' | null
  setPendingFlowSwitch: (view: 'manual' | 'conversational' | null) => void

  // Atomic initialization state (single source of truth)
  initializationState: Map<
    string,
    {
      status: 'idle' | 'initializing' | 'ready'
      promise?: Promise<void>
    }
  >

  // URL sync state (prevent race conditions)
  isUpdatingUrl: boolean
  setUpdatingUrl: (updating: boolean) => void
}

export const useValuationSessionStore = create<ValuationSessionStore>((set, get) => {
  // Throttling for session updates
  let lastUpdateTime = 0
  let pendingUpdate: NodeJS.Timeout | null = null
  const UPDATE_THROTTLE_MS = 2000 // Minimum 2 seconds between updates

  // Atomic initialization state (single source of truth)
  const initializationState = new Map<
    string,
    {
      status: 'idle' | 'initializing' | 'ready'
      promise?: Promise<void>
    }
  >()

  return {
    // Initial state
    session: null,
    isSyncing: false,
    syncError: null,
    pendingFlowSwitch: null,

    // Save status (M&A workflow trust indicators)
    isSaving: false,
    lastSaved: null,
    hasUnsavedChanges: false,

    // Atomic initialization state
    initializationState,

    // URL sync state
    isUpdatingUrl: false,
    setUpdatingUrl: (updating: boolean) => set({ isUpdatingUrl: updating }),

    /**
     * Initialize a new session or load existing one
     *
     * Simple Chain Architecture:
     * 1. Check atomic initialization state
     * 2. If 'initializing': Return existing promise (wait)
     * 3. If 'ready': Return immediately
     * 4. If 'idle': Set to 'initializing', execute flow, set to 'ready'
     */
    initializeSession: async (
      reportId: string,
      currentView: 'manual' | 'conversational' = 'manual',
      prefilledQuery?: string | null
    ) => {
      // Step 1: Check atomic initialization state
      const initState = initializationState.get(reportId)

      if (initState?.status === 'initializing' && initState.promise) {
        // Already initializing - return existing promise (deduplication)
        storeLogger.debug('Initialization already in progress, waiting for existing promise', {
          reportId,
        })
        return initState.promise
      }

      if (initState?.status === 'ready') {
        // Already initialized - check if session exists and update prefilledQuery if needed
        // Use functional update to prevent race conditions
        let shouldReturn = false
        set((state) => {
          const existingSession = state.session
          if (existingSession?.reportId === reportId) {
            if (prefilledQuery && existingSession.partialData) {
              const updatedPartialData = { ...existingSession.partialData } as any
              if (!updatedPartialData._prefilledQuery) {
                updatedPartialData._prefilledQuery = prefilledQuery
                shouldReturn = true
                return {
                  ...state,
                  session: {
                    ...existingSession,
                    partialData: updatedPartialData,
                  },
                }
              }
            }
            shouldReturn = true
            return state // No change needed
          }
          // State says ready but no session - reset to idle and continue
          initializationState.set(reportId, { status: 'idle' })
          return state
        })
        if (shouldReturn) {
          storeLogger.debug('Session already initialized, skipping', { reportId })
          return
        }
      }

      // Step 2: Set state to 'initializing' (atomic write)
      const initPromise = (async () => {
        try {
          storeLogger.info('Initializing valuation session', {
            reportId,
            currentView,
            hasPrefilledQuery: !!prefilledQuery,
          })

          // Step 3: Check cache/backend BEFORE deciding if report is NEW
          // This ensures existing reports load properly when visiting URLs directly
          const { session: existingLocalSession } = get()
          const hasLocalSession = existingLocalSession && existingLocalSession.reportId === reportId

          // CACHE-FIRST: Check localStorage cache BEFORE backend API call
          const cachedSession = globalSessionCache.get(reportId)
          if (cachedSession && hasMeaningfulSessionData(cachedSession.sessionData, cachedSession)) {
            // Check cache age - if older than 5 minutes, verify with backend first
            const cacheAge = cachedSession.updatedAt
              ? Date.now() - new Date(cachedSession.updatedAt).getTime()
              : Infinity

            const CACHE_MAX_AGE = 5 * 60 * 1000 // 5 minutes

            if (cacheAge > CACHE_MAX_AGE) {
              // Cache is old - verify with backend first
              storeLogger.info('Cache is old, verifying with backend first', {
                reportId,
                cacheAge_minutes: Math.floor(cacheAge / 60000),
              })

              try {
                const backendResponse = await backendAPI.getValuationSession(reportId)

                if (
                  !backendResponse?.session ||
                  !hasMeaningfulSessionData(
                    backendResponse.session.sessionData,
                    backendResponse.session
                  )
                ) {
                  // Backend doesn't have it or has empty data - cache is stale, remove it
                  storeLogger.warn('Backend verification failed - cache is stale, removing', {
                    reportId,
                    cacheAge_minutes: Math.floor(cacheAge / 60000),
                  })
                  globalSessionCache.remove(reportId)
                  // Fall through to create NEW below
                } else {
                  // Backend has it - use backend version (fresher than cache)
                  const existingSession = backendResponse.session
                  // Merge top-level fields into sessionData (SINGLE SOURCE OF TRUTH)
                  const mergedSession = mergeSessionFields(existingSession)

                  // Merge prefilled query if provided
                  const updatedPartialData = mergePrefilledQuery(
                    mergedSession.partialData,
                    prefilledQuery
                  )

                  const normalizedSession = normalizeSessionDates({
                    ...mergedSession,
                    partialData: updatedPartialData,
                  })

                  // Update cache with fresh backend data
                  globalSessionCache.set(reportId, normalizedSession)

                  set({
                    session: normalizedSession,
                    syncError: null,
                  })

                  // Restoration is now handled by useSessionRestoration hook
                  // No need for direct restoration here - prevents race conditions

                  storeLogger.info('Loaded session from backend (cache was old)', {
                    reportId,
                    currentView: existingSession.currentView,
                  })

                  // Mark initialization as complete and return
                  initializationState.set(reportId, { status: 'ready' })
                  return
                }
              } catch (backendError) {
                const is404 = (backendError as any)?.response?.status === 404

                if (is404) {
                  // Confirmed stale - remove cache and create NEW
                  storeLogger.warn('Backend returned 404 - cache is stale, removing', {
                    reportId,
                  })
                  globalSessionCache.remove(reportId)
                  // Fall through to create NEW below
                } else {
                  // Network error or other issue - use cache as fallback
                  storeLogger.warn('Backend check failed, using cache as fallback', {
                    reportId,
                    error:
                      backendError instanceof Error ? backendError.message : String(backendError),
                  })
                  // Continue to use cache below
                }
              }
            }

            // If we reach here with a valid cached session, use it
            // Re-check cache in case it was removed during backend verification
            const stillCachedSession = globalSessionCache.get(reportId)
            if (
              stillCachedSession &&
              hasMeaningfulSessionData(stillCachedSession.sessionData, stillCachedSession)
            ) {
              // Cached session exists with meaningful data - use it (not NEW)
              storeLogger.info('Using cached session (fresh or fallback)', {
                reportId,
                currentView: stillCachedSession.currentView,
                cacheAge_minutes: stillCachedSession.updatedAt
                  ? Math.floor(
                      (Date.now() - new Date(stillCachedSession.updatedAt).getTime()) / (60 * 1000)
                    )
                  : null,
              })

              // CRITICAL: Ensure cached session has merged fields (backward compatibility)
              // Cached sessions should already be merged, but ensure it for safety
              const mergedCachedSession = mergeSessionFields(stillCachedSession)

              // Merge prefilled query if provided
              const updatedPartialData = mergePrefilledQuery(
                mergedCachedSession.partialData,
                prefilledQuery
              )

              // Use cached session immediately (with merged fields)
              set({
                session: {
                  ...mergedCachedSession,
                  partialData: updatedPartialData,
                },
                syncError: null,
              })

              // Restoration is now handled by useSessionRestoration hook
              // No need for direct restoration here - prevents race conditions

              // Verify with backend in background (non-blocking)
              // Only verify if cache is fresh (< 5 minutes), otherwise we just verified above
              if (cacheAge <= CACHE_MAX_AGE) {
                verifySessionInBackground(reportId, stillCachedSession)
              }

              // Record cache hit metric
              const cacheLoadTime = 5
              globalSessionMetrics.recordOperation('load', true, cacheLoadTime, 0, 'cache_hit')

              storeLogger.info('Cache hit - session loaded from cache', {
                reportId,
                loadTime_ms: cacheLoadTime,
              })

              // Mark initialization as complete
              initializationState.set(reportId, { status: 'ready' })
              return
            }
            // If cache was removed, fall through to check backend below
          }

          // Not in cache or cache was removed (stale) - check backend
          storeLogger.debug('Session not found in cache or cache empty, checking backend', {
            reportId,
          })

          // CRITICAL: Try to load from backend with retries before assuming NEW
          // This prevents 409 conflicts when the session exists but backend is slow/failing
          let backendSession: any = null
          let shouldCreateNew = false

          try {
            // Attempt 1: Direct load from backend
            const backendResponse = await backendAPI.getValuationSession(reportId)

            if (
              backendResponse?.session &&
              hasMeaningfulSessionData(backendResponse.session.sessionData, backendResponse.session)
            ) {
              backendSession = backendResponse.session
              storeLogger.info('Loaded existing session from backend (attempt 1)', {
                reportId,
                hasSessionData: !!backendSession.sessionData,
              })
            } else {
              // Backend returned empty session - might be truly NEW
              shouldCreateNew = true
              storeLogger.debug('Backend returned empty session, will create NEW', { reportId })
            }
          } catch (backendError) {
            const is404 = (backendError as any)?.response?.status === 404

            if (is404) {
              // 404 could mean:
              // 1. Session truly doesn't exist (NEW)
              // 2. Session exists but backend is having issues
              // CRITICAL: Try one more time with a short delay before creating NEW
              storeLogger.warn('Backend returned 404, retrying once before creating NEW', {
                reportId,
              })

              try {
                // Wait 500ms and try again
                await new Promise((resolve) => setTimeout(resolve, 500))
                const retryResponse = await backendAPI.getValuationSession(reportId)

                if (
                  retryResponse?.session &&
                  hasMeaningfulSessionData(retryResponse.session.sessionData, retryResponse.session)
                ) {
                  backendSession = retryResponse.session
                  storeLogger.info('Loaded existing session from backend (retry after 404)', {
                    reportId,
                    hasSessionData: !!backendSession.sessionData,
                  })
                } else {
                  // Still no session - truly NEW
                  shouldCreateNew = true
                  storeLogger.info(
                    'Backend confirmed no session exists (retry also 404), will create NEW',
                    { reportId }
                  )
                }
              } catch (retryError) {
                // Still failing - likely truly NEW
                shouldCreateNew = true
                storeLogger.warn('Backend retry also failed, assuming NEW report', {
                  reportId,
                  error: retryError instanceof Error ? retryError.message : String(retryError),
                })
              }
            } else {
              // Other backend error (network, timeout, 500, etc.)
              // Don't create NEW - could cause 409 conflict
              storeLogger.error('Backend check failed with non-404 error, will NOT create NEW', {
                reportId,
                error: backendError instanceof Error ? backendError.message : String(backendError),
                statusCode: (backendError as any)?.response?.status,
              })

              // Create a fallback local session but don't sync to backend
              const fallbackSession = createFallbackSession(
                reportId,
                currentView,
                prefilledQuery,
                backendError
              )
              set({
                session: fallbackSession,
                syncError: 'Failed to load session from backend. Working in offline mode.',
              })

              // Mark initialization as complete and return
              initializationState.set(reportId, { status: 'ready' })
              return
            }
          }

          // At this point, we either have backendSession or shouldCreateNew is true
          if (backendSession) {
            // EXISTING session loaded from backend
            const existingSession = backendSession
            // Merge top-level fields into sessionData (SINGLE SOURCE OF TRUTH)
            const mergedSession = mergeSessionFields(existingSession)

            // Merge prefilled query if provided
            const updatedPartialData = mergePrefilledQuery(
              mergedSession.partialData,
              prefilledQuery
            )

            const normalizedSession = normalizeSessionDates({
              ...mergedSession,
              partialData: updatedPartialData,
            })

            // Cache for next time
            globalSessionCache.set(reportId, normalizedSession)

            set({
              session: normalizedSession,
              syncError: null,
            })

            // Restoration is now handled by useSessionRestoration hook
            // No need for direct restoration here - prevents race conditions

            storeLogger.info('Loaded existing session from backend and cached', {
              reportId,
              currentView: existingSession.currentView,
              hasRedisContext: !!(existingSession as any).redisContext,
              dataSource: (existingSession as any).dataSource_info || 'db-only',
            })
          } else if (shouldCreateNew) {
            // NEW session - create optimistically
            storeLogger.info('Creating NEW report optimistically (confirmed no existing session)', {
              reportId,
              currentView,
            })

            const optimisticSession = createSessionOptimistically(
              reportId,
              currentView,
              prefilledQuery
            )

            set({
              session: optimisticSession,
              syncError: null,
            })

            // Sync to backend in background (non-blocking)
            syncSessionToBackend(optimisticSession)

            storeLogger.info('NEW report created optimistically', {
              reportId,
              currentView: optimisticSession.currentView,
            })
          }

          // Mark initialization as complete
          initializationState.set(reportId, { status: 'ready' })
        } catch (error) {
          const appError = convertToApplicationError(error, {
            reportId,
            currentView,
            prefilledQuery,
          })

          // Log with specific error type
          if (isSessionConflictError(appError)) {
            storeLogger.warn('Session conflict during initialization', {
              error: (appError as any).message,
              code: (appError as any).code,
              reportId,
              context: (appError as any).context,
            })
          } else if (isNetworkError(appError)) {
            storeLogger.error('Failed to initialize session - network error', {
              error: (appError as any).message,
              code: (appError as any).code,
              reportId,
              context: (appError as any).context,
            })
          } else if (isValidationError(appError)) {
            storeLogger.error('Failed to initialize session - validation error', {
              error: (appError as any).message,
              code: (appError as any).code,
              reportId,
              context: (appError as any).context,
            })
          } else {
            storeLogger.error('Failed to initialize session', {
              error: (appError as any).message,
              code: (appError as any).code,
              reportId,
              context: (appError as any).context,
            })
          }

          const errorMessage = getErrorMessage(appError)

          // Create fallback local session
          const fallbackSession = createFallbackSession(
            reportId,
            currentView,
            prefilledQuery,
            error
          )
          set({
            session: fallbackSession,
            syncError: errorMessage,
          })

          if (isSessionConflictError(appError)) {
            storeLogger.warn('Session conflict could not be resolved, created fallback session', {
              reportId,
              error: errorMessage,
            })
            // CRITICAL: For 409 conflicts, don't throw - use fallback session and continue
            // This allows report generation to proceed even if session loading fails
            return
          }

          // For other errors, still throw (but fallback session is available)
          throw appError
        } finally {
          // Step 4: Set state to 'ready' (atomic write)
          initializationState.set(reportId, { status: 'ready' })
        }
      })()

      // Store promise for deduplication
      initializationState.set(reportId, { status: 'initializing', promise: initPromise })

      return initPromise
    },

    /**
     * Load session from backend
     *
     * ENHANCED with fail-proof features for M&A workflow robustness:
     * - Request deduplication (prevents concurrent loads)
     * - Exponential backoff retry (recovers from network glitches)
     * - Circuit breaker (fast-fail when backend down)
     * - localStorage cache (offline resilience)
     * - Performance monitoring (<500ms target)
     * - Audit trail (compliance)
     * - Session validation (prevents corrupted data crashes)
     *
     * CRITICAL: This ensures users NEVER lose access to existing reports
     * Even with network issues, rate limits, or backend hiccups
     */
    loadSession: async (reportId: string) => {
      const correlationId = createCorrelationId(CorrelationPrefixes.SESSION_LOAD)
      const startTime = performance.now()

      try {
        set({ isSaving: true, isSyncing: true, syncError: null })

        // CACHE-FIRST OPTIMIZATION: Check localStorage cache BEFORE backend API call
        const cachedSession = globalSessionCache.get(reportId)
        if (cachedSession) {
          const loadTime = performance.now() - startTime
          storeLogger.info('Session loaded from cache (cache-first)', {
            reportId,
            correlationId,
            loadTime_ms: loadTime.toFixed(2),
            cacheAge_minutes: cachedSession.updatedAt
              ? Math.floor((Date.now() - new Date(cachedSession.updatedAt).getTime()) / (60 * 1000))
              : null,
          })

          // Validate cached session
          validateSessionData(cachedSession)

          // Use cached session immediately
          set({
            session: cachedSession,
            isSaving: false,
            isSyncing: false,
            syncError: null,
          })

          // CRITICAL: Restore valuation result from cache (same as backend load)
          try {
            const valuationResult =
              (cachedSession as any).valuationResult || (cachedSession as any).valuation_result
            if (valuationResult && typeof valuationResult === 'object') {
              const resultsStore = useValuationResultsStore.getState()

              if (resultsStore && typeof resultsStore.setResult === 'function') {
                // Merge HTML reports from session if not in result
                const fullResult = {
                  ...valuationResult,
                  html_report:
                    valuationResult.html_report ||
                    (cachedSession as any).htmlReport ||
                    (cachedSession as any).html_report,
                  info_tab_html:
                    valuationResult.info_tab_html ||
                    (cachedSession as any).infoTabHtml ||
                    (cachedSession as any).info_tab_html,
                }

                resultsStore.setResult(fullResult)

                storeLogger.info('Restored valuation result from cache', {
                  reportId,
                  hasHtmlReport: !!fullResult.html_report,
                  hasInfoTabHtml: !!fullResult.info_tab_html,
                  correlationId,
                })
              }
            }
          } catch (error) {
            // Failproof: Never let result restoration break session load
            storeLogger.error('Failed to restore valuation result from cache', {
              reportId,
              correlationId,
              error: error instanceof Error ? error.message : String(error),
            })
          }

          // CRITICAL: Form restoration is now handled by useSessionRestoration hook
          // No manual sync needed here - restoration happens automatically in components

          // Record cache hit metric
          globalSessionMetrics.recordOperation('load', true, loadTime, 0, 'cache_hit')

          storeLogger.info('Cache hit - session loaded from cache', {
            reportId,
            correlationId,
            loadTime_ms: loadTime.toFixed(2),
          })

          // Verify with backend in background (non-blocking)
          verifySessionInBackground(reportId, cachedSession)

          return // Return void (interface requirement)
        }

        storeLogger.info('Cache miss - checking backend', {
          reportId,
          correlationId,
        })

        // Record cache miss metric
        globalSessionMetrics.recordOperation('load', false, 0, 0, 'cache_miss')

        // Monitor performance (<500ms target)
        const session = await globalPerformanceMonitor.measure(
          'session-load',
          async () => {
            // Retry with exponential backoff (handles transient failures)
            return await retrySessionOperation(
              async () => {
                // Circuit breaker protection (fast-fail when backend down)
                return await sessionCircuitBreaker.execute(async () => {
                  const sessionResponse = await backendAPI.getValuationSession(reportId)

                  if (!sessionResponse?.session) {
                    throw new Error('Session not found')
                  }

                  // Validate session data (prevents corrupted data crashes)
                  validateSessionData(sessionResponse.session)

                  // Normalize dates
                  const normalizedSession = normalizeSessionDates(sessionResponse.session)

                  // Cache for next time (cache-first optimization)
                  globalSessionCache.set(reportId, normalizedSession)

                  storeLogger.info('Session loaded from backend and cached', {
                    reportId,
                    correlationId,
                  })

                  return normalizedSession
                })
              },
              {
                onRetry: (attempt, error, delay) => {
                  storeLogger.warn('Retrying session load', {
                    reportId,
                    attempt,
                    delay_ms: delay,
                    error: extractErrorMessage(error),
                    correlationId,
                  })

                  // Record retry in metrics
                  globalSessionMetrics.recordOperation(
                    'load',
                    false,
                    performance.now() - startTime,
                    attempt,
                    extractErrorMessage(error)
                  )
                },
              }
            )
          },
          performanceThresholds.sessionLoad,
          { reportId, correlationId }
        )

        // CRITICAL: Restore valuation result if it exists
        // Failproof: Comprehensive error handling
        try {
          const valuationResult =
            (session as any).valuationResult || (session as any).valuation_result
          if (valuationResult && typeof valuationResult === 'object') {
            const resultsStore = useValuationResultsStore.getState()

            // Failproof: Validate result structure before setting
            if (resultsStore && typeof resultsStore.setResult === 'function') {
              // Merge HTML reports from session if not in result
              const fullResult = {
                ...valuationResult,
                html_report:
                  valuationResult.html_report ||
                  (session as any).htmlReport ||
                  (session as any).html_report,
                info_tab_html:
                  valuationResult.info_tab_html ||
                  (session as any).infoTabHtml ||
                  (session as any).info_tab_html,
              }

              resultsStore.setResult(fullResult)

              storeLogger.info('Restored valuation result from backend session', {
                reportId,
                hasHtmlReport: !!fullResult.html_report,
                hasInfoTabHtml: !!fullResult.info_tab_html,
                correlationId,
              })
            } else {
              storeLogger.warn(
                'Cannot restore valuation result: resultsStore.setResult not available',
                {
                  reportId,
                  correlationId,
                }
              )
            }
          }
        } catch (error) {
          // Failproof: Never let result restoration break session load
          storeLogger.error('Failed to restore valuation result from session', {
            reportId,
            correlationId,
            error: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
          })
          // Continue - session load succeeds even if result restoration fails
        }

        // Success - update state
        set({
          session,
          isSaving: false,
          isSyncing: false,
          syncError: null,
        })

        // CRITICAL: Form restoration is now handled by useSessionRestoration hook
        // No manual sync needed here - restoration happens automatically in components

        // Record success in audit trail
        const duration = performance.now() - startTime
        globalAuditTrail.log({
          operation: 'LOAD',
          reportId,
          success: true,
          duration_ms: duration,
          correlationId,
          metadata: {
            sessionId: session.sessionId,
            currentView: session.currentView,
          },
        })

        // Record success in metrics
        globalSessionMetrics.recordOperation('load', true, duration)

        storeLogger.info('Session loaded successfully', {
          reportId,
          sessionId: session.sessionId,
          duration_ms: duration.toFixed(2),
          correlationId,
        })
      } catch (error) {
        const duration = performance.now() - startTime
        const appError = convertToApplicationError(error, { reportId, correlationId })

        // Log with specific error type
        if (isNetworkError(appError)) {
          storeLogger.error('Failed to load session - network error', {
            error: (appError as any).message,
            code: (appError as any).code,
            reportId,
            duration_ms: duration,
            correlationId,
            context: (appError as any).context,
          })
        } else if (isSessionConflictError(appError)) {
          storeLogger.warn('Session conflict during load', {
            error: (appError as any).message,
            code: (appError as any).code,
            reportId,
            duration_ms: duration,
            correlationId,
            context: (appError as any).context,
          })
        } else {
          storeLogger.error('Failed to load session', {
            error: (appError as any).message,
            code: (appError as any).code,
            reportId,
            duration_ms: duration,
            correlationId,
            context: (appError as any).context,
          })
        }

        const errorMessage = getErrorMessage(appError)

        // Record failure in audit trail
        globalAuditTrail.log({
          operation: 'LOAD',
          reportId,
          success: false,
          duration_ms: duration,
          correlationId,
          error: errorMessage,
          metadata: { errorCode: (appError as any).code },
        })

        // Record failure in metrics
        globalSessionMetrics.recordOperation('load', false, duration, 0, extractErrorMessage(error))

        storeLogger.error('Failed to load session after retries', {
          error: extractErrorMessage(error),
          reportId,
          duration_ms: duration.toFixed(2),
          correlationId,
        })

        set({
          isSaving: false,
          isSyncing: false,
          syncError: extractErrorMessage(error),
        })

        // Re-throw so caller can handle (ValuationSessionManager will try to create new)
        throw error
      }
    },

    /**
     * Update session data (merge partial data with deep merging for nested objects)
     * Throttled to prevent excessive API calls
     * Enhanced with save status indicators for M&A workflow trust
     * CACHE INVALIDATION: Updates cache when session data changes
     */
    updateSessionData: async (data: Partial<ValuationRequest>) => {
      const { session } = get()

      if (!session) {
        storeLogger.warn('Cannot update session data: no active session')
        return
      }

      // Mark as having unsaved changes
      set({ hasUnsavedChanges: true })

      // Throttle updates - if called too soon, queue the update
      const now = Date.now()
      const timeSinceLastUpdate = now - lastUpdateTime

      if (timeSinceLastUpdate < UPDATE_THROTTLE_MS) {
        // Clear any pending update
        if (pendingUpdate) {
          clearTimeout(pendingUpdate)
        }

        // Queue this update
        return new Promise<void>((resolve) => {
          pendingUpdate = setTimeout(async () => {
            lastUpdateTime = Date.now()
            pendingUpdate = null
            await get().updateSessionData(data)
            resolve()
          }, UPDATE_THROTTLE_MS - timeSinceLastUpdate)
        })
      }

      // Update immediately
      lastUpdateTime = now

      try {
        set({ isSaving: true, isSyncing: true, syncError: null })

        // Deep merge function for nested objects
        const deepMerge = (target: any, source: any) => {
          const output = { ...target }

          for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
              output[key] = deepMerge(target[key] || {}, source[key])
            } else {
              output[key] = source[key]
            }
          }

          return output
        }

        // Deep merge new data into partialData
        const updatedPartialData = deepMerge(session.partialData, data)

        // Deep merge into sessionData (complete data)
        const updatedSessionData = deepMerge(session.sessionData || {}, data)

        // Determine data source
        let dataSource: 'manual' | 'conversational' | 'mixed' = session.dataSource
        if (session.dataSource !== session.currentView) {
          dataSource = 'mixed'
        }

        const updatedSession: ValuationSession = {
          ...session,
          partialData: updatedPartialData,
          sessionData: updatedSessionData,
          dataSource,
          updatedAt: new Date(),
        }

        // Calculate completeness using functional update to avoid race conditions
        const completeness = get().getCompleteness()
        updatedSession.completeness = completeness

        // Update backend
        await backendAPI.updateValuationSession(session.reportId, {
          partialData: updatedPartialData,
          sessionData: updatedSessionData,
          dataSource,
          currentView: session.currentView,
        })

        set({
          session: updatedSession,
          isSaving: false,
          isSyncing: false,
          lastSaved: new Date(),
          hasUnsavedChanges: false,
          syncError: null,
        })

        // CACHE INVALIDATION: Update cache with latest session data
        globalSessionCache.set(session.reportId, updatedSession)

        storeLogger.debug('Session data updated and cache invalidated', {
          reportId: session.reportId,
          fieldsUpdated: Object.keys(data),
          completeness,
        })
      } catch (error) {
        const appError = convertToApplicationError(error, {
          reportId: session.reportId,
          dataKeys: Object.keys(data),
        })

        // Log with specific error type
        if (isValidationError(appError)) {
          storeLogger.error('Failed to update session data - validation error', {
            error: (appError as any).message,
            code: (appError as any).code,
            reportId: session.reportId,
            context: (appError as any).context,
          })
        } else if (isNetworkError(appError)) {
          storeLogger.error('Failed to update session data - network error', {
            error: (appError as any).message,
            code: (appError as any).code,
            reportId: session.reportId,
            context: (appError as any).context,
          })
        } else {
          storeLogger.error('Failed to update session data', {
            error: (appError as any).message,
            code: (appError as any).code,
            reportId: session.reportId,
            context: (appError as any).context,
          })
        }

        // Deep merge function for fallback
        const deepMerge = (target: any, source: any) => {
          const output = { ...target }

          for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
              output[key] = deepMerge(target[key] || {}, source[key])
            } else {
              output[key] = source[key]
            }
          }

          return output
        }

        // Update local state even if backend fails
        const updatedPartialData = deepMerge(session.partialData, data)
        const updatedSessionData = deepMerge(session.sessionData || {}, data)
        let dataSource: 'manual' | 'conversational' | 'mixed' = session.dataSource
        if (session.dataSource !== session.currentView) {
          dataSource = 'mixed'
        }

        // Calculate completeness (use temp session for calculation only, no state update)
        const tempSession = { ...session, sessionData: updatedSessionData }
        const completeness = get().getCompleteness()

        const fallbackUpdatedSession: ValuationSession = {
          ...session,
          partialData: updatedPartialData,
          sessionData: updatedSessionData,
          dataSource,
          updatedAt: new Date(),
          completeness,
        }

        set({
          session: fallbackUpdatedSession,
          isSaving: false,
          isSyncing: false,
          syncError: (error as any)?.message || 'Failed to sync with backend',
        })

        // CACHE INVALIDATION: Update cache even on error (local state is still updated)
        globalSessionCache.set(session.reportId, fallbackUpdatedSession)
      }
    },

    /**
     * Switch between manual and AI-guided views
     *
     * This function is idempotent and safe to call multiple times.
     * It prevents race conditions by checking current state before updating.
     *
     * @param view - Target view to switch to
     * @param resetData - Whether to reset session data (default: true for user-initiated switches)
     * @param skipConfirmation - Skip confirmation dialog (for programmatic switches)
     * @returns Object with needsConfirmation flag if confirmation is required
     */
    switchView: async (
      view: 'manual' | 'conversational',
      resetData: boolean = true,
      skipConfirmation: boolean = false
    ) => {
      const { session } = get()

      if (!session) {
        storeLogger.warn('Cannot switch view: no active session')
        return
      }

      // Idempotency check: if already in target view, no-op
      if (session.currentView === view) {
        storeLogger.debug('Already in target view', { reportId: session.reportId, view })
        return
      }

      // Check if confirmation is needed (for all user-initiated switches)
      // This check happens BEFORE the atomic lock to avoid setting isSyncing unnecessarily
      if (!skipConfirmation) {
        // Always show confirmation for user-initiated switches
        // This gives users a chance to confirm before switching flows
        storeLogger.info('Flow switch requires confirmation', {
          reportId: session.reportId,
          currentView: session.currentView,
          targetView: view,
          resetData,
        })

        // Set pending switch for modal to access
        set({ pendingFlowSwitch: view })

        // Return early - caller should show confirmation modal
        return { needsConfirmation: true }
      }

      // CRITICAL FIX: Atomic check-and-set to prevent concurrent switches
      // Use Zustand's set callback to atomically check and set isSyncing flag
      // This prevents race conditions where multiple requests pass the check simultaneously
      let lockAcquired = false
      set((state) => {
        if (state.isSyncing) {
          // Another switch is already in progress
          storeLogger.warn('Switch already in progress, ignoring concurrent request', {
            reportId: session.reportId,
            requestedView: view,
          })
          return state // Return unchanged state
        }
        // Atomically acquire the lock
        lockAcquired = true
        return { ...state, isSyncing: true, syncError: null }
      })

      // If we didn't acquire the lock, another request is handling the switch
      if (!lockAcquired) {
        return
      }

      // CRITICAL FIX: Clear valuation results when switching flows
      // This prevents the regeneration modal from appearing incorrectly
      // Results are flow-specific and should not carry over between flows
      try {
        const { useValuationResultsStore } = await import('./useValuationResultsStore')
        useValuationResultsStore.getState().clearResult()
        storeLogger.info('Cleared valuation result on flow switch', {
          from: session.currentView,
          to: view,
        })
      } catch (error) {
        storeLogger.error('Failed to clear result on flow switch', { error })
      }

      // Clear pending switch since we're proceeding
      set({ pendingFlowSwitch: null })

      // Re-check session state after setting syncing flag to prevent race conditions
      const { session: currentSession } = get()
      if (!currentSession || currentSession.reportId !== session.reportId) {
        storeLogger.warn('Session changed during switch, aborting', {
          originalReportId: session.reportId,
        })
        set({ isSyncing: false })
        return
      }

      // Double-check we're not already in the target view (race condition protection)
      if (currentSession.currentView === view) {
        storeLogger.debug('Already in target view (race condition check)', {
          reportId: currentSession.reportId,
          view,
        })
        set({ isSyncing: false })
        return
      }

      // Store original session for potential rollback
      const originalSession = { ...currentSession }

      const updatedSession: ValuationSession = {
        ...currentSession,
        currentView: view,
        updatedAt: new Date(),
      }

      // If resetData is true, keep only _prefilledQuery, discard everything else
      if (resetData) {
        const prefilledQuery = (currentSession.partialData as any)?._prefilledQuery
        updatedSession.partialData = prefilledQuery
          ? ({ _prefilledQuery: prefilledQuery } as any)
          : {}
        updatedSession.sessionData = {}
        updatedSession.dataSource = view // Reset to single source
        storeLogger.info('Resetting session data on flow switch', {
          reportId: currentSession.reportId,
          preservedPrefilledQuery: !!prefilledQuery,
        })
      }

      // OPTIMISTIC UPDATE: Update UI immediately for instant feedback
      set({
        session: updatedSession,
        isSyncing: true, // Keep syncing flag true during background sync
        syncError: null,
      })

      // CACHE INVALIDATION: Update cache with switched session
      globalSessionCache.set(currentSession.reportId, updatedSession)

      storeLogger.info('View switched optimistically (UI updated immediately)', {
        reportId: currentSession.reportId,
        from: currentSession.currentView,
        to: view,
        resetData,
      })

      // Background sync: Update backend asynchronously (non-blocking)
      // URL will be synced by useEffect in ValuationReport.tsx
      backendAPI
        .switchValuationView(currentSession.reportId, view)
        .then(() => {
          // Backend sync successful - clear syncing flag using functional update (atomic)
          set((state) => {
            const latestSession = state.session
            if (!latestSession || latestSession.reportId !== currentSession.reportId) {
              return state // No change if session mismatch
            }

            // CACHE INVALIDATION: Update cache with latest session after backend sync
            globalSessionCache.set(currentSession.reportId, latestSession)

            storeLogger.info('Backend sync completed successfully', {
              reportId: currentSession.reportId,
              view,
            })

            return {
              ...state,
              isSyncing: false,
              syncError: null,
            }
          })
        })
        .catch((error) => {
          const appError = convertToApplicationError(error, {
            reportId: currentSession.reportId,
            requestedView: view,
          })

          const errorMessage = getErrorMessage(appError)

          // Log with specific error type
          if (isNetworkError(appError)) {
            storeLogger.error('Failed to sync view switch with backend - network error', {
              error: (appError as any).message,
              code: (appError as any).code,
              reportId: currentSession.reportId,
              requestedView: view,
              context: (appError as any).context,
            })
          } else if (isSessionConflictError(appError)) {
            storeLogger.warn('Session conflict during view switch', {
              error: (appError as any).message,
              code: (appError as any).code,
              reportId: currentSession.reportId,
              requestedView: view,
              context: (appError as any).context,
            })
          } else {
            storeLogger.error('Failed to sync view switch with backend', {
              error: (appError as any).message,
              code: (appError as any).code,
              reportId: currentSession.reportId,
              requestedView: view,
              context: (appError as any).context,
            })
          }

          // FIX: Don't rollback on switch error - keep optimistic update
          // The user has already switched flows, so rolling back would be confusing
          // Instead, just log the error and clear syncing flag
          // The session will remain in the switched state, and we'll retry on next action
          const { session: latestSession } = get()
          if (latestSession?.reportId === currentSession.reportId) {
            // Keep the switched state, just mark sync as failed
            set({
              isSyncing: false,
              syncError: errorMessage,
            })
            storeLogger.warn('View switch backend sync failed, keeping optimistic update', {
              reportId: currentSession.reportId,
              currentView: latestSession.currentView,
              error: errorMessage,
            })
          } else {
            // Session changed, just clear syncing flag
            set({ isSyncing: false, syncError: errorMessage })
          }
        })
    },

    /**
     * Get complete session data as ValuationRequest
     * Returns null if session is not initialized or data is incomplete
     */
    getSessionData: () => {
      const { session } = get()

      if (!session || !session.sessionData) {
        return null
      }

      // CRITICAL FIX: Filter out empty/null/zero values before returning
      // Bank-Grade Principle: Reliability - Don't return misleading data
      // WHAT: Removes keys with null/undefined/empty/zero values from sessionData
      // WHY: Prevents frontend from showing welcome messages for non-existent data
      // HOW: Filters out keys where values are null, undefined, empty string, or zero
      // WHEN: When retrieving session data for initialData prop
      const sessionData = session.sessionData as ValuationRequest

      // Helper to check if value is meaningful
      // CRITICAL FIX: EBITDA can be zero or negative, so don't exclude zero for financial fields
      // Bank-Grade Principle: Reliability - Don't filter out valid zero/negative financial values
      // WHAT: Checks if value is meaningful, with special handling for financial fields
      // WHY: EBITDA and other financial metrics can legitimately be zero or negative
      // HOW: Validates value exists and is appropriate type, allows zero for numbers
      // WHEN: When filtering sessionData before returning
      const hasMeaningfulValue = (value: any, fieldName?: string): boolean => {
        if (value === null || value === undefined) return false
        if (typeof value === 'string' && value.trim() === '') return false
        // CRITICAL: Don't exclude zero for financial fields where zero is valid (ebitda can be zero/negative)
        // But exclude zero for revenue (business must have revenue) and counts (employee_count, etc.)
        if (typeof value === 'number') {
          // Financial fields where zero IS valid: ebitda (can be zero or negative)
          // Financial fields where zero is NOT meaningful: revenue (business must have revenue)
          // Non-financial fields: employee_count, etc. (zero is not meaningful)
          const fieldsAllowZero = ['ebitda'] // Only EBITDA can legitimately be zero or negative
          if (value === 0 && !fieldsAllowZero.includes(fieldName || '')) {
            return false // Zero revenue/employees/etc. is not meaningful
          }
          // Non-zero numbers or zero for allowed fields are meaningful
          return true
        }
        if (Array.isArray(value) && value.length === 0) return false
        if (typeof value === 'object' && value !== null && Object.keys(value).length === 0)
          return false
        return true
      }

      // Filter out keys with non-meaningful values
      const filteredData: any = {}
      for (const [key, value] of Object.entries(sessionData)) {
        // Special handling for nested objects like current_year_data
        if (key === 'current_year_data' && typeof value === 'object' && value !== null) {
          const nestedFiltered: any = {}
          for (const [nestedKey, nestedValue] of Object.entries(value as any)) {
            if (hasMeaningfulValue(nestedValue)) {
              nestedFiltered[nestedKey] = nestedValue
            }
          }
          if (Object.keys(nestedFiltered).length > 0) {
            filteredData[key] = nestedFiltered
          }
        } else if (hasMeaningfulValue(value, key)) {
          filteredData[key] = value
        }
      }

      // Only return filtered data if it has at least one meaningful field
      // Return null if all values were filtered out (empty object)
      if (Object.keys(filteredData).length === 0) {
        return null
      }

      // Return sessionData as ValuationRequest (now filtered)
      // Note: This may be partial data, components should validate required fields
      return filteredData as ValuationRequest
    },

    /**
     * Clear session (reset to initial state)
     */
    clearSession: () => {
      set({
        session: null,
        isSyncing: false,
        syncError: null,
      })
      storeLogger.info('Session cleared')
    },

    /**
     * Save complete session atomically
     *
     * Saves all data in a single atomic operation:
     * - Form data (all input fields)
     * - Valuation results (final_valuation, calculated_at, etc.)
     * - HTML reports (main report and info tab)
     *
     * This ensures no partial states and smooth restoration on revisit.
     */
    saveCompleteSession: async (data: {
      formData?: ValuationFormData
      valuationResult?: any
      htmlReport?: string
      infoTabHtml?: string
    }) => {
      const { session } = get()

      if (!session) {
        storeLogger.warn('Cannot save complete session: no active session')
        return
      }

      try {
        set({ isSaving: true, isSyncing: true, syncError: null })

        storeLogger.info('Saving complete session', {
          reportId: session.reportId,
          hasFormData: !!data.formData,
          hasResult: !!data.valuationResult,
          hasHtmlReport: !!data.htmlReport,
          hasInfoTab: !!data.infoTabHtml,
        })

        // Import SessionAPI dynamically to avoid circular dependencies
        const { SessionAPI } = await import('../services/api/session/SessionAPI')
        const sessionAPI = new SessionAPI()

        // Prepare complete session data
        const sessionUpdate: Partial<ValuationRequest> = {}

        // Merge form data if provided
        if (data.formData) {
          Object.assign(sessionUpdate, {
            company_name: data.formData.company_name,
            country_code: data.formData.country_code,
            industry: data.formData.industry,
            business_model: data.formData.business_model,
            founding_year: data.formData.founding_year,
            current_year_data: data.formData.current_year_data,
            historical_years_data: data.formData.historical_years_data,
            number_of_employees: data.formData.number_of_employees,
            number_of_owners: data.formData.number_of_owners,
            recurring_revenue_percentage: data.formData.recurring_revenue_percentage,
            shares_for_sale: data.formData.shares_for_sale,
            business_type_id: data.formData.business_type_id,
            business_context: data.formData.business_context,
            comparables: data.formData.comparables,
          })
        }

        // Add valuation result data if provided
        if (data.valuationResult) {
          Object.assign(sessionUpdate, {
            valuation_result: data.valuationResult,
          })
        }

        // Add HTML reports if provided
        if (data.htmlReport) {
          Object.assign(sessionUpdate, {
            html_report: data.htmlReport,
          })
        }

        if (data.infoTabHtml) {
          Object.assign(sessionUpdate, {
            info_tab_html: data.infoTabHtml,
          })
        }

        // CRITICAL: Use functional update to get latest session state atomically
        // This prevents race conditions if session changes during save
        let currentSession: ValuationSession | null = null
        let updatedSession: ValuationSession | null = null
        let updatedSessionData: ValuationRequest | null = null

        // Deep merge function for nested objects (defined outside set for reuse)
        const deepMerge = (target: any, source: any) => {
          const output = { ...target }
          const isObject = (item: any) => {
            return item && typeof item === 'object' && !Array.isArray(item)
          }
          if (isObject(target) && isObject(source)) {
            Object.keys(source).forEach((key) => {
              if (isObject(source[key]) && !Array.isArray(source[key])) {
                if (!(key in target)) {
                  Object.assign(output, { [key]: source[key] })
                } else {
                  output[key] = deepMerge(target[key], source[key])
                }
              } else {
                Object.assign(output, { [key]: source[key] })
              }
            })
          }
          return output
        }

        set((state) => {
          currentSession = state.session
          if (!currentSession) {
            throw new Error('Session lost during save')
          }

          // Merge session data without triggering hasUnsavedChanges
          updatedSessionData = deepMerge(
            currentSession.sessionData || {},
            sessionUpdate
          ) as ValuationRequest

          updatedSession = {
            ...currentSession,
            sessionData: updatedSessionData,
            updatedAt: new Date(),
          }

          // Update cache atomically
          globalSessionCache.set(currentSession.reportId, updatedSession)

          // Return updated state WITHOUT setting hasUnsavedChanges
          return {
            ...state,
            session: updatedSession,
            isSaving: true, // Keep saving state true
            isSyncing: true,
            syncError: null,
            // CRITICAL: Don't set hasUnsavedChanges here - we'll set it to false at the end
          }
        })

        // Ensure we have the session (should always be true after set above)
        if (!currentSession || !updatedSession || !updatedSessionData) {
          throw new Error('Session lost during save')
        }

        // CRITICAL: Update backend session data (without triggering hasUnsavedChanges)
        // This ensures form data and other session data is saved
        try {
          await backendAPI.updateValuationSession(currentSession.reportId, {
            partialData: updatedSession.partialData || currentSession.partialData || {},
            sessionData: updatedSessionData,
            dataSource: currentSession.dataSource,
            currentView: currentSession.currentView,
          })
          storeLogger.debug('Session data updated in backend (via saveCompleteSession)', {
            reportId: currentSession.reportId,
            fieldsUpdated: Object.keys(sessionUpdate).length,
          })
        } catch (backendError) {
          // Log but don't fail - valuation result save will still happen
          storeLogger.warn('Failed to update session data in backend (non-critical)', {
            reportId: currentSession.reportId,
            error: backendError instanceof Error ? backendError.message : String(backendError),
          })
        }

        // Save valuation result to backend (if provided)
        if (data.valuationResult || data.htmlReport || data.infoTabHtml) {
          try {
            await sessionAPI.saveValuationResult(currentSession.reportId, {
              valuationResult: data.valuationResult,
              htmlReport: data.htmlReport,
              infoTabHtml: data.infoTabHtml,
            })

            storeLogger.info('Valuation result saved to backend', {
              reportId: currentSession.reportId,
              hasHtmlReport: !!data.htmlReport,
              htmlLength: data.htmlReport?.length || 0,
              hasInfoTab: !!data.infoTabHtml,
              infoLength: data.infoTabHtml?.length || 0,
            })

            // CRITICAL: Update session store and cache with valuation results after saving
            // Use functional update to ensure atomic state update (prevents race conditions)
            set((state) => {
              const latestSession = state.session
              if (!latestSession || latestSession.reportId !== currentSession.reportId) {
                return state // No change if session mismatch
              }

              const updatedSessionWithResults: ValuationSession = {
                ...latestSession,
                valuationResult: data.valuationResult || latestSession.valuationResult,
                htmlReport: data.htmlReport || latestSession.htmlReport,
                infoTabHtml: data.infoTabHtml || latestSession.infoTabHtml,
                updatedAt: new Date(),
              }

              // Update cache atomically
              globalSessionCache.set(currentSession.reportId, updatedSessionWithResults)

              storeLogger.debug('Session store and cache updated with valuation results', {
                reportId: currentSession.reportId,
                hasHtmlReport: !!updatedSessionWithResults.htmlReport,
                hasInfoTabHtml: !!updatedSessionWithResults.infoTabHtml,
              })

              return {
                ...state,
                session: updatedSessionWithResults,
              }
            })
          } catch (saveError) {
            // Log but don't fail - session data is already saved locally
            storeLogger.error('Failed to save valuation result to backend', {
              reportId: currentSession.reportId,
              error: saveError instanceof Error ? saveError.message : String(saveError),
            })
          }
        }

        // Mark save as complete
        set({
          isSaving: false,
          isSyncing: false,
          hasUnsavedChanges: false,
          lastSaved: new Date(),
          syncError: null,
        })

        storeLogger.info('Complete session saved successfully', {
          reportId: currentSession.reportId,
        })
      } catch (error) {
        const { session: errorSession } = get()
        const errorReportId = errorSession?.reportId || 'unknown'
        const appError = convertToApplicationError(error, {
          reportId: errorReportId,
        })

        const errorMessage = getErrorMessage(appError)

        set({
          isSaving: false,
          isSyncing: false,
          syncError: errorMessage,
        })

        // Log with specific error type
        if (isNetworkError(appError)) {
          storeLogger.error('Failed to save complete session - network error', {
            error: (appError as any).message,
            code: (appError as any).code,
            reportId: errorReportId,
            context: (appError as any).context,
          })
        } else if (isValidationError(appError)) {
          storeLogger.error('Failed to save complete session - validation error', {
            error: (appError as any).message,
            code: (appError as any).code,
            reportId: errorReportId,
            context: (appError as any).context,
          })
        } else {
          storeLogger.error('Failed to save complete session', {
            error: (appError as any).message,
            code: (appError as any).code,
            reportId: errorReportId,
            context: (appError as any).context,
          })
        }

        // Re-throw to allow caller to handle
        throw appError
      }
    },

    /**
     * Calculate data completeness percentage (0-100)
     * Based on required fields for valuation
     */
    getCompleteness: () => {
      const { session } = get()

      if (!session || !session.sessionData) {
        return 0
      }

      const data = session.sessionData

      // Define required fields with weights
      const requiredFields = [
        { key: 'company_name', weight: 1 },
        { key: 'country_code', weight: 1 },
        { key: 'industry', weight: 1 },
        { key: 'business_model', weight: 1 },
        { key: 'founding_year', weight: 1 },
        { key: 'current_year_data.revenue', weight: 2 },
        { key: 'current_year_data.ebitda', weight: 2 },
      ]

      let completedWeight = 0
      let totalWeight = 0

      requiredFields.forEach(({ key, weight }) => {
        totalWeight += weight

        // Handle nested keys
        if (key.includes('.')) {
          const [parent, child] = key.split('.')
          if (
            data[parent as keyof typeof data] &&
            (data[parent as keyof typeof data] as any)[child] !== undefined &&
            (data[parent as keyof typeof data] as any)[child] !== null &&
            (data[parent as keyof typeof data] as any)[child] !== ''
          ) {
            completedWeight += weight
          }
        } else {
          if (
            data[key as keyof typeof data] !== undefined &&
            data[key as keyof typeof data] !== null &&
            data[key as keyof typeof data] !== ''
          ) {
            completedWeight += weight
          }
        }
      })

      const completeness = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0

      return completeness
    },

    /**
     * Set pending flow switch (for confirmation modal)
     */
    setPendingFlowSwitch: (view: 'manual' | 'conversational' | null) => {
      set({ pendingFlowSwitch: view })
    },

    // Save status actions (simple and robust)
    markReportSaved: () => {
      set({
        hasUnsavedChanges: false,
        lastSaved: new Date(),
        isSaving: false,
        syncError: null,
      })
    },
    markReportSaving: () => {
      set({ isSaving: true, syncError: null })
    },
    markReportSaveFailed: (error: string) => {
      set({
        isSaving: false,
        syncError: error,
      })
    },
  }
})
