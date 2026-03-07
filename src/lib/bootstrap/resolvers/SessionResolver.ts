/**
 * Session Resolver
 *
 * Resolves report/session state: new vs existing, status, resumability.
 * Fetches session data from Titan API.
 *
 * @module lib/bootstrap/resolvers/SessionResolver
 */

import { getApiUrl } from '../../../utils/getMercuryUrl'
import { isUuid } from '../../../utils/identifiers'
import type {
  BootstrapContext,
  BootstrapHints,
  BootstrapResolver,
  IdentityState,
  ReportState,
  ResolverResult,
} from '../types'
import { DEFAULT_REPORT } from '../types'
import { generateReportId, truncateForLog } from '../utils'

const API_URL = getApiUrl()

/**
 * Session data structure from Titan API
 */
interface SessionData {
  session_key: string
  session_data: Record<string, unknown>
  view_type: string
  current_step: number
  status: string
  created_at: string
  updated_at: string
  completed_at?: string
  user_id?: string
  report_id?: string
}

export class SessionResolver implements BootstrapResolver<ReportState> {
  private readonly logger = console

  /**
   * Resolve session/report state
   */
  async resolve(
    context: BootstrapContext,
    hints: BootstrapHints,
    identity?: IdentityState
  ): Promise<ResolverResult<ReportState>> {
    const startTime = performance.now()

    try {
      // If no report ID, this is a new report
      if (!hints.hasReportId || !context.reportId) {
        const newReportId = generateReportId()

        return {
          success: true,
          data: {
            mode: 'new',
            reportId: newReportId,
            hasExistingData: false,
            hasValuationResult: false,
            status: 'draft',
          },
          source: 'generated',
          durationMs: performance.now() - startTime,
        }
      }

      // Try to fetch existing session
      const sessionResult = await this.fetchSession(context.reportId, identity)

      if (sessionResult.success && sessionResult.data) {
        const session = sessionResult.data

        // ✅ CRITICAL FIX: If session is completed but has no report_id, auto-create report
        // This handles cases where valuation completed but report creation failed (e.g., null constraint bug)
        if (session.status === 'completed' && !session.report_id && this.hasExistingData(session)) {
          this.logger.info(
            '[SessionResolver] Session completed but no report exists - auto-creating report',
            {
              sessionKey: session.session_key.substring(0, 30) + '...',
              status: session.status,
              hasExistingData: this.hasExistingData(session),
            }
          )

          try {
            // Create report from session data
            const reportCreationResult = await this.createReportFromSession(session, identity)
            if (reportCreationResult.success && reportCreationResult.data) {
              const report = reportCreationResult.data

              this.logger.info('[SessionResolver] Report auto-created successfully', {
                sessionKey: session.session_key.substring(0, 30) + '...',
                reportId: report.id.substring(0, 8) + '...',
              })

              return {
                success: true,
                data: {
                  mode: 'existing',
                  reportId: report.id, // Use the actual report ID, not session key
                  hasExistingData: true,
                  hasValuationResult: true, // Completed reports have valuation output
                  version: context.version,
                  status: 'completed',
                  createdAt: new Date(report.created_at),
                  updatedAt: new Date(report.updated_at),
                  completedAt: new Date(report.completed_at),
                  currentStep: 5, // Completed reports are at step 5
                },
                source: 'titan_auto_created',
                durationMs: performance.now() - startTime,
              }
            } else {
              this.logger.warn(
                '[SessionResolver] Failed to auto-create report, falling back to session mode',
                {
                  sessionKey: session.session_key.substring(0, 30) + '...',
                  error: reportCreationResult.error,
                }
              )
            }
          } catch (error) {
            this.logger.error('[SessionResolver] Error auto-creating report', {
              sessionKey: session.session_key.substring(0, 30) + '...',
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }

        return {
          success: true,
          data: {
            mode: 'existing',
            reportId: session.session_key,
            hasExistingData: this.hasExistingData(session),
            hasValuationResult: this.hasValuationResult(session),
            version: context.version,
            status: this.mapStatus(session.status),
            createdAt: new Date(session.created_at),
            updatedAt: new Date(session.updated_at),
            completedAt: session.completed_at ? new Date(session.completed_at) : undefined,
            currentStep: session.current_step,
          },
          source: 'titan',
          durationMs: performance.now() - startTime,
        }
      }

      // Session not found - treat as new report with provided ID
      // This allows creating reports with pre-generated IDs
      this.logger.info('[SessionResolver] Session not found, creating new with ID', {
        reportId: truncateForLog(context.reportId),
      })

      return {
        success: true,
        data: {
          mode: 'new',
          reportId: context.reportId,
          hasExistingData: false,
          hasValuationResult: false,
          status: 'draft',
        },
        source: 'new_with_id',
        durationMs: performance.now() - startTime,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // BANK-GRADE: Log error with full context for debugging
      this.logger.error('[SessionResolver] Resolution failed - returning error state', {
        error: errorMessage,
        reportId: context.reportId?.substring(0, 30),
        note: 'UI will show error state, not silent fallback',
      })

      // Return error result - UI will handle appropriately
      // This is NOT a silent fallback - the error is propagated
      return {
        success: false,
        data: {
          mode: 'new' as const,
          reportId: context.reportId || generateReportId(),
          hasExistingData: false,
          hasValuationResult: false,
          status: 'draft' as const,
        },
        error: errorMessage,
        source: 'error',
        durationMs: performance.now() - startTime,
      }
    }
  }

  /**
   * Default state for new reports
   *
   * BANK-GRADE: This is NOT a fallback - it's the default for genuinely new reports
   */
  fallback(): ReportState {
    return {
      ...DEFAULT_REPORT,
      reportId: generateReportId(),
    }
  }

  /**
   * Fetch session from Titan API
   *
   * AUTH-FIRST: Guest session headers removed - authentication is required
   *
   * WARNING: This endpoint only accepts session keys (val_xxx format).
   * UUIDs from Mercury navigation will NOT work here - they need to go through
   * the Titan bootstrap endpoint which handles the report_id lookup.
   */
  private async fetchSession(
    sessionKey: string,
    identity?: IdentityState
  ): Promise<{ success: boolean; data?: SessionData; error?: string }> {
    try {
      // CRITICAL: Detect UUID format - this endpoint cannot resolve UUIDs
      // UUIDs are passed by Mercury when navigating to existing reports
      // The main bootstrap flow (bootstrapViaTitan) handles UUIDs correctly
      // This fallback path only works for val_xxx session keys
      // Using centralized identifier utilities for consistent format detection
      if (isUuid(sessionKey)) {
        this.logger.warn(
          '[SessionResolver] UUID passed to fetchSession - this endpoint only supports val_xxx format',
          {
            sessionKeyPrefix: sessionKey.substring(0, 15),
            note: 'UUIDs from Mercury should be handled by Titan bootstrap endpoint, not this fallback',
            suggestion: 'If you see this warning frequently, check why Titan bootstrap is failing',
          }
        )
        // Return not found - the caller will treat this as a new report
        // In production, this path should rarely be hit since Titan bootstrap handles UUIDs
        return {
          success: false,
          error: 'UUID format not supported by session endpoint - use bootstrap',
        }
      }

      const headers: Record<string, string> = {
        Accept: 'application/json',
      }

      // Add client context headers if accountant flow (omit X-Client-User-Id when null)
      if (identity?.type === 'accountant_for_client' && identity.clientContext) {
        if (identity.clientContext.clientUserId) {
          headers['X-Client-User-Id'] = identity.clientContext.clientUserId
        }
        headers['X-Accountant-User-Id'] = identity.clientContext.accountantUserId
      }

      const response = await fetch(`${API_URL}/api/v2/valuations/sessions/${sessionKey}`, {
        method: 'GET',
        credentials: 'include',
        headers,
      })

      if (response.status === 404) {
        return { success: false, error: 'Session not found' }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: errorData.message || `Failed to fetch session (${response.status})`,
        }
      }

      const data = await response.json()
      const session = data.data || data

      return { success: true, data: session }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      }
    }
  }

  /**
   * Check if session has meaningful existing data (INPUT or OUTPUT)
   * Returns true if any form field or valuation result exists
   */
  private hasExistingData(session: SessionData): boolean {
    const sessionData = session.session_data || {}

    // Check for key fields that indicate meaningful data (INPUT or OUTPUT)
    const meaningfulFields = [
      'company_name',
      'business_type_id',
      'revenue',
      'ebitda',
      'industry',
      'valuation_result',
    ]

    for (const field of meaningfulFields) {
      const value = sessionData[field]
      if (value !== null && value !== undefined && value !== '') {
        return true
      }
    }

    // Check for year data
    if (sessionData.year_data && typeof sessionData.year_data === 'object') {
      const years = Object.keys(sessionData.year_data)
      if (years.length > 0) {
        return true
      }
    }

    return false
  }

  /**
   * Check if session has completed valuation OUTPUT data
   * This is more specific than hasExistingData - only returns true if there's
   * an actual valuation_result (the completed valuation package)
   *
   * Use this for loading step messaging:
   * - hasValuationResult = true → Show "Restoring valuation package"
   * - hasValuationResult = false → Show "Initializing" (even if form data exists)
   */
  private hasValuationResult(session: SessionData): boolean {
    const sessionData = session.session_data || {}
    const valuationResult = sessionData.valuation_result as Record<string, unknown> | undefined

    // Check if valuation_result exists and is meaningful
    if (valuationResult && typeof valuationResult === 'object') {
      // Check for key output fields that indicate a completed valuation
      const hasOutputData = !!(
        valuationResult.valuation_min ||
        valuationResult.valuation_midpoint ||
        valuationResult.valuation_max ||
        valuationResult.html_report ||
        valuationResult.equity_value_low ||
        valuationResult.equity_value_mid ||
        valuationResult.equity_value_high
      )
      return hasOutputData
    }

    return false
  }

  /**
   * Create report from completed session
   *
   * AUTH-FIRST: Guest session headers removed - authentication is required
   */
  private async createReportFromSession(
    session: SessionData,
    identity?: IdentityState
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }

      // Add client context headers if accountant flow (omit X-Client-User-Id when null)
      if (identity?.type === 'accountant_for_client' && identity.clientContext) {
        if (identity.clientContext.clientUserId) {
          headers['X-Client-User-Id'] = identity.clientContext.clientUserId
        }
        headers['X-Accountant-User-Id'] = identity.clientContext.accountantUserId
      }

      // Extract relationship ID from session data if available
      const sessionData = session.session_data as any
      let relationshipId: string | undefined

      if (sessionData?._client_context?.relationship_id) {
        relationshipId = sessionData._client_context.relationship_id
      }

      const requestBody = {
        session_key: session.session_key,
        relationship_id: relationshipId,
      }

      const response = await fetch(
        `${API_URL}/api/v2/valuations/sessions/${session.session_key}/create-report`,
        {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify(requestBody),
        }
      )

      if (response.status === 409) {
        // Report already exists - fetch it
        const existingReport = await this.fetchExistingReport(session.session_key, identity)
        if (existingReport.success && existingReport.data) {
          return { success: true, data: existingReport.data }
        }
        return { success: false, error: 'Report already exists but could not be fetched' }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          success: false,
          error: errorData.message || `Failed to create report (${response.status})`,
        }
      }

      const data = await response.json()
      return { success: true, data: data.data || data }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      }
    }
  }

  /**
   * Fetch existing report by session key
   *
   * AUTH-FIRST: Guest session headers removed - authentication is required
   */
  private async fetchExistingReport(
    sessionKey: string,
    identity?: IdentityState
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      }

      // Add client context headers if accountant flow (omit X-Client-User-Id when null)
      if (identity?.type === 'accountant_for_client' && identity.clientContext) {
        if (identity.clientContext.clientUserId) {
          headers['X-Client-User-Id'] = identity.clientContext.clientUserId
        }
        headers['X-Accountant-User-Id'] = identity.clientContext.accountantUserId
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000)

      const response = await fetch(
        `${API_URL}/api/v2/valuations/reports/by-session/${sessionKey}`,
        {
          method: 'GET',
          credentials: 'include',
          headers,
          signal: controller.signal,
        }
      )

      clearTimeout(timeoutId)

      if (!response.ok) {
        return {
          success: false,
          error:
            response.status === 404
              ? 'Report not created yet'
              : `Failed to fetch existing report (${response.status})`,
        }
      }

      const data = await response.json()
      return { success: true, data: data.data || data }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      }
    }
  }

  /**
   * Map backend status to our status enum
   */
  private mapStatus(status: string): ReportState['status'] {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'completed'
      case 'active':
        return 'active'
      case 'expired':
        return 'expired'
      default:
        return 'draft'
    }
  }
}

// Export singleton instance
export const sessionResolver = new SessionResolver()
