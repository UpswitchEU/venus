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
      // ✅ FIX: Add /v2 to the API path (endpoint is at /api/v2/billing/...)
      const url = `${baseURL}/api/v2/billing/plan-enforcement/check?usage_type=VALUATION`

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
      info_tab_html: string
      valuation_result: any
    }
    versions?: any[]
    pricingRange?: {
      min: number
      max: number
      suggested: number
    }
    previousPackages?: any[]
  } | null> {
    try {
      logger.info('Loading complete valuation data package', { reportId })
      
      // 1. Load session first (required)
      const session = await this.loadSession(reportId)
      if (!session) {
        logger.warn('Session not found, cannot load complete data', { reportId })
        return null
      }
      
      // 2. Parallel fetch of all related data (no race conditions)
      const [report, versions, pricing, packages] = await Promise.all([
        this.loadCurrentReport(reportId).catch(err => {
          logger.warn('Failed to load current report', { reportId, error: err.message })
          return undefined
        }),
        this.loadVersionHistory(reportId).catch(err => {
          logger.warn('Failed to load version history', { reportId, error: err.message })
          return undefined
        }),
        this.loadPricingRange(reportId).catch(err => {
          logger.warn('Failed to load pricing range', { reportId, error: err.message })
          return undefined
        }),
        this.loadPreviousPackages().catch(err => {
          logger.warn('Failed to load previous packages', { reportId, error: err.message })
          return undefined
        }),
      ])
      
      logger.info('Complete valuation data loaded', {
        reportId,
        hasReport: !!report,
        versionsCount: versions?.length || 0,
        hasPricing: !!pricing,
        packagesCount: packages?.length || 0,
      })
      
      return {
        session,
        currentReport: report,
        versions,
        pricingRange: pricing,
        previousPackages: packages,
      }
    } catch (error) {
      logger.error('Failed to load complete valuation data', {
        reportId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Load current report data
   */
  private async loadCurrentReport(reportId: string): Promise<{
    html_report: string
    info_tab_html: string
    valuation_result: any
  } | undefined> {
    try {
      const response = await backendAPI.getReport(reportId)
      if (response?.html_report) {
        return {
          html_report: response.html_report,
          info_tab_html: response.info_tab_html || '',
          valuation_result: response || null, // The response itself is the valuation result
        }
      }
      return undefined
    } catch (error) {
      logger.debug('No current report found', { reportId })
      return undefined
    }
  }

  /**
   * Load version history
   */
  private async loadVersionHistory(reportId: string): Promise<any[] | undefined> {
    try {
      // Use VersionService to get version history
      const { versionService } = await import('../version/VersionService')
      const response = await versionService.fetchVersions(reportId)
      return response?.versions || undefined
    } catch (error) {
      logger.debug('No version history found', { reportId })
      return undefined
    }
  }

  /**
   * Load pricing range
   * Derives pricing range from valuation result if available
   */
  private async loadPricingRange(reportId: string): Promise<{
    min: number
    max: number
    suggested: number
  } | undefined> {
    try {
      // Try to get pricing range from current report
      const report = await this.loadCurrentReport(reportId).catch(() => undefined)
      
      if (report?.valuation_result) {
        const result = report.valuation_result
        if (result.equity_value_low && result.equity_value_high) {
          return {
            min: result.equity_value_low,
            max: result.equity_value_high,
            suggested: result.equity_value_mid || result.recommended_asking_price || 
                       (result.equity_value_low + result.equity_value_high) / 2,
          }
        }
      }
      
      logger.debug('No pricing range available', { reportId })
      return undefined
    } catch (error) {
      logger.debug('Failed to load pricing range', { reportId, error: getErrorMessage(error) })
      return undefined
    }
  }

  /**
   * Load previous valuation packages for user
   * Returns previous valuations for the authenticated user
   * 
   * Note: This feature is not yet fully implemented on the backend.
   * For now, returns undefined to allow restoration to work without errors.
   */
  private async loadPreviousPackages(): Promise<any[] | undefined> {
    try {
      // Get userId from auth store
      const { useAuthStore } = await import('../../lib/auth')
      const authState = useAuthStore.getState()
      const userId = authState.user?.id
      
      if (!userId) {
        logger.debug('No user ID available for previous packages')
        return undefined
      }
      
      // TODO: Implement when backend API is available
      // For now, return undefined to allow restoration to work
      logger.debug('Previous packages feature not yet fully implemented')
      return undefined
    } catch (error) {
      logger.debug('Failed to load previous packages', { error: getErrorMessage(error) })
      return undefined
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
                // CRITICAL: Send the requested reportId as session_key so Titan uses it
                // This ensures the URL stays consistent and validation passes
                // ✅ FIX: Ensure guest_session_id is available if user is not authenticated
                // This prevents "Either userId or guestSessionId must be provided" error
                let guestSessionId: string | undefined = undefined
                try {
                  const { useAuthStore } = await import('../../lib/auth')
                  const user = useAuthStore.getState().user
                  
                  // Only get guest session if user is NOT authenticated
                  if (!user) {
                    const { useGuestSessionStore } = await import('../../store/useGuestSessionStore')
                    const sessionId = await useGuestSessionStore.getState().ensureSession()
                    guestSessionId = sessionId || undefined
                  }
                } catch (authError) {
                  // If auth check fails, try to get guest session anyway
                  try {
                    const { useGuestSessionStore } = await import('../../store/useGuestSessionStore')
                    const sessionId = await useGuestSessionStore.getState().ensureSession()
                    guestSessionId = sessionId || undefined
                  } catch (guestError) {
                    logger.warn('Failed to get guest session for session creation', { error: guestError })
                  }
                }

                const createResponse = await backendAPI.createValuationSession({
                  session_key: reportId, // ✅ FIX: Tell Titan to use this specific key
                  currentView: flow || 'manual', // Use provided flow or default to manual
                  sessionData: prefilledQuery ? ({ _prefilledQuery: prefilledQuery } as any) : {},
                  partialData: prefilledQuery ? ({ _prefilledQuery: prefilledQuery } as any) : {},
                  // ✅ FIX: Include guest_session_id if available (for anonymous users)
                  ...(guestSessionId && { guest_session_id: guestSessionId }),
                } as any)

                if (!createResponse?.session) {
                  logger.error('Failed to create new session', { requestedReportId: reportId })
                  return null
                }

                // ✅ FIX: Extract actual session_key from response FIRST
                // Titan should return the requested session_key, but check both locations
                // Note: session_key might be at top level or in session object
                const actualReportId = createResponse.reportId || 
                                      createResponse.session?.reportId || 
                                      (createResponse.session as any)?.session_key ||
                                      (createResponse as any).session_key

                if (!actualReportId) {
                  logger.error('Backend did not return session_key/reportId', {
                    response: createResponse,
                    responseKeys: Object.keys(createResponse),
                    sessionKeys: createResponse.session ? Object.keys(createResponse.session) : [],
                  })
                  return null
                }

                logger.info('New session created successfully', {
                  requestedReportId: reportId,
                  actualReportId: actualReportId,
                  currentView: createResponse.session.currentView,
                  hasPrefilledQuery: !!prefilledQuery,
                  sessionKeyMatches: actualReportId === reportId,
                })

                // Validate and normalize the new session
                validateSessionData(createResponse.session)
                const normalizedSession = normalizeSessionDates(createResponse.session)
                const mergedSession = mergeSessionFields(normalizedSession)

                // ✅ CRITICAL FIX: Always set reportId to actualReportId (even if they match)
                // This ensures the session always has the correct reportId from Titan
                mergedSession.reportId = actualReportId

                // ⚠️ IMPORTANT: If Titan generated a different ID than what's in the URL,
                // we need to redirect to the correct URL AND update the store
                if (actualReportId !== reportId) {
                  logger.warn('Titan generated different session_key than requested', {
                    requestedReportId: reportId,
                    actualReportId: actualReportId,
                    note: 'This should not happen if forcedSessionKey is working correctly',
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

                // ✅ DIAGNOSTIC: Verify business card data survived merging
                // ✅ FIX: Check if company_name is actually filled (not empty string)
                // Empty string means business card data is incomplete and should be fetched
                const companyName = (mergedSession.sessionData as any)?.company_name
                const hasCompanyName = companyName && companyName.trim() !== ''
                const hasBusinessCardData = !!(
                  hasCompanyName ||
                  (mergedSession.sessionData as any)?.business_type_id ||
                  (mergedSession.sessionData as any)?.founding_year ||
                  (mergedSession.sessionData as any)?.country_code
                )

                if (hasBusinessCardData && hasCompanyName) {
                  logger.info('Business card data preserved in session', {
                    reportId,
                    company_name: (mergedSession.sessionData as any)?.company_name,
                    business_type_id: (mergedSession.sessionData as any)?.business_type_id,
                    founding_year: (mergedSession.sessionData as any)?.founding_year,
                    country_code: (mergedSession.sessionData as any)?.country_code,
                  })
                } else {
                  logger.warn('No business card data in merged session (or company_name is empty)', {
                    reportId,
                    hasSessionData: !!mergedSession.sessionData,
                    hasCompanyName,
                    companyName,
                    sessionDataKeys: mergedSession.sessionData ? Object.keys(mergedSession.sessionData) : [],
                  })
                }

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

                // Database/Server errors (UUID type mismatches, SQL errors)
                if (
                  errorMessage.includes('uuid') ||
                  errorMessage.includes('database') ||
                  errorMessage.includes('42804') || // PostgreSQL type mismatch error code
                  errorMessage.includes('42883') || // PostgreSQL operator error code
                  errorMessage.includes('column') ||
                  errorMessage.includes('type uuid but expression is of type text')
                ) {
                  logger.error('Database error during session creation', {
                    reportId,
                    error: errorMessage,
                  })
                  throw new Error(
                    'Unable to create session due to a technical issue. Please try again or contact support if the problem persists.'
                  )
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

                // Backend validation errors (400 Bad Request) - DO NOT RETRY
                // These are permanent errors that won't be fixed by retrying
                if (
                  errorMessage.includes('validation') ||
                  errorMessage.includes('invalid') ||
                  errorMessage.includes('Either userId or guestSessionId must be provided') ||
                  errorMessage.includes('must be provided')
                ) {
                  logger.error('Session creation failed - validation error (non-retryable)', {
                    reportId,
                    error: errorMessage,
                  })
                  // Create a ValidationError to prevent retries
                  const validationError = new ValidationError(`Invalid session data: ${errorMessage}`)
                  throw validationError
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

            // ✅ DIAGNOSTIC: Verify business card data survived merging (existing session load)
            // ✅ FIX: Check if company_name is actually filled (not empty string)
            // Empty string means business card data is incomplete and should be fetched
            const companyName = (mergedSession.sessionData as any)?.company_name
            const hasCompanyName = companyName && companyName.trim() !== ''
            const hasBusinessCardData = !!(
              hasCompanyName ||
              (mergedSession.sessionData as any)?.business_type_id ||
              (mergedSession.sessionData as any)?.founding_year ||
              (mergedSession.sessionData as any)?.country_code
            )

            if (hasBusinessCardData && hasCompanyName) {
              logger.info('Business card data preserved in existing session', {
                reportId,
                company_name: (mergedSession.sessionData as any)?.company_name,
                business_type_id: (mergedSession.sessionData as any)?.business_type_id,
                founding_year: (mergedSession.sessionData as any)?.founding_year,
                country_code: (mergedSession.sessionData as any)?.country_code,
              })
            } else {
              logger.warn('No business card data in existing session (or company_name is empty)', {
                reportId,
                hasSessionData: !!mergedSession.sessionData,
                hasCompanyName,
                companyName,
                sessionDataKeys: mergedSession.sessionData ? Object.keys(mergedSession.sessionData) : [],
              })
              
              // ✅ FIX: Fetch business card data from database if missing (like Mercury does)
              // Extract client_user_id from _client_context
              const clientContext = (mergedSession.sessionData as any)?._client_context
              const clientUserId = clientContext?.client_user_id
              
              if (clientUserId) {
                try {
                  logger.info('Fetching business card data from database for client', {
                    reportId,
                    clientUserId: clientUserId.substring(0, 8) + '...',
                  })
                  
                  // Fetch business card from Titan API
                  const businessCardResponse = await fetch(
                    `${process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.upswitch.app'}/api/v2/business-cards/${clientUserId}`,
                    {
                      method: 'GET',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      credentials: 'include', // Include cookies for auth
                    }
                  )
                  
                  if (businessCardResponse.ok) {
                    const businessCard = await businessCardResponse.json()
                    
                    // Map business card data to session format (same mapping as Titan's getBusinessCardPrefillData)
                    const businessCardData: Record<string, any> = {}
                    
                    if (businessCard.company_name) {
                      businessCardData.company_name = businessCard.company_name
                    }
                    // Handle business_type - backend returns UUID string
                    if (businessCard.business_type) {
                      businessCardData.business_type_id = businessCard.business_type
                      businessCardData.business_type = businessCard.business_type
                    }
                    // Also check business_type_id directly (in case backend uses this field name)
                    if (businessCard.business_type_id && !businessCardData.business_type_id) {
                      businessCardData.business_type_id = businessCard.business_type_id
                    }
                    if (businessCard.industry) {
                      businessCardData.industry = businessCard.industry
                    }
                    if (businessCard.location || businessCard.city) {
                      businessCardData.location = businessCard.location || businessCard.city
                      businessCardData.city = businessCard.city || businessCard.location
                    }
                    if (businessCard.country) {
                      businessCardData.country = businessCard.country
                      businessCardData.country_code = businessCard.country
                    }
                    if (businessCard.founded_year) {
                      businessCardData.founding_year = businessCard.founded_year
                    }
                    if (businessCard.company_size) {
                      businessCardData.company_size = businessCard.company_size
                    }
                    if (businessCard.company_description) {
                      businessCardData.company_description = businessCard.company_description
                      businessCardData.business_description = businessCard.company_description
                    }
                    // KBO registry fields
                    if (businessCard.kbo_number) businessCardData.kbo_number = businessCard.kbo_number
                    if (businessCard.vat_number) businessCardData.vat_number = businessCard.vat_number
                    if (businessCard.postal_code) businessCardData.postal_code = businessCard.postal_code
                    if (businessCard.legal_form) businessCardData.legal_form = businessCard.legal_form
                    if (businessCard.nace_code) businessCardData.nace_code = businessCard.nace_code
                    if (businessCard.nace_description) businessCardData.nace_description = businessCard.nace_description
                    
                    // Merge business card data into session (preserve existing data)
                    if (Object.keys(businessCardData).length > 0) {
                      mergedSession.sessionData = {
                        ...mergedSession.sessionData,
                        ...businessCardData,
                        // Preserve _client_context
                        _client_context: clientContext,
                      } as any
                      
                      logger.info('Business card data fetched and merged into session', {
                        reportId,
                        fieldsAdded: Object.keys(businessCardData),
                        company_name: businessCardData.company_name,
                        business_type_id: businessCardData.business_type_id,
                        has_kbo_data: !!(businessCardData.kbo_number || businessCardData.vat_number),
                      })
                    }
                  } else {
                    logger.warn('Failed to fetch business card from database', {
                      reportId,
                      status: businessCardResponse.status,
                      statusText: businessCardResponse.statusText,
                    })
                  }
                } catch (error) {
                  logger.warn('Error fetching business card data (non-critical)', {
                    reportId,
                    error: error instanceof Error ? error.message : String(error),
                    note: 'Session will continue without business card prefill',
                  })
                }
              } else {
                logger.debug('No client_user_id in _client_context, skipping business card fetch', {
                  reportId,
                  hasClientContext: !!clientContext,
                })
              }
            }

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

            // ✅ FIX: Log _client_context presence for debugging
            // Backend access check should work without headers if session has _client_context
            const clientContext = (mergedSession.sessionData as any)?._client_context
            if (clientContext?.client_user_id && clientContext?.accountant_user_id && clientContext?.relationship_id) {
              logger.info('Session contains client context - backend should allow access via _client_context', {
                reportId,
                clientUserId: clientContext.client_user_id.substring(0, 8) + '...',
                accountantUserId: clientContext.accountant_user_id.substring(0, 8) + '...',
                relationshipId: clientContext.relationship_id.substring(0, 8) + '...',
                note: 'Backend access check should work even if headers are not sent',
              })
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

        // ✅ DIAGNOSTIC: Verify business card data survived merging (save session)
        // ✅ FIX: Check if company_name is actually filled (not empty string)
        const companyName = (mergedSession.sessionData as any)?.company_name
        const hasCompanyName = companyName && companyName.trim() !== ''
        const hasBusinessCardData = !!(
          hasCompanyName ||
          (mergedSession.sessionData as any)?.business_type_id ||
          (mergedSession.sessionData as any)?.founding_year ||
          (mergedSession.sessionData as any)?.country_code
        )

        if (hasBusinessCardData && hasCompanyName) {
          logger.info('Business card data preserved after save', {
            reportId,
            company_name: (mergedSession.sessionData as any)?.company_name,
            business_type_id: (mergedSession.sessionData as any)?.business_type_id,
            founding_year: (mergedSession.sessionData as any)?.founding_year,
            country_code: (mergedSession.sessionData as any)?.country_code,
          })
        } else {
          logger.warn('No business card data after save', {
            reportId,
            hasSessionData: !!mergedSession.sessionData,
            sessionDataKeys: mergedSession.sessionData ? Object.keys(mergedSession.sessionData) : [],
          })
        }
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

        // ✅ DIAGNOSTIC: Verify business card data survived merging (background revalidation)
        // ✅ FIX: Check if company_name is actually filled (not empty string)
        const companyName = (mergedSession.sessionData as any)?.company_name
        const hasCompanyName = companyName && companyName.trim() !== ''
        const hasBusinessCardData = !!(
          hasCompanyName ||
          (mergedSession.sessionData as any)?.business_type_id ||
          (mergedSession.sessionData as any)?.founding_year ||
          (mergedSession.sessionData as any)?.country_code
        )

        if (hasBusinessCardData && hasCompanyName) {
          logger.info('Business card data preserved during background revalidation', {
            reportId,
            company_name: (mergedSession.sessionData as any)?.company_name,
            business_type_id: (mergedSession.sessionData as any)?.business_type_id,
            founding_year: (mergedSession.sessionData as any)?.founding_year,
            country_code: (mergedSession.sessionData as any)?.country_code,
          })
        } else {
          logger.warn('No business card data during background revalidation', {
            reportId,
            hasSessionData: !!mergedSession.sessionData,
            sessionDataKeys: mergedSession.sessionData ? Object.keys(mergedSession.sessionData) : [],
          })
        }

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
