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

import type { ValuationSessionResponse } from '../../types/api-responses'
import { ApplicationError, NetworkError, NotFoundError, ValidationError } from '../../types/errors'
import type { ValuationRequest, ValuationSession } from '../../types/valuation'
import { sessionCircuitBreaker } from '../../utils/circuitBreaker'
import { dateLikeToUnixMs } from '../../utils/date-like'
import { getErrorMessage } from '../../utils/errors/errorConverter'
import { getApiUrl } from '../../utils/getMercuryUrl'
import { isSessionKey, isUuid } from '../../utils/identifiers'
import { createContextLogger } from '../../utils/logger'
import {
  mergeSessionSurfaceForOptionalPrefill,
  OPTIONAL_SESSION_PREFILL_SCALAR_KEYS,
  OPTIONAL_SESSION_STRUCT_SYNC_KEYS,
  sessionEnvelopeHasIdentitySignals,
} from '../../utils/mergeOptionalSessionPrefillFields'
import { retrySessionOperation } from '../../utils/retryWithBackoff'
import { getFirstRenderableReportHtml } from '../../utils/safetyNetReportHtml'
import { globalSessionCache } from '../../utils/sessionCacheManager'
import {
  mergePrefilledQuery,
  mergeSessionFields,
  normalizeSessionDates,
  orderedValuationSessionLookupIds,
  resolveEnsureHtmlAlternateReportId,
  resolveEnsureHtmlSessionKey,
} from '../../utils/sessionHelpers'
import {
  extractStableSessionKeyFromMergedSession,
  mergeSessionDataEnvelopesFromRoot,
} from '../../utils/sessionReportIdentity'
import { validateSessionData } from '../../utils/sessionValidation'
import { stripReportBlobsFromSessionPatch } from '../../utils/stripReportBlobsFromSessionPatch'
import { backendAPI } from '../backendApi'
import { isLegalFormBusinessTypeValue } from '../naceBusinessTypeService'

const logger = createContextLogger('SessionService')

/** Diagnostics / cache hints — use merged surface so `_businessInfo`-only sessions register as form-bearing */
function sessionDataIndicatesUsableFormInputs(sessionData: unknown): boolean {
  if (!sessionData || typeof sessionData !== 'object') return false
  if (sessionEnvelopeHasIdentitySignals(sessionData)) return true
  const m = mergeSessionSurfaceForOptionalPrefill(sessionData) as Record<string, unknown>
  if (m.revenue != null || m.ebitda != null) return true
  const cyd = m.current_year_data
  if (cyd && typeof cyd === 'object' && !Array.isArray(cyd)) {
    const o = cyd as Record<string, unknown>
    if (o.revenue != null || o.ebitda != null) return true
  }
  if (Array.isArray(m.historical_years_data) && m.historical_years_data.length > 0) return true
  const yd = m.year_data ?? m.yearData
  return !!(
    yd &&
    typeof yd === 'object' &&
    !Array.isArray(yd) &&
    Object.keys(yd as object).length > 0
  )
}

/** Deduplicate concurrent self-heal calls per Titan report identifier */
const ensureHtmlInFlight = new Set<string>()

/**
 * Keys merged from the in-memory session seed when Titan returns a sparse `session_data`
 * payload. Must cover Hermes/integration metadata that lives outside
 * {@link OPTIONAL_SESSION_PREFILL_SCALAR_KEYS} / {@link OPTIONAL_SESSION_STRUCT_SYNC_KEYS}
 * so `backfillSparseSessionFromStoreSeed` does not drop import quality or ledger analysis
 * after integration + NBB/CBSO enrichment.
 *
 * Note: Titan `BootstrapService.persistCbsoEnrichedFinancialsAttempt` persists only
 * filing-year mirrors and historical rows (`current_year_data`, `historical_years_data`,
 * `revenue`, `ebitda`); integration blobs are written by other bootstrap/accounting paths
 * and must remain listed here.
 */
const BASE_SPARSE_BACKFILL_KEYS = [
  'company_name',
  'country_code',
  'founding_year',
  'number_of_employees',
  'employee_count',
  'kbo_number',
  'vat_number',
  'city',
  'postal_code',
  'legal_form',
  'business_description',
  'nace_code',
  'canonical_nace_code',
  'nace_description',
  'taxonomy',
  'activity_code',
  'activity_label',
  'business_type_id',
  'subIndustry',
  'industry',
  'revenue',
  'ebitda',
  'year_data',
  'current_year_data',
  'historical_years_data',
  'yearlyFinancials',
  'tax_latencies',
  '_taxLatencies',
  '_normalizations',
  'business_context',
  /** Fiscal panel + Hermes bookkeeping — mirrored in bootstrap prefill, not optional scalars list. */
  'filing_year_confirmed',
  /** Accounting-integration payloads (aliases handled in SessionNormalizer). */
  '_import_quality',
  'import_quality',
  '_financial_data_source',
  '_imported_ledger_analysis',
  '_imported_saas_metrics',
  '_imported_saas_provenance',
] as const

const SPARSE_BACKFILL_KEYS = Array.from(
  new Set<string>([
    ...BASE_SPARSE_BACKFILL_KEYS,
    ...OPTIONAL_SESSION_PREFILL_SCALAR_KEYS,
    ...OPTIONAL_SESSION_STRUCT_SYNC_KEYS,
    'forecast_years_data',
    'balance_sheet_adjustments',
    'comparables',
    'official_financials',
    'official_variance_analysis',
    'official_verification_badge',
  ])
)

const ZERO_PLACEHOLDER_NUMERIC_KEYS = new Set([
  'revenue',
  'ebitda',
  'recurring_revenue_percentage',
  'government_bond_yield',
  'long_term_gdp_growth',
  'owner_salary_addback',
  'preparer_ev_ebitda_median',
])

