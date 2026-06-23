/**
 * Session Resolver
 *
 * Resolves report/session state: new vs existing, status, resumability.
 * Fetches session data from Titan API.
 *
 * @module lib/bootstrap/resolvers/SessionResolver
 */

import { fetchWithBySession404Retry } from '../../../utils/fetchWithBySession404Retry'
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
import { sessionHasExistingData, sessionHasValuationResult } from './SessionResolverModel'

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

interface ReportRecord extends Record<string, unknown> {
  id: string
  created_at: string
  updated_at: string
  completed_at?: string
}

type ReportLookupResult = {
  success: boolean
  data?: ReportRecord
  error?: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function unwrapDataRecord(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value)
  return asRecord(record?.data) ?? record
}

function asReportRecord(value: unknown): ReportRecord | undefined {
  const record = unwrapDataRecord(value)
  const id = readString(record?.id)
  const createdAt = readString(record?.created_at)
  const updatedAt = readString(record?.updated_at)

  if (!record || !id || !createdAt || !updatedAt) {
    return undefined
  }

  const report: ReportRecord = {
    ...record,
    id,
    created_at: createdAt,
    updated_at: updatedAt,
  }

  const completedAt = readString(record.completed_at)
  if (completedAt) {
    report.completed_at = completedAt
  }

  return report
}

function readErrorMessage(value: unknown): string | undefined {
  return readString(asRecord(value)?.message)
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
        const hasExistingData = sessionHasExistingData(session)
        const hasValuationResult = sessionHasValuationResult(session)
        const status = this.mapStatus(session.status)

        // If session is completed but has no report_id, auto-create report.
        // This handles cases where valuation completed but report creation failed (e.g., null constraint bug)
        if (session.status === 'completed' && !session.report_id && hasExistingData) {
          this.logger.info(
            '[SessionResolver] Session completed but no report exists - auto-creating report',
            {
              sessionKey: session.session_key.substring(0, 30) + '...',
              status: session.status,
              hasExistingData,
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
                  reportReady: true,
                  version: context.version,
                  status: 'completed',
                  createdAt: new Date(report.created_at),
                  updatedAt: new Date(report.updated_at),
                  completedAt: report.completed_at ? new Date(report.completed_at) : undefined,
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
            hasExistingData,
            hasValuationResult,
            reportReady: status !== 'completed' || hasValuationResult,
            version: context.version,
            status,
            createdAt: new Date(session.created_at),
            updatedAt: new Date(session.updated_at),
            completedAt: session.completed_at ? new Date(session.completed_at) : undefined,
            currentStep: session.current_step,
          },
          source: 'titan',
          durationMs: performance.now() - startTime,
        }
      }

      if (hints.hasReportId && isUuid(context.reportId)) {
        this.logger.warn(
          '[SessionResolver] Existing report lookup failed - refusing draft fallback',
          {
            reportId: truncateForLog(context.reportId),
            error: sessionResult.error,
          }
        )

        return {
          success: false,
          data: {
            mode: 'existing',
            reportId: context.reportId,
            hasExistingData: false,
            hasValuationResult: false,
            reportReady: false,
            version: context.version,
            status: 'draft',
          },
          error: sessionResult.error || 'Existing report not found',
          source: 'existing_lookup_failed',
          durationMs: performance.now() - startTime,
        }
      }

      // Session not found for a genuinely new flow - treat as a draft with the provided ID.
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
          reportReady: true,
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
          reportReady: true,
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
      reportReady: true,
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
        // Return not found. The caller refuses draft fallback for UUIDs because
        // Mercury UUID handoffs are existing report lookups.
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
   * Create report from completed session
   *
   * AUTH-FIRST: Guest session headers removed - authentication is required
   */
  private async createReportFromSession(
    session: SessionData,
    identity?: IdentityState
  ): Promise<ReportLookupResult> {
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
      const sessionData = asRecord(session.session_data)
      const clientContext = asRecord(sessionData?._client_context)
      const relationshipId = readString(clientContext?.relationship_id)

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
        const errorData: unknown = await response.json().catch(() => ({}))
        return {
          success: false,
          error: readErrorMessage(errorData) || `Failed to create report (${response.status})`,
        }
      }

      const data: unknown = await response.json()
      const report = asReportRecord(data)
      if (!report) {
        return { success: false, error: 'Unexpected report response from create-report endpoint' }
      }

      return { success: true, data: report }
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
  ): Promise<ReportLookupResult> {
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

    const url = `${API_URL}/api/v2/valuations/reports/by-session/${sessionKey}`

    try {
      const response = await fetchWithBySession404Retry(
        url,
        {
          method: 'GET',
          credentials: 'include',
          headers,
        },
        {
          log: (_message, context) => {
            this.logger.debug('[SessionResolver] Report by-session not ready yet, retrying', {
              sessionKey: truncateForLog(sessionKey),
              attempt: context.attempt,
            })
          },
        }
      )

      if (response.ok) {
        const data: unknown = await response.json()
        const report = asReportRecord(data)
        if (!report) {
          return { success: false, error: 'Unexpected report response from by-session endpoint' }
        }

        return { success: true, data: report }
      }

      return {
        success: false,
        error:
          response.status === 404
            ? 'Report not created yet'
            : `Failed to fetch existing report (${response.status})`,
      }
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
