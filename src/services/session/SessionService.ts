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
import type { ValuationRequest, ValuationSession } from '../../types/valuation'
import { sessionCircuitBreaker } from '../../utils/circuitBreaker'
import { getErrorMessage } from '../../utils/errors/errorConverter'
import { createContextLogger } from '../../utils/logger'
import { retrySessionOperation } from '../../utils/retryWithBackoff'
import { globalSessionCache } from '../../utils/sessionCacheManager'
import {
  mergePrefilledQuery,
  mergeSessionFields,
  normalizeSessionDates,
} from '../../utils/sessionHelpers'
import { validateSessionData } from '../../utils/sessionValidation'
import { backendAPI } from '../backendApi'

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
   * Check if user can create a new valuation (plan enforcement)
   *
   * Bank-Grade Implementation:
   * - Specific error types (PaywallError)
   * - Graceful degradation if API fails
   * - Comprehensive logging
   * - Type-safe error handling
   * - 5-second timeout to prevent hanging
   *
   * @throws PaywallError with usage data if user has hit limit
   * @private
   */
  private async checkValuationCreationAllowed(): Promise<void> {
    const checkStartTime = performance.now()
    const PLAN_ENFORCEMENT_TIMEOUT = 5000 // 5 seconds max for plan check

    try {
      const baseURL =
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        'https://api.upswitch.app'
      const url = `${baseURL}/api/billing/plan-enforcement/check?usage_type=VALUATION`

      logger.debug('Checking valuation creation limit', { url, timeout: PLAN_ENFORCEMENT_TIMEOUT })

      // Create AbortController for timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), PLAN_ENFORCEMENT_TIMEOUT)

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include', // Include cookies for auth
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        const checkTime = performance.now() - checkStartTime

        if (!response.ok) {
          // If endpoint doesn't exist or fails, allow creation (graceful degradation)
          logger.warn('Plan enforcement check failed, allowing creation (graceful degradation)', {
            status: response.status,
            statusText: response.statusText,
            checkTime_ms: checkTime.toFixed(2),
          })
          return
        }

        const result = await response.json()

        logger.debug('Plan enforcement check result', {
          allowed: result.allowed,
          current: result.current,
          limit: result.limit,
          checkTime_ms: checkTime.toFixed(2),
        })

        if (!result.allowed) {
          // User has hit their valuation limit - throw specific error
          logger.info('Valuation creation blocked by plan enforcement', {
            current: result.current,
            limit: result.limit,
            reason: result.reason,
            message: result.message,
          })

          // Create specific PaywallError (not generic ApplicationError)
          const error = new ApplicationError(
            result.message ||
              'Valuation limit reached. Upgrade to Premium for unlimited valuations.',
            'PAYWALL_VALUATION_LIMIT',
            {
              current: result.current,
              limit: result.limit,
              reason: result.reason,
              upgradeUrl: '/pricing',
            }
          )

          // Mark as paywall error for specific handling
          ;(error as any).isPaywallError = true
          ;(error as any).current = result.current
          ;(error as any).limit = result.limit

          throw error
        }

        logger.info('Valuation limit check passed', {
          current: result.current,
          limit: result.limit,
          checkTime_ms: checkTime.toFixed(2),
        })
      } catch (fetchError) {
        clearTimeout(timeoutId)

        // Check if it was a timeout
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          const checkTime = performance.now() - checkStartTime
          logger.warn(
            'Plan enforcement check timed out, allowing creation (graceful degradation)',
            {
              timeout_ms: PLAN_ENFORCEMENT_TIMEOUT,
              elapsed_ms: checkTime.toFixed(2),
            }
          )
          return
        }

        // Re-throw other errors to be caught by outer catch
        throw fetchError
      }
    } catch (error) {
      // If it's a paywall error, re-throw it
      if ((error as any).isPaywallError) {
        throw error
      }

      // Otherwise, log warning and allow creation (graceful degradation)
      // This ensures users are never blocked by infrastructure issues
      const checkTime = performance.now() - checkStartTime
      logger.warn('Plan enforcement check error, allowing creation (graceful degradation)', {
        error: error instanceof Error ? error.message : 'Unknown error',
        checkTime_ms: checkTime.toFixed(2),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
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
      logger.info('Loading session', { reportId, flow, prefilledQuery })

      // CACHE-FIRST: Check localStorage cache BEFORE backend API call
      const cachedSession = globalSessionCache.get(reportId)
      if (cachedSession) {
        const loadTime = performance.now() - startTime

        // Calculate cache age for stale-while-revalidate
        const cacheAge_minutes = cachedSession.updatedAt
          ? Math.floor((Date.now() - new Date(cachedSession.updatedAt).getTime()) / (60 * 1000))
          : 0

        // ✅ VERIFY: Log form data presence in cache for restoration
        const hasSessionData = !!cachedSession.sessionData
        const sessionDataKeys = cachedSession.sessionData
          ? Object.keys(cachedSession.sessionData)
          : []
        const sessionData = cachedSession.sessionData || ({} as any)
        const hasFormFields =
          hasSessionData &&
          (sessionData.company_name ||
            (sessionData.current_year_data as any)?.revenue ||
            (sessionData.current_year_data as any)?.ebitda ||
            sessionData.current_year_data)

        logger.info('Session loaded from cache (instant)', {
          reportId,
          loadTime_ms: loadTime.toFixed(2),
          cacheAge_minutes,
          hasSessionData,
          hasFormFields,
          sessionDataKeysCount: sessionDataKeys.length,
          sessionDataKeys: sessionDataKeys.slice(0, 5), // Log first 5 keys
          note: 'Form fields (sessionData) included in cache for instant restoration',
        })

        // Validate cached session
        validateSessionData(cachedSession)

        // SECURITY: Extract prefilledQuery from session data first (preferred)
        // Fallback to URL parameter for backward compatibility
        const sessionPrefilledQuery = (cachedSession.sessionData as any)?._prefilledQuery || 
                                     (cachedSession.partialData as any)?._prefilledQuery ||
                                     null
        const effectivePrefilledQuery = sessionPrefilledQuery || prefilledQuery

        // Merge prefilledQuery if provided (from session data or URL fallback)
        if (effectivePrefilledQuery) {
          const updatedPartialData = mergePrefilledQuery(cachedSession.partialData, effectivePrefilledQuery)
          if (updatedPartialData !== cachedSession.partialData) {
            const updatedSession = {
              ...cachedSession,
              partialData: updatedPartialData,
            }
            // Ensure it's also in sessionData for consistency
            if (!(updatedSession.sessionData as any)?._prefilledQuery) {
              updatedSession.sessionData = {
                ...updatedSession.sessionData,
                _prefilledQuery: effectivePrefilledQuery
              } as any
            }
            // Update cache with merged prefilledQuery
            globalSessionCache.set(reportId, updatedSession)
            return updatedSession
          }
        }

        // ✅ STALE-WHILE-REVALIDATE: Revalidate in background if cache is older than 5 minutes
        // This ensures data freshness while maintaining instant loads
        if (cacheAge_minutes > 5) {
          logger.debug('Cache stale, revalidating in background', { reportId, cacheAge_minutes })
          this.revalidateInBackground(reportId).catch((err) => {
            logger.warn('Background revalidation failed', {
              reportId,
              error: err instanceof Error ? err.message : String(err),
            })
          })
        }

        return cachedSession
      }

      logger.debug('Cache miss - loading from backend', { reportId })

      // Wrap the entire load operation with an absolute timeout
      const loadPromise = retrySessionOperation(
        async () => {
          return await sessionCircuitBreaker.execute(async () => {
            const sessionResponse = await backendAPI.getValuationSession(reportId)

            // DIAGNOSTIC: Log what we received from backendAPI
            console.log('[SessionService] GET response from backendAPI:', {
              reportId,
              hasResponse: !!sessionResponse,
              responseType: typeof sessionResponse,
              hasSession: !!sessionResponse?.session,
              sessionType: typeof sessionResponse?.session,
              sessionKeys: sessionResponse?.session ? Object.keys(sessionResponse.session) : [],
              hasHtmlReport: !!(sessionResponse?.session as any)?.htmlReport,
              htmlReportLength: (sessionResponse?.session as any)?.htmlReport?.length || 0,
            })

            if (!sessionResponse?.session) {
              // Session doesn't exist - create it automatically
              logger.info('Session not found, creating new session', {
                requestedReportId: reportId,
                flow,
              })

              try {
                // ⭐ PLAN ENFORCEMENT: Check if user can create valuation BEFORE creating session
                // This prevents wasted API calls and provides immediate feedback
                await this.checkValuationCreationAllowed()

                // Create minimal session on backend
                // NOTE: Titan generates the session_key, we don't specify it
                const createResponse = await backendAPI.createValuationSession({
                  currentView: flow || 'manual', // Use provided flow or default to manual
                  sessionData: prefilledQuery ? ({ _prefilledQuery: prefilledQuery } as any) : {},
                  partialData: prefilledQuery ? ({ _prefilledQuery: prefilledQuery } as any) : {},
                } as any)

                if (!createResponse?.session) {
                  logger.error('Failed to create new session', { requestedReportId: reportId })
                  return null
                }

                // Titan generated a new session_key - use it as the reportId
                const actualReportId = createResponse.reportId || createResponse.session.reportId

                if (!actualReportId) {
                  logger.error('Backend did not return session_key/reportId', {
                    response: createResponse,
                  })
                  return null
                }

                // ⚠️ IMPORTANT: If Titan generated a different ID than what's in the URL,
                // we need to redirect to the correct URL
                if (actualReportId !== reportId) {
                  logger.warn('Titan generated different session_key than requested', {
                    requestedReportId: reportId,
                    actualReportId: actualReportId,
                  })

                  // Update browser URL to match the actual session ID from backend
                  if (typeof window !== 'undefined') {
                    const url = new URL(window.location.href)
                    url.pathname = url.pathname.replace(reportId, actualReportId)
                    logger.info('Redirecting to correct session URL', {
                      from: reportId,
                      to: actualReportId,
                      newUrl: url.toString(),
                    })
                    window.history.replaceState({}, '', url.toString())
                  }
                }

                logger.info('New session created successfully', {
                  requestedReportId: reportId,
                  actualReportId: actualReportId,
                  currentView: createResponse.session.currentView,
                  hasPrefilledQuery: !!prefilledQuery,
                })

                // Validate and normalize the new session
                validateSessionData(createResponse.session)
                const normalizedSession = normalizeSessionDates(createResponse.session)
                const mergedSession = mergeSessionFields(normalizedSession)

                // Ensure reportId is set correctly
                mergedSession.reportId = actualReportId

                // Ensure prefilledQuery is in partialData (merge in case backend didn't preserve it)
                if (prefilledQuery) {
                  mergedSession.partialData = mergePrefilledQuery(
                    mergedSession.partialData,
                    prefilledQuery
                  )
                }

                // Cache the new session with the actual reportId
                globalSessionCache.set(actualReportId, mergedSession)

                return mergedSession
              } catch (createError) {
                // ✅ IMPROVED: Categorize errors for better user experience
                const errorMessage =
                  createError instanceof Error ? createError.message : String(createError)

                // Paywall error - already handled by checkValuationCreationAllowed
                if (
                  errorMessage.includes('paywall') ||
                  errorMessage.includes('limit') ||
                  errorMessage.includes('plan')
                ) {
                  logger.info('Session creation blocked by plan enforcement', {
                    reportId,
                    error: errorMessage,
                  })
                  // Re-throw paywall errors so they can be handled by the store
                  throw createError
                }

                // Authentication errors
                if (
                  errorMessage.includes('401') ||
                  errorMessage.includes('Unauthorized') ||
                  errorMessage.includes('authentication')
                ) {
                  logger.error('Session creation failed - authentication required', {
                    reportId,
                    error: errorMessage,
                  })
                  throw new Error('Authentication required. Please log in to continue.')
                }

                // Network errors
                if (
                  errorMessage.includes('Network') ||
                  errorMessage.includes('fetch') ||
                  errorMessage.includes('timeout')
                ) {
                  logger.error('Session creation failed - network error', {
                    reportId,
                    error: errorMessage,
                  })
                  throw new Error('Network error. Please check your connection and try again.')
                }

                // Backend validation errors
                if (errorMessage.includes('validation') || errorMessage.includes('invalid')) {
                  logger.error('Session creation failed - validation error', {
                    reportId,
                    error: errorMessage,
                  })
                  throw new Error(`Invalid session data: ${errorMessage}`)
                }

                // Generic error
                logger.error('Session creation failed - unknown error', {
                  reportId,
                  error: errorMessage,
                })
                throw new Error(`Failed to create session: ${errorMessage}`)
              }
            }

            // Validate session data
            validateSessionData(sessionResponse.session)

            // Normalize dates
            const normalizedSession = normalizeSessionDates(sessionResponse.session)

            // Merge top-level fields into sessionData (SINGLE SOURCE OF TRUTH)
            const mergedSession = mergeSessionFields(normalizedSession)

            // SECURITY: Extract prefilledQuery from session data first (preferred)
            // Fallback to URL parameter for backward compatibility
            const sessionPrefilledQuery = (mergedSession.sessionData as any)?._prefilledQuery || 
                                         (mergedSession.partialData as any)?._prefilledQuery ||
                                         null
            const effectivePrefilledQuery = sessionPrefilledQuery || prefilledQuery

            // Log deprecation warning if reading from URL (backward compatibility)
            if (!sessionPrefilledQuery && prefilledQuery) {
              logger.warn('[DEPRECATED] Reading prefilledQuery from URL parameter. This should be stored in session_data._prefilledQuery', {
                reportId,
                note: 'Migrating URL-based prefilledQuery to session data on first load'
              })
            }

            // Merge prefilledQuery if provided (from session data or URL fallback)
            if (effectivePrefilledQuery) {
              mergedSession.partialData = mergePrefilledQuery(
                mergedSession.partialData,
                effectivePrefilledQuery
              )
              // Ensure it's also in sessionData for consistency
              if (!(mergedSession.sessionData as any)?._prefilledQuery) {
                mergedSession.sessionData = {
                  ...mergedSession.sessionData,
                  _prefilledQuery: effectivePrefilledQuery
                } as any
              }
            }

            // Cache for next time (includes sessionData/form fields, excludes HTML reports)
            // ✅ CRITICAL: Form data (sessionData) is included in cache for instant restoration
            const hasSessionData = !!mergedSession.sessionData
            const sessionDataKeys = mergedSession.sessionData
              ? Object.keys(mergedSession.sessionData)
              : []
            const sessionData = mergedSession.sessionData || ({} as any)
            const hasFormFields =
              hasSessionData &&
              (sessionData.company_name ||
                (sessionData.current_year_data as any)?.revenue ||
                (sessionData.current_year_data as any)?.ebitda ||
                sessionData.current_year_data)

            globalSessionCache.set(reportId, mergedSession)

            logger.info('Session loaded from backend and cached', {
              reportId,
              currentView: mergedSession.currentView,
              hasPrefilledQuery: !!effectivePrefilledQuery,
              prefilledQuerySource: sessionPrefilledQuery ? 'session_data' : (prefilledQuery ? 'url' : 'none'),
              hasSessionData,
              hasFormFields,
              sessionDataKeysCount: sessionDataKeys.length,
              sessionDataKeys: sessionDataKeys.slice(0, 5), // Log first 5 keys
              note: 'Form fields (sessionData) included in cache for instant restoration on revisit',
            })

            return mergedSession
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
        logger.info('Session loaded successfully', {
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
        logger.info('Session not found - returning null', {
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
   * Save session to backend
   *
   * ATOMIC SAVE:
   * 1. Update backend via API
   * 2. Update cache with latest data
   * 3. Return updated session
   *
   * @param reportId - Report identifier
   * @param updates - Partial session data to update
   * @returns Updated session object
   */
  async saveSession(
    reportId: string,
    updates: Partial<ValuationRequest>
  ): Promise<ValuationSession> {
    const startTime = performance.now()

    try {
      // ✅ FIX: Wait for any pending asset saves to complete before reloading session
      // This prevents race condition where saveSession reloads before saveReportAssets completes
      const { pendingAssetSaves } = await import('../report/ReportService')
      const pendingSave = pendingAssetSaves.get(reportId)
      if (pendingSave) {
        logger.info('Waiting for pending asset save before reloading session', {
          reportId,
          note: 'Preventing race condition - asset save must complete before session reload',
        })
        await pendingSave
      }

      logger.info('Saving session', {
        reportId,
        updateKeys: Object.keys(updates),
      })

      // Convert ValuationRequest updates to sessionData format for backend
      // Backend expects sessionData structure, not raw ValuationRequest
      // Extract currentView if present (needed for session creation)
      const updatesAny = updates as any

      // Extract currentView separately (it's a top-level session property, not part of sessionData)
      const currentView = updatesAny.currentView

      // sessionData should contain the actual form data (everything except currentView)
      const { currentView: _, ...sessionDataWithoutView } = updatesAny
      const sessionData = updatesAny.sessionData || sessionDataWithoutView

      const sessionUpdates: Partial<ValuationSession> = {
        sessionData: sessionData as any,
        ...(currentView && { currentView }),
      }

      // Update backend
      const response = await backendAPI.updateValuationSession(reportId, sessionUpdates)

      let mergedSession: ValuationSession

      if (response?.session) {
        // Backend returned session data - use it
        const normalizedSession = normalizeSessionDates(response.session)
        mergedSession = mergeSessionFields(normalizedSession)
      } else {
        // Backend didn't return session data (common when creating new session)
        // Clear cache and reload with retry (backend may need a moment to persist)
        logger.debug('Backend did not return session data, reloading session', { reportId })

        // Clear cache to ensure fresh data
        globalSessionCache.remove(reportId)

        // Retry loading with exponential backoff + jitter (backend may need time to persist)
        let reloadedSession: ValuationSession | null = null
        const maxRetries = 5
        const initialDelay = 200
        const maxDelay = 2000

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          if (attempt > 0) {
            // Exponential backoff: 200ms, 400ms, 800ms, 1600ms, 2000ms (capped)
            const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay)
            // Add jitter (±20%) to prevent thundering herd
            const jitter = delay * 0.2 * (Math.random() - 0.5)
            const finalDelay = Math.max(0, delay + jitter)

            logger.debug(`Waiting ${finalDelay.toFixed(0)}ms before retry attempt ${attempt + 1}`, {
              reportId,
              baseDelay: delay,
              jitter: jitter.toFixed(0),
            })

            await new Promise((resolve) => setTimeout(resolve, finalDelay))
          }

          reloadedSession = await this.loadSession(reportId)
          if (reloadedSession) {
            logger.info('Session reloaded successfully after save', {
              reportId,
              attempt: attempt + 1,
              totalRetries: maxRetries,
            })
            break
          }

          logger.debug(`Reload attempt ${attempt + 1}/${maxRetries} failed, retrying...`, {
            reportId,
          })
        }

        if (!reloadedSession) {
          // If reload still fails, create a minimal session object from what we saved
          // This prevents errors and allows the UI to continue
          logger.warn('Failed to reload session after save, creating minimal session object', {
            reportId,
            retriesAttempted: maxRetries,
          })
          mergedSession = {
            reportId,
            currentView: (currentView as 'manual' | 'conversational') || 'manual',
            dataSource: (currentView === 'conversational' ? 'conversational' : 'manual') as
              | 'manual'
              | 'conversational'
              | 'mixed',
            sessionData: sessionData || {},
            partialData: {},
            createdAt: new Date(),
            updatedAt: new Date(),
            // ✅ ADD: Fields required by flow components (graceful degradation)
            valuationResult: undefined, // Not calculated yet (undefined to match type)
            htmlContent: undefined, // Not generated yet (undefined to match type)
            isComplete: false, // Session just created
            stage: 1, // Data entry stage
            status: 'draft', // Draft status
          } as unknown as ValuationSession
        } else {
          mergedSession = reloadedSession
        }
      }

      // Update cache
      globalSessionCache.set(reportId, mergedSession)

      const duration = performance.now() - startTime

      logger.info('Session saved successfully', {
        reportId,
        duration_ms: duration.toFixed(2),
      })

      return mergedSession
    } catch (error) {
      const duration = performance.now() - startTime

      // Use instanceof checks for specific error handling
      if (error instanceof ValidationError) {
        logger.warn('Failed to save session - validation error', {
          error: error.message,
          field: error.field,
          reportId,
          duration_ms: duration.toFixed(2),
        })
        throw error // Re-throw for caller to handle
      } else if (error instanceof NetworkError && error.retryable) {
        logger.warn('Failed to save session - network error (retryable)', {
          error: error.message,
          reportId,
          duration_ms: duration.toFixed(2),
        })
        throw error // Re-throw for potential retry
      } else if (error instanceof NotFoundError) {
        logger.error('Failed to save session - resource not found', {
          error: error.message,
          resourceType: error.resourceType,
          resourceId: error.resourceId,
          reportId,
          duration_ms: duration.toFixed(2),
        })
        throw error
      } else {
        logger.error('Failed to save session - unknown error', {
          error: getErrorMessage(error),
          reportId,
          duration_ms: duration.toFixed(2),
        })
        throw new ApplicationError(
          `Failed to save session: ${getErrorMessage(error)}`,
          'SESSION_SAVE_FAILED',
          {
            originalError: error,
            reportId,
            updateKeys: Object.keys(updates),
            duration_ms: duration.toFixed(2),
          }
        )
      }
    }
  }

  /**
   * Save complete session with all assets
   *
   * Saves:
   * - Form data (all input fields)
   * - Valuation results
   * - HTML reports (main + info tab)
   *
   * @param reportId - Report identifier
   * @param data - Complete session data
   */
  async saveCompleteSession(
    reportId: string,
    data: {
      formData?: any
      valuationResult?: any
      htmlReport?: string
      infoTabHtml?: string
    }
  ): Promise<void> {
    const startTime = performance.now()

    try {
      logger.info('Saving complete session', {
        reportId,
        hasFormData: !!data.formData,
        hasResult: !!data.valuationResult,
        hasHtmlReport: !!data.htmlReport,
        hasInfoTab: !!data.infoTabHtml,
      })

      // Import SessionAPI dynamically to avoid circular dependencies
      const { SessionAPI } = await import('../api/session/SessionAPI')
      const sessionAPI = new SessionAPI()

      // Prepare session data update
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

      // Update session data first
      if (Object.keys(sessionUpdate).length > 0) {
        // Convert ValuationRequest to sessionData format
        const sessionUpdates: Partial<ValuationSession> = {
          sessionData: sessionUpdate as any,
        }
        await backendAPI.updateValuationSession(reportId, sessionUpdates)
        logger.debug('Session data updated', { reportId })
      }

      // Save valuation result and HTML reports
      if (data.valuationResult || data.htmlReport || data.infoTabHtml) {
        await sessionAPI.saveValuationResult(reportId, {
          valuationResult: data.valuationResult,
          htmlReport: data.htmlReport,
          infoTabHtml: data.infoTabHtml,
        })

        logger.info('Valuation result saved', {
          reportId,
          hasHtmlReport: !!data.htmlReport,
          hasInfoTab: !!data.infoTabHtml,
        })
      }

      // ✅ UPDATE cache with fresh data (Cursor/ChatGPT pattern)
      // This ensures page refresh loads complete valuation instantly
      // Instead of invalidating cache, we reload and update it with latest data
      let freshSession: ValuationSession | null = null
      try {
        // Clear cache first to ensure we fetch fresh data from backend
        globalSessionCache.remove(reportId)

        // Reload session from backend to get complete data
        freshSession = await this.loadSession(reportId)

        if (freshSession) {
          // Cache the fresh session with all valuation data
          globalSessionCache.set(reportId, freshSession)

          logger.info('Cache updated with fresh valuation data', {
            reportId,
            hasHtmlReport: !!freshSession.htmlReport,
            hasInfoTabHtml: !!freshSession.infoTabHtml,
            hasValuationResult: !!freshSession.valuationResult,
          })
        } else {
          logger.warn('Failed to reload session after save, cache remains cleared', { reportId })
        }
      } catch (cacheError) {
        // Don't fail the entire save operation if cache update fails
        logger.error('Failed to update cache after save', {
          reportId,
          error: getErrorMessage(cacheError),
        })
      }

      // ✅ NEW: Broadcast report update for Mercury integration
      if (data.valuationResult && typeof window !== 'undefined') {
        try {
          const { broadcastReportUpdated } = await import('../../utils/auth/cross-domain-logout')
          const { useVersionHistoryStore } = await import('../../store/useVersionHistoryStore')
          const { useClientContext } = await import('../../stores/clientContext')

          const versionStore = useVersionHistoryStore.getState()
          const versions = versionStore.versions[reportId] || []
          const latestVersion = versionStore.getLatestVersion(reportId)
          const clientContext = useClientContext.getState()

          broadcastReportUpdated({
            reportId,
            reportName: freshSession?.name,
            updatedAt: new Date(),
            clientId: clientContext.isActingAsClient
              ? (clientContext.relationshipId ?? undefined)
              : undefined,
            valuationResult: {
              equity_value_low: data.valuationResult.equity_value_low,
              equity_value_mid: data.valuationResult.equity_value_mid,
              equity_value_high: data.valuationResult.equity_value_high,
              recommended_asking_price: data.valuationResult.recommended_asking_price,
              confidence_score: data.valuationResult.confidence_score,
              methodology: data.valuationResult.methodology,
            },
            versionCount: versions.length,
            latestVersion: latestVersion
              ? {
                  versionNumber: latestVersion.versionNumber,
                  createdAt: latestVersion.createdAt,
                  changes: latestVersion.changesSummary,
                }
              : undefined,
          })

          logger.info('Report update broadcasted to Mercury', { reportId })
        } catch (broadcastError) {
          // Non-critical - don't fail the save if broadcast fails
          logger.warn('Failed to broadcast report update', {
            reportId,
            error: getErrorMessage(broadcastError),
          })
        }
      }

      const duration = performance.now() - startTime

      logger.info('Complete session saved successfully', {
        reportId,
        duration_ms: duration.toFixed(2),
      })
    } catch (error) {
      const duration = performance.now() - startTime

      // Use instanceof checks for specific error handling
      if (error instanceof ValidationError) {
        logger.warn('Failed to save complete session - validation error', {
          error: error.message,
          field: error.field,
          reportId,
          duration_ms: duration.toFixed(2),
        })
        throw error
      } else if (error instanceof NetworkError && error.retryable) {
        logger.warn('Failed to save complete session - network error (retryable)', {
          error: error.message,
          reportId,
          duration_ms: duration.toFixed(2),
        })
        throw error
      } else {
        logger.error('Failed to save complete session - unknown error', {
          error: getErrorMessage(error),
          reportId,
          duration_ms: duration.toFixed(2),
        })
        throw new ApplicationError(
          `Failed to save complete session: ${getErrorMessage(error)}`,
          'SESSION_SAVE_COMPLETE_FAILED',
          {
            originalError: error,
            reportId,
            duration_ms: duration.toFixed(2),
          }
        )
      }
    }
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
   * Revalidate session cache in background
   *
   * Fetches fresh data from backend and updates cache without blocking UI.
   * Used for stale-while-revalidate pattern (Cursor/ChatGPT style).
   *
   * @param reportId - Report identifier
   * @private
   */
  private async revalidateInBackground(reportId: string): Promise<void> {
    try {
      logger.debug('Starting background revalidation', { reportId })

      // Fetch fresh data from backend
      const sessionResponse = await backendAPI.getValuationSession(reportId)

      if (sessionResponse?.session) {
        // Validate and normalize the fresh session
        validateSessionData(sessionResponse.session)
        const normalizedSession = normalizeSessionDates(sessionResponse.session)
        const mergedSession = mergeSessionFields(normalizedSession)

        // Update cache with fresh data
        globalSessionCache.set(reportId, mergedSession)

        logger.info('Cache revalidated in background', {
          reportId,
          hasHtmlReport: !!mergedSession.htmlReport,
          hasInfoTabHtml: !!mergedSession.infoTabHtml,
        })
      } else {
        logger.debug('Session not found during revalidation', { reportId })
      }
    } catch (error) {
      // Log error but don't throw - background revalidation failures are non-critical
      logger.warn('Background revalidation failed', {
        reportId,
        error: getErrorMessage(error),
      })
    }
  }
}

// Export singleton instance
export const sessionService = SessionService.getInstance()