function isZeroPlaceholderNumericKey(key: string): boolean {
  if (ZERO_PLACEHOLDER_NUMERIC_KEYS.has(key)) return true
  return (
    key.startsWith('dcf_') ||
    key.startsWith('nav_') ||
    key.startsWith('saas_') ||
    key.startsWith('rev_')
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function isFiniteNonZero(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value !== 0
}

function isPlaceholderCurrentYearRow(value: unknown): boolean {
  const row = asRecord(value)
  if (!row) return true
  const revenue = row.revenue
  const ebitda = row.ebitda
  const hasMeaningfulRevenue = isFiniteNonZero(revenue)
  const hasMeaningfulEbitda = isFiniteNonZero(ebitda)
  return !hasMeaningfulRevenue && !hasMeaningfulEbitda
}

function isPlaceholderYearArray(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return true
  return value.every((entry) => {
    const row = asRecord(entry)
    if (!row) return true
    return !isFiniteNonZero(row.revenue) && !isFiniteNonZero(row.ebitda)
  })
}

function shouldBackfillSparseValue(
  key: string,
  currentValue: unknown,
  seedValue: unknown
): boolean {
  if (seedValue == null || seedValue === '') return false

  if (currentValue == null || currentValue === '') return true

  if (
    typeof currentValue === 'number' &&
    isZeroPlaceholderNumericKey(key) &&
    typeof seedValue === 'number'
  ) {
    return currentValue === 0 && seedValue !== 0
  }

  if (key === 'current_year_data') {
    return isPlaceholderCurrentYearRow(currentValue) && !isPlaceholderCurrentYearRow(seedValue)
  }

  if (key === 'historical_years_data' || key === 'yearlyFinancials') {
    return isPlaceholderYearArray(currentValue) && !isPlaceholderYearArray(seedValue)
  }

  if (Array.isArray(currentValue)) {
    return currentValue.length === 0
  }

  const currentRecord = asRecord(currentValue)
  const seedRecord = asRecord(seedValue)
  if (currentRecord && seedRecord) {
    if (Object.keys(currentRecord).length === 0 && Object.keys(seedRecord).length > 0) return true

    if (key === 'business_context') {
      const currentLegalForm = currentRecord.legal_form
      const seedLegalForm = seedRecord.legal_form
      const currentKbo = currentRecord.kbo_registration
      const seedKbo = seedRecord.kbo_registration
      return (
        ((!currentLegalForm || currentLegalForm === '') && !!seedLegalForm) ||
        ((!currentKbo || currentKbo === '') && !!seedKbo)
      )
    }
  }

  return false
}

async function backfillSparseSessionFromStoreSeed(
  reportId: string,
  session: ValuationSession
): Promise<void> {
  const sessionData = (session.sessionData || {}) as Record<string, unknown>
  try {
    const { useSessionStore } = await import('../../store/useSessionStore')
    const seedSession = useSessionStore.getState().session
    if (!seedSession || seedSession.reportId !== reportId || !seedSession.sessionData) return

    const seedData = seedSession.sessionData as Record<string, unknown>
    const merged: Record<string, unknown> = { ...sessionData }
    const mergedKeys: string[] = []

    for (const key of SPARSE_BACKFILL_KEYS) {
      const seedValue = seedData[key]
      if (seedValue === undefined) continue
      if (shouldBackfillSparseValue(key, merged[key], seedValue)) {
        merged[key] = seedValue
        mergedKeys.push(key)
      }
    }

    if (mergedKeys.length > 0) {
      session.sessionData = merged as any
      session.partialData = {
        ...(session.partialData || {}),
        ...Object.fromEntries(mergedKeys.map((k) => [k, merged[k]])),
      }
      logger.info('Backfilled sparse session payload from bootstrap seed', {
        reportId: reportId.substring(0, 30),
        mergedKeysCount: mergedKeys.length,
        mergedKeys: mergedKeys.slice(0, 12),
      })
    }
  } catch (error) {
    logger.warn('Sparse session backfill skipped (non-critical)', {
      reportId: reportId.substring(0, 30),
      error: getErrorMessage(error),
    })
  }
}

/**
 * Fetch business card data from Titan API
 *
 * Centralized helper to avoid redundant code across loadSession/saveSession.
 * Only fetches if company_name is missing and clientUserId is available.
 *
 * Business card data should come from bootstrap. This is only called
 * when bootstrap explicitly indicates missing data.
 *
 * @param clientUserId - The client's user ID to fetch business card for
 * @returns Business card data object or null if fetch fails
 */
async function fetchBusinessCardData(clientUserId: string): Promise<Record<string, any> | null> {
  try {
    const apiBaseUrl = getApiUrl()
    const response = await fetch(`${apiBaseUrl}/api/v2/business-cards/${clientUserId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    })

    if (!response.ok) {
      logger.debug('Business card fetch failed', {
        clientUserId: clientUserId.substring(0, 8) + '...',
        status: response.status,
      })
      return null
    }

    const businessCard = await response.json()
    const data: Record<string, any> = {}

    // Map business card fields to session format
    if (businessCard.company_name) data.company_name = businessCard.company_name
    if (businessCard.business_type_id && !data.business_type_id) {
      data.business_type_id = businessCard.business_type_id
    }
    if (businessCard.business_type) {
      data.business_type = businessCard.business_type
      if (!data.business_type_id && !isLegalFormBusinessTypeValue(businessCard.business_type)) {
        data.business_type_id = businessCard.business_type
      }
    }
    if (businessCard.industry) data.industry = businessCard.industry
    if (businessCard.location || businessCard.city) {
      data.location = businessCard.location || businessCard.city
      data.city = businessCard.city || businessCard.location
    }
    if (businessCard.country) {
      data.country = businessCard.country
      data.country_code = businessCard.country
    }
    if (businessCard.founded_year) data.founding_year = businessCard.founded_year
    if (businessCard.company_size) data.company_size = businessCard.company_size
    if (businessCard.company_description) {
      data.company_description = businessCard.company_description
      data.business_description = businessCard.company_description
    }
    // KBO registry fields
    if (businessCard.kbo_number) data.kbo_number = businessCard.kbo_number
    if (businessCard.vat_number) data.vat_number = businessCard.vat_number
    if (businessCard.postal_code) data.postal_code = businessCard.postal_code
    if (businessCard.legal_form) data.legal_form = businessCard.legal_form
    if (businessCard.nace_code) data.nace_code = businessCard.nace_code
    if (businessCard.nace_description) data.nace_description = businessCard.nace_description

    return Object.keys(data).length > 0 ? data : null
  } catch (error) {
    logger.debug('Business card fetch error (non-critical)', {
      clientUserId: clientUserId.substring(0, 8) + '...',
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Merge business card data into session
 *
 * @param session - The session to merge into
 * @param businessCardData - Business card data to merge
 * @param clientContext - Client context to preserve
 */
function mergeBusinessCardIntoSession(
  session: ValuationSession,
  businessCardData: Record<string, any>,
  clientContext?: any
): void {
  const existingSessionData = session.sessionData || {}
  session.sessionData = {
    ...existingSessionData,
    ...businessCardData,
    _client_context: clientContext || (existingSessionData as any)?._client_context,
  } as any

  // Also update partialData for form compatibility
  session.partialData = {
    ...(session.partialData || {}),
    ...businessCardData,
  }
}

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
      const baseURL = getApiUrl()
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
          logger.warn('Valuation creation blocked by plan enforcement', {
            current: result.current,
            limit: result.limit,
            reason: result.reason,
            message: result.message,
          })

          // Create specific PaywallError (not generic ApplicationError)
          const error = new ApplicationError(
            result.message ||
              'Valuation limit reached. Upgrade to Starter or higher for unlimited valuations.',
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

        logger.debug('Valuation limit check passed', {
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
      logger.debug('Loading complete valuation data package', { reportId })

      // 1. Load session first (required)
      const session = await this.loadSession(reportId)
      if (!session) {
        logger.warn('Session not found, cannot load complete data', { reportId })
        return null
      }

      // 2. Parallel fetch of all related data (no race conditions)
      const [report, versions, pricing, packages] = await Promise.all([
        this.loadCurrentReport(reportId).catch((err) => {
          logger.warn('Failed to load current report', { reportId, error: err.message })
          return undefined
        }),
        this.loadVersionHistory(reportId).catch((err) => {
          logger.warn('Failed to load version history', { reportId, error: err.message })
          return undefined
        }),
        this.loadPricingRange(reportId).catch((err) => {
          logger.warn('Failed to load pricing range', { reportId, error: err.message })
          return undefined
        }),
        this.loadPreviousPackages().catch((err) => {
          logger.warn('Failed to load previous packages', { reportId, error: err.message })
          return undefined
        }),
      ])

      logger.debug('Complete valuation data loaded', {
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
  private async loadCurrentReport(reportId: string): Promise<
    | {
        html_report: string
        valuation_result: any
      }
    | undefined
  > {
    try {
      const response = await backendAPI.getReport(reportId)
      if (response?.html_report) {
        return {
          html_report: response.html_report,
          valuation_result: response || null, // The response itself is the valuation result
        }
      }
      return undefined
    } catch (_error) {
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
    } catch (_error) {
      logger.debug('No version history found', { reportId })
      return undefined
    }
  }

  /**
   * Load pricing range
   * Derives pricing range from valuation result if available
   */
  private async loadPricingRange(reportId: string): Promise<
    | {
        min: number
        max: number
        suggested: number
      }
    | undefined
  > {
    try {
      // Try to get pricing range from current report
      const report = await this.loadCurrentReport(reportId).catch(() => undefined)

      if (report?.valuation_result) {
        const result = report.valuation_result
        if (result.equity_value_low && result.equity_value_high) {
          return {
            min: result.equity_value_low,
            max: result.equity_value_high,
            suggested:
              result.equity_value_mid ||
              result.recommended_asking_price ||
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
      logger.debug('Loading session', { reportId, flow, prefilledQuery })

      // CACHE-FIRST: Check localStorage cache BEFORE backend API call
      const cachedSession = globalSessionCache.get(reportId)
      if (cachedSession) {
        const loadTime = performance.now() - startTime

        // Calculate cache age for stale-while-revalidate
        const updatedMs = dateLikeToUnixMs(cachedSession.updatedAt)
        const cacheAge_minutes =
          updatedMs !== null ? Math.floor((Date.now() - updatedMs) / (60 * 1000)) : 0

        // ✅ VERIFY: Log form data presence in cache for restoration
        const hasSessionData = !!cachedSession.sessionData
        const sessionDataKeys = cachedSession.sessionData
          ? Object.keys(cachedSession.sessionData)
          : []
        const sessionData = cachedSession.sessionData || ({} as any)
        const hasFormFields = hasSessionData && sessionDataIndicatesUsableFormInputs(sessionData)

        logger.debug('Session loaded from cache (instant)', {
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

        // Extract prefilledQuery from session data (single source)
        const effectivePrefilledQuery =
          (cachedSession.sessionData as any)?._prefilledQuery || prefilledQuery

        // Merge prefilledQuery if provided (from session data or URL fallback)
        if (effectivePrefilledQuery) {
          const updatedPartialData = mergePrefilledQuery(
            cachedSession.partialData,
            effectivePrefilledQuery
          )
          if (updatedPartialData !== cachedSession.partialData) {
            const updatedSession = {
              ...cachedSession,
              partialData: updatedPartialData,
            }
            // Ensure it's also in sessionData for consistency
            if (!(updatedSession.sessionData as any)?._prefilledQuery) {
              updatedSession.sessionData = {
                ...updatedSession.sessionData,
                _prefilledQuery: effectivePrefilledQuery,
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

        // ✅ CRITICAL FIX: If cache is missing HTML reports but has a completed valuation,
        // trigger immediate background fetch. This handles the case where HTML reports are
        // excluded from localStorage cache (to save space) but exist in the backend.
        // Without this, users would see a blank report panel until the 5-minute stale threshold.
        if (!cachedSession.htmlReport) {
          const sessionData = cachedSession.sessionData as any
          const hasValuationResult = sessionData?.valuation_result || cachedSession.valuationResult

          if (hasValuationResult) {
            // Session has a completed valuation but no HTML reports in cache
            // This likely means HTML reports exist in backend but were excluded from cache
            logger.debug(
              'Cache missing HTML reports for completed valuation, fetching immediately',
              {
                reportId,
                hasValuationResult: true,
                cacheAge_minutes,
              }
            )
            this.revalidateInBackground(reportId).catch((err) => {
              logger.warn('Background HTML fetch failed', {
                reportId,
                error: err instanceof Error ? err.message : String(err),
              })
            })
          }
        }

        return cachedSession
      }

      logger.debug('Cache miss - loading from backend', { reportId })

      // Helper: fetch session with optional retry when completed report has no valuation result
      const fetchSessionWithRetry = async (attempt = 0): Promise<typeof sessionResponse> => {
        const sessionResponse = await backendAPI.getValuationSession(reportId)
        if (!sessionResponse?.session) return sessionResponse

        const session = sessionResponse.session as any
        const sessionData = mergeSessionDataEnvelopesFromRoot(session as Record<string, any>)
        const htmlFromEnvelope = (v: unknown) => (typeof v === 'string' ? v : undefined)
        const hasRenderableHtmlReport = !!getFirstRenderableReportHtml(
          htmlFromEnvelope(sessionData?._htmlReport),
          htmlFromEnvelope(sessionData?.html_report),
          session?.htmlReport
        )
        const hasValuationResult = !!(
          session?.valuationResult ||
          sessionData?.valuation_result ||
          sessionData?.valuationResult ||
          hasRenderableHtmlReport
        )
        const hasReportId = !!(session?.report_id || session?.reportId)
        const looksCompleted = hasReportId || session?.status === 'completed'

        if (looksCompleted && !hasValuationResult && attempt === 0) {
          logger.info('Completed report missing valuation result - retrying once', {
            reportId: reportId.substring(0, 30),
            hasReportId,
            status: session?.status,
          })
          await new Promise((r) => setTimeout(r, 300))
          return fetchSessionWithRetry(1)
        }
        return sessionResponse
      }

      // Wrap the entire load operation with an absolute timeout
      const loadPromise = retrySessionOperation(
        async () => {
          return await sessionCircuitBreaker.execute(async () => {
            const sessionResponse = await fetchSessionWithRetry()

            if (!sessionResponse?.session) {
              // ✅ CRITICAL: Only create session if bootstrap indicates it's a new report
              // Don't create session for deleted reports (404 on existing reportId)
              // This prevents "restoration" of deleted reports
              let isNewReport = false
              try {
                const { useBootstrapSafe } = await import('../../lib/bootstrap')
                const bootstrap = useBootstrapSafe()
                isNewReport =
                  bootstrap?.report?.mode === 'new' && bootstrap?.report?.reportId === reportId
              } catch (bootstrapError) {
                // If bootstrap check fails, assume it's a new report (defensive)
                logger.warn('Failed to check bootstrap state, assuming new report', {
                  reportId,
                  error:
                    bootstrapError instanceof Error
                      ? bootstrapError.message
                      : String(bootstrapError),
                })
                isNewReport = true
              }

              if (!isNewReport) {
                // 404 on existing reportId means report was deleted, don't create new session
                logger.warn('Session not found and not a new report - may have been deleted', {
                  reportId,
                  note: 'Not creating new session to avoid restoring deleted reports',
                })
                return null
              }

              // Session doesn't exist and it's a new report - create it automatically
              logger.debug('Session not found, creating new session', {
                requestedReportId: reportId,
                flow,
                isNewReport: true,
              })

              try {
                // ⭐ PLAN ENFORCEMENT: Check if user can create valuation BEFORE creating session
                // This prevents wasted API calls and provides immediate feedback
                await this.checkValuationCreationAllowed()

                // Create minimal session on backend
                // CRITICAL: Send the requested reportId as session_key so Titan uses it
                // This ensures the URL stays consistent and validation passes
                // ✅ TWIN ENGINE ARCHITECTURE: SessionService is ONLY used by AuthenticatedSessionEngine
                // All callers are authenticated users - no guest session logic needed

                const createResponse = await backendAPI.createValuationSession({
                  session_key: reportId, // ✅ FIX: Tell Titan to use this specific key
                  currentView: flow || 'manual', // Use provided flow or default to manual
                  sessionData: prefilledQuery ? ({ _prefilledQuery: prefilledQuery } as any) : {},
                  partialData: prefilledQuery ? ({ _prefilledQuery: prefilledQuery } as any) : {},
                } as any)

                if (!createResponse?.session) {
                  logger.error('Failed to create new session', { requestedReportId: reportId })
                  return null
                }

                // ✅ FIX: Extract actual session_key from response FIRST
                // Titan should return the requested session_key, but check both locations
                // Note: session_key might be at top level or in session object
                const actualReportId =
                  createResponse.reportId ||
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

                logger.debug('New session created successfully', {
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
                    logger.debug('Redirecting to correct session URL', {
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
                  logger.debug('Business card data preserved in session', {
                    reportId,
                    company_name: (mergedSession.sessionData as any)?.company_name,
                    business_type_id: (mergedSession.sessionData as any)?.business_type_id,
                    founding_year: (mergedSession.sessionData as any)?.founding_year,
                    country_code: (mergedSession.sessionData as any)?.country_code,
                  })
                } else {
                  logger.debug(
                    'No business card data in merged session (or company_name is empty)',
                    {
                      reportId,
                      hasSessionData: !!mergedSession.sessionData,
                      hasCompanyName,
                      companyName,
                      sessionDataKeys: mergedSession.sessionData
                        ? Object.keys(mergedSession.sessionData)
                        : [],
                    }
                  )
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

                // ✅ CONSOLIDATED: Fetch business card data if missing (fallback for bootstrap)
                // Bootstrap SHOULD provide this data, but we fetch as fallback for edge cases
                const clientContext = (mergedSession.sessionData as any)?._client_context
                const clientUserId = clientContext?.client_user_id

                if (!hasCompanyName && clientUserId) {
                  logger.debug('Fetching business card (fallback) after session creation', {
                    reportId: actualReportId,
                    clientUserId: clientUserId.substring(0, 8) + '...',
                  })
                  const businessCardData = await fetchBusinessCardData(clientUserId)
                  if (businessCardData) {
                    mergeBusinessCardIntoSession(mergedSession, businessCardData, clientContext)
                    logger.debug('Business card merged after session creation', {
                      reportId: actualReportId,
                      fieldsAdded: Object.keys(businessCardData).length,
                    })
                  }
                }

                // ✅ FIX: Ensure partialData is initialized from sessionData if missing
                if (
                  !mergedSession.partialData ||
                  Object.keys(mergedSession.partialData).length === 0
                ) {
                  mergedSession.partialData = mergedSession.sessionData
                    ? { ...mergedSession.sessionData }
                    : {}
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
                  logger.warn('Session creation blocked by plan enforcement', {
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
                // AUTH-FIRST: userId is always required (guest sessions removed)
                if (
                  errorMessage.includes('validation') ||
                  errorMessage.includes('invalid') ||
                  errorMessage.includes('userId must be provided') ||
                  errorMessage.includes('Authentication required') ||
                  errorMessage.includes('must be provided')
                ) {
                  logger.error('Session creation failed - validation error (non-retryable)', {
                    reportId,
                    error: errorMessage,
                  })
                  // Create a ValidationError to prevent retries
                  const validationError = new ValidationError(
                    `Invalid session data: ${errorMessage}`
                  )
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
            await backfillSparseSessionFromStoreSeed(reportId, mergedSession)

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
              logger.debug('Business card data preserved in existing session', {
                reportId,
                company_name: (mergedSession.sessionData as any)?.company_name,
                business_type_id: (mergedSession.sessionData as any)?.business_type_id,
              })
            } else {
              // ✅ CONSOLIDATED: Fetch business card data if missing (fallback for bootstrap)
              // Bootstrap SHOULD provide this data, but we fetch as fallback for edge cases
              const clientContext = (mergedSession.sessionData as any)?._client_context
              const clientUserId = clientContext?.client_user_id

              if (clientUserId) {
                logger.debug('Fetching business card (fallback) for existing session', {
                  reportId,
                  clientUserId: clientUserId.substring(0, 8) + '...',
                })
                const businessCardData = await fetchBusinessCardData(clientUserId)
                if (businessCardData) {
                  mergeBusinessCardIntoSession(mergedSession, businessCardData, clientContext)
                  logger.debug('Business card merged into existing session', {
                    reportId,
                    fieldsAdded: Object.keys(businessCardData).length,
                  })
                }
              }
            }

            // SECURITY: Extract prefilledQuery from session data first (preferred)
            // Fallback to URL parameter for backward compatibility
            const sessionPrefilledQuery =
              (mergedSession.sessionData as any)?._prefilledQuery ||
              (mergedSession.partialData as any)?._prefilledQuery ||
              null
            const effectivePrefilledQuery = sessionPrefilledQuery || prefilledQuery

            // Log deprecation warning if reading from URL (backward compatibility)
            if (!sessionPrefilledQuery && prefilledQuery) {
              logger.warn(
                '[DEPRECATED] Reading prefilledQuery from URL parameter. This should be stored in session_data._prefilledQuery',
                {
                  reportId,
                  note: 'Migrating URL-based prefilledQuery to session data on first load',
                }
              )
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
                  _prefilledQuery: effectivePrefilledQuery,
                } as any
              }
            }

            // ✅ FIX: Log _client_context presence for debugging
            // Backend access check should work without headers if session has _client_context
            const clientContext = (mergedSession.sessionData as any)?._client_context
            const hasFullDelegatedContext =
              clientContext?.client_user_id &&
              clientContext?.accountant_user_id &&
              clientContext?.relationship_id
            const hasPendingInviteContext =
              clientContext?.client_user_id == null &&
              clientContext?.accountant_user_id &&
              clientContext?.relationship_id
            if (hasFullDelegatedContext || hasPendingInviteContext) {
              logger.debug(
                'Session contains client context - backend should allow access via _client_context',
                {
                  reportId,
                  clientUserId: clientContext.client_user_id
                    ? clientContext.client_user_id.substring(0, 8) + '...'
                    : 'null (pending)',
                  accountantUserId: clientContext.accountant_user_id.substring(0, 8) + '...',
                  relationshipId: clientContext.relationship_id.substring(0, 8) + '...',
                  note: 'Backend access check should work even if headers are not sent',
                }
              )
            }

            // Cache for next time (includes sessionData/form fields, excludes HTML reports)
            // ✅ CRITICAL: Form data (sessionData) is included in cache for instant restoration
            const hasSessionData = !!mergedSession.sessionData
            const sessionDataKeys = mergedSession.sessionData
              ? Object.keys(mergedSession.sessionData)
              : []
            const sessionData = mergedSession.sessionData || ({} as any)
            const hasFormFields =
              hasSessionData && sessionDataIndicatesUsableFormInputs(sessionData)

            globalSessionCache.set(reportId, mergedSession)

            logger.debug('Session loaded from backend and cached', {
              reportId,
              currentView: mergedSession.currentView,
              hasPrefilledQuery: !!effectivePrefilledQuery,
              prefilledQuerySource: sessionPrefilledQuery
                ? 'session_data'
                : prefilledQuery
                  ? 'url'
                  : 'none',
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
    updates: Partial<ValuationRequest> & Partial<Pick<ValuationSession, 'currentView' | 'name'>>
  ): Promise<ValuationSession> {
    const startTime = performance.now()

    try {
      // ✅ FIX: Wait for any pending asset saves to complete before reloading session
      // This prevents race condition where saveSession reloads before saveReportAssets completes
      const { pendingAssetSaves } = await import('../report/ReportService')
      const pendingSave = pendingAssetSaves.get(reportId)
      if (pendingSave) {
        logger.debug('Waiting for pending asset save before reloading session', {
          reportId,
          note: 'Preventing race condition - asset save must complete before session reload',
        })
        await pendingSave
      }

      logger.debug('Saving session', {
        reportId,
        updateKeys: Object.keys(updates),
      })

      // ✅ CLEAN ARCHITECTURE: Check if session needs creation vs update
      // BootstrapSync creates minimal sessions with _bootstrapCreated flag
      // If flag exists, use CREATE (idempotent via session_key)
      // If flag doesn't exist, use UPDATE (session already exists)
      const { useSessionStore } = await import('../../store/useSessionStore')
      const storeState = useSessionStore.getState()
      const currentSession = storeState.session
      const isBootstrapCreated = !!(currentSession?.sessionData as any)?._bootstrapCreated

      // Convert ValuationRequest updates to sessionData format for backend
      // Backend expects sessionData structure, not raw ValuationRequest
      // Extract currentView if present (needed for session creation)
      const updatesAny = updates as any

      // Extract top-level mutable fields separately so autosave can persist them too.
      const currentView = updatesAny.currentView || currentSession?.currentView || 'manual'
      const hasExplicitName = Object.hasOwn(updatesAny, 'name')
      const name = hasExplicitName ? updatesAny.name : currentSession?.name

      // sessionData should contain the actual form data, not top-level session metadata.
      const { currentView: _, name: __, ...sessionDataWithoutView } = updatesAny
      const sessionData = updatesAny.sessionData || sessionDataWithoutView

      let response: any

      if (isBootstrapCreated) {
        // ✅ CREATE path: Session was created by bootstrap but not yet persisted
        // Use CREATE with session_key for idempotency (backend handles concurrent requests)
        logger.debug('Creating session (bootstrap-created, first save)', {
          reportId,
          hasSessionData: !!sessionData,
        })

        // Merge current session data with updates
        let mergedSessionData = {
          ...(currentSession?.sessionData || {}),
          ...sessionData,
          // Remove _bootstrapCreated flag after creation
          _bootstrapCreated: undefined,
        }

        // ✅ CRITICAL: Preserve _client_context if client context exists in store
        // This ensures accountant-client sessions are created with proper context
        try {
          const { useClientContext } = await import('../../stores/clientContext')
          const clientContext = useClientContext.getState()

          if (
            clientContext.isActingAsClient &&
            clientContext.client &&
            clientContext.accountant &&
            clientContext.relationshipId
          ) {
            mergedSessionData._client_context = {
              client_user_id: clientContext.client.id,
              accountant_user_id: clientContext.accountant.id,
              relationship_id: clientContext.relationshipId,
            }

            logger.debug('Including client context in session creation', {
              reportId,
              clientUserId: clientContext.client.id.substring(0, 8) + '...',
              accountantUserId: clientContext.accountant.id.substring(0, 8) + '...',
            })
          }
        } catch (error) {
          // Non-critical: Log but continue if client context check fails
          logger.warn('Failed to get client context for session creation (non-critical)', {
            reportId,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        response = await backendAPI.createValuationSession({
          session_key: reportId, // Use reportId as session_key for idempotency
          reportId,
          currentView,
          ...(name !== undefined && { name }),
          sessionData: stripReportBlobsFromSessionPatch(mergedSessionData) as any,
        } as any) // Type assertion needed because session_key is not in ValuationSession type

        // ✅ Remove _bootstrapCreated flag from store after successful creation
        if (response?.session) {
          const { useSessionStore } = await import('../../store/useSessionStore')
          const storeState = useSessionStore.getState()
          const currentStoreSession = storeState.session
          if (currentStoreSession?.reportId === reportId) {
            const updatedSessionData = {
              ...((currentStoreSession.sessionData as any) || {}),
              _bootstrapCreated: undefined,
            }
            storeState.hydrateSession({
              sessionData: updatedSessionData as any,
            })
            logger.debug('Removed _bootstrapCreated flag after successful creation', {
              reportId,
            })
          }
        }
      } else {
        // ✅ UPDATE path: Session already exists in backend
        const sessionUpdates: Partial<ValuationSession> = {
          sessionData: stripReportBlobsFromSessionPatch(sessionData) as any,
          ...(currentView && { currentView }),
          ...(name !== undefined && { name }),
        }

        response = await backendAPI.updateValuationSession(reportId, sessionUpdates)
      }

      let mergedSession: ValuationSession

      if (response?.session) {
        // Backend returned session data - use it
        const normalizedSession = normalizeSessionDates(response.session)
        mergedSession = mergeSessionFields(normalizedSession)
        if (name !== undefined && mergedSession.name === undefined) {
          mergedSession = {
            ...mergedSession,
            name,
          }
        }

        // ✅ CONSOLIDATED: Business card fetch removed from saveSession
        // Business card data should come from:
        // 1. Bootstrap (primary source)
        // 2. loadSession fallback (if bootstrap didn't provide it)
        // No need to re-fetch after save - data should already be in session
        const companyName = (mergedSession.sessionData as any)?.company_name
        const hasCompanyName = companyName && companyName.trim() !== ''

        logger.debug('Session saved', {
          reportId,
          hasCompanyName,
          company_name: companyName,
          sessionDataKeys: mergedSession.sessionData
            ? Object.keys(mergedSession.sessionData).length
            : 0,
        })
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
            logger.debug('Session reloaded successfully after save', {
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
            ...(name !== undefined && { name }),
          } as unknown as ValuationSession
        } else {
          mergedSession = reloadedSession
          if (name !== undefined && mergedSession.name === undefined) {
            mergedSession = {
              ...mergedSession,
              name,
            }
          }
        }
      }

      // Update cache
      globalSessionCache.set(reportId, mergedSession)

      const duration = performance.now() - startTime

      logger.debug('Session saved successfully', {
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
    }
  ): Promise<void> {
    const startTime = performance.now()

    try {
      logger.debug('Saving complete session', {
        reportId,
        hasFormData: !!data.formData,
        hasResult: !!data.valuationResult,
        hasHtmlReport: !!data.htmlReport,
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
          shares_for_sale: 100,
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
      if (data.valuationResult || data.htmlReport) {
        await sessionAPI.saveValuationResult(reportId, {
          valuationResult: data.valuationResult,
          htmlReport: data.htmlReport,
        })

        logger.debug('Valuation result saved', {
          reportId,
          hasHtmlReport: !!data.htmlReport,
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

          logger.debug('Cache updated with fresh valuation data', {
            reportId,
            hasHtmlReport: !!freshSession.htmlReport,
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

          logger.debug('Report update broadcasted to Mercury', { reportId })
        } catch (broadcastError) {
          // Non-critical - don't fail the save if broadcast fails
          logger.warn('Failed to broadcast report update', {
            reportId,
            error: getErrorMessage(broadcastError),
          })
        }
      }

      const duration = performance.now() - startTime

      logger.debug('Complete session saved successfully', {
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
   * Trigger background revalidation (public API)
   * Use when bootstrap path has session but lacks HTML assets - fetches from backend.
   */
  revalidateSessionInBackground(reportId: string): void {
    this.revalidateInBackground(reportId).catch((err) => {
      logger.warn('Background revalidation failed', {
        reportId,
        error: err instanceof Error ? err.message : String(err),
      })
    })
  }

  private valuationSnapshotHasRange(vr: unknown): boolean {
    if (!vr || typeof vr !== 'object') return false
    const o = vr as Record<string, unknown>
    return o.equity_value_mid != null || o.equity_value_low != null || o.equity_value_high != null
  }

  private sessionUsableHtmlMissing(s: ValuationSession): boolean {
    const h = s.htmlReport
    if (typeof h === 'string' && h.trim().length >= 100) return false
    const vr = s.valuationResult as Record<string, unknown> | null | undefined
    if (!vr) return true
    const top = typeof vr.html_report === 'string' ? vr.html_report : ''
    const d =
      typeof vr.details === 'object' && vr.details !== null
        ? (vr.details as { html_report?: string }).html_report
        : undefined
    const dStr = typeof d === 'string' ? d : ''
    return Math.max(top.trim().length, dStr.trim().length) < 100
  }

  private pickTitanReportIdForEnsure(urlId: string, s: ValuationSession): string | null {
    const sessionKey = extractStableSessionKeyFromMergedSession(s as unknown as Record<string, any>)

    const mergedReport =
      typeof s.reportId === 'string' && (isUuid(s.reportId) || isSessionKey(s.reportId))
        ? s.reportId.trim()
        : undefined

    // Prefer stable handles: session key resolves to the current row even when the URL
    // still carries an older valuation_reports.id after re-save / version link-updates.
    if (sessionKey) return sessionKey
    if (isSessionKey(urlId)) return urlId
    if (mergedReport) return mergedReport
    if (isUuid(urlId)) return urlId
    return null
  }

  private sessionNeedsHtmlRecovery(merged: ValuationSession): boolean {
    if (!merged?.valuationResult) return false
    if (!this.valuationSnapshotHasRange(merged.valuationResult)) return false
    return this.sessionUsableHtmlMissing(merged)
  }

  /**
   * Titan self-heal: when persisted valuation has a range but no usable HTML, render and store HTML.
   * Refetches the session on success so cache + Zustand pick up the report body.
   */
  private async tryRefetchAfterEnsureHtml(
    reportId: string,
    mergedSession: ValuationSession
  ): Promise<ValuationSessionResponse | null> {
    if (!this.sessionNeedsHtmlRecovery(mergedSession)) {
      return null
    }
    const ensureTargetId = this.pickTitanReportIdForEnsure(reportId, mergedSession)
    if (!ensureTargetId) {
      logger.debug(
        'HTML self-heal skipped: no Titan report identifier (need session key or report UUID)',
        {
          reportId: reportId?.substring(0, 24),
        }
      )
      return null
    }
    const sessionKeyBody = resolveEnsureHtmlSessionKey({
      urlReportId: reportId,
      mergedSession,
      ensureTargetId,
    })
    const alternateReportId = resolveEnsureHtmlAlternateReportId({
      urlReportId: reportId,
      mergedSession,
    })
    const dedupeKey = `${ensureTargetId}|${sessionKeyBody ?? ''}|${alternateReportId ?? ''}`
    if (ensureHtmlInFlight.has(dedupeKey)) {
      return null
    }
    ensureHtmlInFlight.add(dedupeKey)
    try {
      const res = await backendAPI.ensureReportHtml(ensureTargetId, {
        sync: true,
        ...(sessionKeyBody ? { sessionKey: sessionKeyBody } : {}),
        ...(alternateReportId ? { alternateReportId } : {}),
      })
      if (res == null) {
        logger.debug(
          'ensureReportHtml returned null (upstream error or self-heal disabled) — not refetching',
          {
            reportId: reportId?.substring(0, 24),
          }
        )
        return null
      }
      if ((res as { success?: boolean }).success === false) {
        return null
      }
      const lookupIds = orderedValuationSessionLookupIds({
        ensureResponseReportId: (res as { reportId?: unknown }).reportId,
        sessionKeyFallback: sessionKeyBody,
        mergedSessionReportId: mergedSession.reportId,
        urlReportId: reportId,
      })
      for (const id of lookupIds) {
        const next = await backendAPI.getValuationSession(id)
        if (next?.session) {
          return next
        }
      }
      return null
    } catch (e) {
      logger.warn('tryRefetchAfterEnsureHtml failed', {
        reportId,
        error: getErrorMessage(e),
      })
      return null
    } finally {
      ensureHtmlInFlight.delete(dedupeKey)
    }
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
      let sessionResponse = await backendAPI.getValuationSession(reportId)

      if (sessionResponse?.session) {
        // Validate and normalize the fresh session
        validateSessionData(sessionResponse.session)
        let normalizedSession = normalizeSessionDates(sessionResponse.session)
        let mergedSession = mergeSessionFields(normalizedSession)
        await backfillSparseSessionFromStoreSeed(reportId, mergedSession)

        const afterEnsure = await this.tryRefetchAfterEnsureHtml(reportId, mergedSession)
        if (afterEnsure?.session) {
          sessionResponse = afterEnsure
          validateSessionData(sessionResponse.session)
          normalizedSession = normalizeSessionDates(sessionResponse.session)
          mergedSession = mergeSessionFields(normalizedSession)
        }

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
          logger.debug('Business card data preserved during background revalidation', {
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
            sessionDataKeys: mergedSession.sessionData
              ? Object.keys(mergedSession.sessionData)
              : [],
          })
        }

        const canonicalReportId =
          typeof mergedSession.reportId === 'string' && mergedSession.reportId.trim()
            ? mergedSession.reportId.trim()
            : null
        const canonicalIsValid =
          canonicalReportId != null &&
          (isUuid(canonicalReportId) || isSessionKey(canonicalReportId))

        // Update cache with fresh data
        globalSessionCache.set(reportId, mergedSession)
        // Alias under Titan's canonical id so lookups succeed whether the UI/cache key was a stale UUID or val_*.
        if (canonicalIsValid && canonicalReportId !== reportId) {
          globalSessionCache.set(canonicalReportId, mergedSession)
        }

        logger.debug('Cache revalidated in background', {
          reportId,
          canonicalReportId: canonicalReportId?.substring(0, 36),
          hasHtmlReport: !!mergedSession.htmlReport,
        })

        // ✅ CRITICAL FIX: Also update session store AND results store to trigger reactive UI updates
        // Without this, the HTML reports fetched in background won't appear in the UI
        // until the user navigates away and back
        try {
          const { useSessionStore } = await import('../../store/useSessionStore')
          const currentStoreSession = useSessionStore.getState().session
          const storeRid = currentStoreSession?.reportId
          const shouldSyncStore =
            storeRid != null &&
            (storeRid === reportId ||
              (canonicalIsValid && canonicalReportId != null && storeRid === canonicalReportId))

          // Sync when the active session matches the revalidation key OR the canonical id from Titan
          // (handles stale-URL UUID in cache while Zustand already holds val_*).
          if (shouldSyncStore) {
            const { useManualResultsStore } = await import(
              '../../store/manual/useManualResultsStore'
            )
            const existingResult = useManualResultsStore.getState().result
            const revalidatedScreenHtml = getFirstRenderableReportHtml(
              mergedSession.htmlReport,
              (mergedSession.valuationResult as { html_report?: string } | null | undefined)
                ?.html_report,
              (
                mergedSession.valuationResult as
                  | { details?: { html_report?: string } }
                  | null
                  | undefined
              )?.details?.html_report
            )
            const safeHtmlForStores =
              revalidatedScreenHtml ||
              getFirstRenderableReportHtml(
                (existingResult as { html_report?: string } | null | undefined)?.html_report,
                (existingResult as { details?: { html_report?: string } } | null | undefined)
                  ?.details?.html_report
              )
            const hydratePayload: Partial<ValuationSession> = {
              htmlReport: safeHtmlForStores,
              valuationResult: mergedSession.valuationResult,
              sessionData: mergedSession.sessionData,
            }
            if (
              canonicalIsValid &&
              canonicalReportId &&
              storeRid &&
              canonicalReportId !== storeRid
            ) {
              hydratePayload.reportId = canonicalReportId
            }
            useSessionStore.getState().hydrateSession(hydratePayload)

            // Hydrate results store so report panel displays HTML (ManualLayout reads from useManualResultsStore)
            if (safeHtmlForStores || mergedSession.valuationResult) {
              try {
                const fullResult = {
                  ...(existingResult || {}),
                  ...(mergedSession.valuationResult || {}),
                  html_report: safeHtmlForStores,
                }
                useManualResultsStore.getState().setResult(fullResult as any)
                if (safeHtmlForStores) {
                  useManualResultsStore.getState().setHtmlReport(safeHtmlForStores)
                }
              } catch (resultsStoreError) {
                logger.warn('Failed to hydrate results store after revalidation', {
                  reportId,
                  error:
                    resultsStoreError instanceof Error
                      ? resultsStoreError.message
                      : String(resultsStoreError),
                })
              }
            }

            logger.info('Session store updated with revalidated HTML reports', {
              reportId,
              hasHtmlReport: !!safeHtmlForStores,
            })
          } else {
            logger.debug(
              'Skipping store update - active session does not match revalidated report',
              {
                revalidationKey: reportId,
                canonicalReportId,
                currentStoreReportId: storeRid,
              }
            )
          }
        } catch (storeError) {
          // Non-critical error - cache is still updated
          logger.warn('Failed to update session store after revalidation', {
            reportId,
            error: storeError instanceof Error ? storeError.message : String(storeError),
          })
        }
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
