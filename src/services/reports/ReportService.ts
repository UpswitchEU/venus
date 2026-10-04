/**
 * Report Service
 *
 * AUTH-FIRST: All users must be authenticated before accessing reports.
 * Single Responsibility: Manage report lifecycle (CRUD operations)
 * Dependency Inversion: Depends on API abstraction
 */

import type { ValuationRequest, ValuationSession } from '../../types/valuation'
import { getApiUrl } from '../../utils/getMercuryUrl'
import { createContextLogger } from '../../utils/logger'
import { generateReportId } from '../../utils/reportIdGenerator'
import { backendAPI } from '../backendApi'
import { normalizeReportListPayload } from './ReportListNormalizer'

// AUTH-FIRST: guestSessionService removed - authentication is required

const reportLogger = createContextLogger('ReportService')
type UnknownRecord = Record<string, unknown>
type PaywallError = Error & {
  isPaywallError: true
  current?: unknown
  limit?: unknown
  reason?: unknown
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function isPaywallError(error: unknown): error is PaywallError {
  return error instanceof Error && (error as Partial<PaywallError>).isPaywallError === true
}

export interface ListReportsOptions {
  userId?: string
  limit?: number
  offset?: number
  status?: 'in_progress' | 'completed' | 'all'
}

export interface ListReportsResponse {
  sessions: ValuationSession[]
  total: number
  has_more: boolean
}

export interface ReportService {
  // List recent reports
  listRecentReports(options?: ListReportsOptions): Promise<ValuationSession[]>

  // Get full report by ID
  getReportById(reportId: string): Promise<ValuationSession>

  // Create new report
  createReport(initialData?: Partial<ValuationRequest>): Promise<ValuationSession>

  // Update report data
  updateReport(reportId: string, data: Partial<ValuationRequest>): Promise<void>

  // Delete report
  deleteReport(reportId: string): Promise<void>

  // Duplicate report
  duplicateReport(reportId: string): Promise<ValuationSession>
}

class ReportServiceImpl implements ReportService {
  /**
   * List recent reports for the current user
   * AUTH-FIRST: Requires authentication
   * Uses existing GET /api/reports endpoint
   */
  async listRecentReports(options: ListReportsOptions = {}): Promise<ValuationSession[]> {
    const { userId, limit = 20, offset = 0, status = 'all' } = options

    try {
      reportLogger.info('Fetching recent reports', {
        userId: userId ? userId.substring(0, 8) + '...' : 'none',
        limit,
        offset,
        status,
      })

      // Use local API proxy route which forwards to Titan with cookies
      const url = `/api/reports?limit=${limit}&offset=${offset}`

      // AUTH-FIRST: Guest session handling removed - authentication required
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'include', // Include cookies for auth
      })

      if (!response.ok) {
        if (response.status === 401) {
          // Not authenticated - return empty array for now
          reportLogger.info('Not authenticated - returning empty reports list')
          return []
        }
        throw new Error(`Failed to fetch reports: ${response.statusText}`)
      }

      const sessions = normalizeReportListPayload(await response.json())

      reportLogger.info('Reports fetched successfully', {
        count: sessions.length,
      })

      // Warm cache for recent reports (non-blocking)
      if (sessions.length > 0 && typeof window !== 'undefined') {
        try {
          const { globalSessionCache } = await import('../../utils/sessionCacheManager')
          const recentReportIds = sessions.slice(0, 5).map((s) => s.reportId) // Warm top 5
          globalSessionCache.warmCache(recentReportIds).catch(() => {
            // Non-critical - cache warming is optional
          })
        } catch (_error) {
          // Non-critical
        }
      }

      return sessions
    } catch (error) {
      reportLogger.error('Failed to fetch recent reports', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      })
      // Return empty array instead of throwing - graceful degradation
      return []
    }
  }

  /**
   * Get full report by ID
   */
  async getReportById(reportId: string): Promise<ValuationSession> {
    try {
      reportLogger.info('Fetching report by ID', { reportId })

      const response = await backendAPI.getValuationSession(reportId)

      if (!response || !response.session) {
        throw new Error('Session not found')
      }

      const session = response.session

      reportLogger.info('Report fetched successfully', {
        reportId,
        hasPartialData: !!session.partialData,
        hasResult: !!asRecord(session.sessionData)?.valuation_result,
      })

      return session
    } catch (error) {
      reportLogger.error('Failed to fetch report', {
        error: error instanceof Error ? error.message : 'Unknown error',
        reportId,
      })
      throw error
    }
  }

  /**
   * Check if user can create a valuation (plan enforcement)
   * Returns true if allowed, throws error with paywall data if blocked
   */
  private async checkValuationLimit(): Promise<void> {
    try {
      const baseURL = getApiUrl()
      // ✅ FIX: Add /v2 to the API path (endpoint is at /api/v2/billing/...)
      const url = `${baseURL}/api/v2/billing/plan-enforcement/check?usage_type=VALUATION`

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for auth
      })

      if (!response.ok) {
        // If endpoint doesn't exist or fails, allow creation (graceful degradation)
        reportLogger.warn('Plan enforcement check failed, allowing creation', {
          status: response.status,
        })
        return
      }

      const result = asRecord(await response.json()) ?? {}

      if (result.allowed !== true) {
        // User has hit their valuation limit
        const error = new Error(
          asString(result.message) ?? 'Valuation limit reached'
        ) as PaywallError
        error.isPaywallError = true
        error.current = result.current
        error.limit = result.limit
        error.reason = result.reason
        throw error
      }

      reportLogger.info('Valuation limit check passed', {
        current: result.current,
        limit: result.limit,
      })
    } catch (error) {
      // If it's a paywall error, re-throw it
      if (isPaywallError(error)) {
        throw error
      }

      // Otherwise, log warning and allow creation (graceful degradation)
      reportLogger.warn('Plan enforcement check error, allowing creation', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * Log usage after successful valuation creation
   */
  private async logValuationUsage(reportId: string): Promise<void> {
    try {
      const baseURL = getApiUrl()
      const url = `${baseURL}/api/billing/usage-logs`

      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          usage_type: 'VALUATION',
          resource_id: reportId,
          success: true,
        }),
      })

      reportLogger.info('Valuation usage logged', { reportId })
    } catch (error) {
      // Non-critical, just log the error
      reportLogger.warn('Failed to log valuation usage', {
        error: error instanceof Error ? error.message : 'Unknown error',
        reportId,
      })
    }
  }

  /** Return a report only after Titan acknowledges its durable creation. */
  async createReport(initialData?: Partial<ValuationRequest>): Promise<ValuationSession> {
    const reportId = generateReportId()
    try {
      await this.checkValuationLimit()
      const session: ValuationSession = {
        reportId,
        currentView: 'manual',
        dataSource: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        partialData: initialData || {},
        sessionData: initialData || {},
      }
      const saved = await this.syncReportToBackend(session)
      if (!saved?.reportId) throw new Error('Report creation was not confirmed')
      if (typeof window !== 'undefined') {
        try {
          const { broadcastReportCreated } = require('../../utils/auth/cross-domain-logout')
          broadcastReportCreated({
            reportId: saved.reportId,
            reportName: saved.name,
            createdAt: saved.createdAt,
            clientId: this.getClientId(),
          })
        } catch (error) {
          reportLogger.warn('Failed to broadcast report creation', { reportId, error })
        }
      }
      return saved
    } catch (error) {
      // If it's a paywall error, re-throw with additional context
      if (isPaywallError(error)) {
        reportLogger.info('Valuation blocked by plan enforcement', {
          current: error.current,
          limit: error.limit,
        })
        throw error
      }

      reportLogger.error('Failed to create report', {
        error: error instanceof Error ? error.message : 'Unknown error',
        reportId,
      })
      throw error
    }
  }

  /**
   * Persist report to the authoritative backend
   */
  private async syncReportToBackend(session: ValuationSession): Promise<ValuationSession> {
    const response = await backendAPI.createValuationSession(session)
    if (!response?.session?.reportId) throw new Error('Report creation was not confirmed')

    // Log usage after successful sync
    await this.logValuationUsage(session.reportId)

    // The caller validates acknowledgement before reporting success.
    return response.session
  }

  /**
   * Get client ID from client context (if accountant is acting as client)
   */
  private getClientId(): string | undefined {
    if (typeof window === 'undefined') return undefined

    try {
      const { useClientContext } = require('../../stores/clientContext')
      const context = useClientContext.getState()
      return context.isActingAsClient ? context.relationshipId : undefined
    } catch (_error) {
      return undefined
    }
  }

  /**
   * Update report data
   */
  async updateReport(reportId: string, data: Partial<ValuationRequest>): Promise<void> {
    try {
      reportLogger.info('Updating report', {
        reportId,
        fieldCount: Object.keys(data).length,
      })

      await backendAPI.updateValuationSession(reportId, {
        partialData: data,
        updatedAt: new Date(),
      } as Partial<ValuationSession>)

      reportLogger.info('Report updated successfully', { reportId })
    } catch (error) {
      reportLogger.error('Failed to update report', {
        error: error instanceof Error ? error.message : 'Unknown error',
        reportId,
      })
      throw error
    }
  }

  /**
   * Delete report
   * AUTH-FIRST: Requires authentication
   * Uses local proxy route DELETE /api/reports/:reportId
   */
  async deleteReport(reportId: string): Promise<void> {
    try {
      reportLogger.info('Deleting report', { reportId })

      // Use local API proxy route which forwards to Titan with cookies
      const url = `/api/reports/${reportId}`

      // AUTH-FIRST: Guest session handling removed - authentication required
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }

      const response = await fetch(url, {
        method: 'DELETE',
        headers,
        credentials: 'include', // Include cookies for auth
      })

      if (!response.ok) {
        // ✅ FIX: Always clear cache regardless of error status (404, 500, etc.)
        // This ensures frontend cache is cleared even if backend has issues
        try {
          const { globalSessionCache } = await import('../../utils/sessionCacheManager')
          globalSessionCache.remove(reportId)
          reportLogger.info('Cache cleared for report (treating as deleted)', {
            reportId,
            status: response.status,
            statusText: response.statusText,
          })
        } catch (cacheError) {
          reportLogger.warn('Failed to clear cache for report', {
            reportId,
            error: cacheError instanceof Error ? cacheError.message : String(cacheError),
          })
        }

        if (response.status === 404) {
          // ✅ CRITICAL: Even if backend says 404, treat as success (idempotent deletion)
          // This handles race conditions where report was deleted but cache still exists
          reportLogger.warn('Report not found (already deleted?) - treating as success', {
            reportId,
          })
          return // Gracefully handle already deleted
        }
        if (response.status === 403) {
          throw new Error('Not authorized to delete this report')
        }
        if (response.status === 500) {
          // ✅ FIX: Even on 500, clear cache and treat as success (idempotent)
          // Backend may have partially deleted or had errors, but cache should be cleared
          reportLogger.warn(
            'Backend error during deletion (500) - cache cleared, treating as success',
            {
              reportId,
              note: 'Report may have been partially deleted, cache cleared to prevent reappearance',
            }
          )
          return // Treat as success - cache is cleared
        }
        throw new Error(`Failed to delete report: ${response.statusText}`)
      }

      const json = await response.json()

      if (!json.success) {
        throw new Error(json.error || 'Failed to delete report')
      }

      reportLogger.info('Report deleted successfully', { reportId })
    } catch (error) {
      reportLogger.error('Failed to delete report', {
        error: error instanceof Error ? error.message : 'Unknown error',
        reportId,
      })
      throw error
    }
  }

  /**
   * Duplicate report (create a copy)
   */
  async duplicateReport(reportId: string): Promise<ValuationSession> {
    try {
      reportLogger.info('Duplicating report', { originalReportId: reportId })

      // Fetch original session
      const originalSession = await this.getReportById(reportId)

      // Create new report with copied data
      return await this.createReport(originalSession.partialData)
    } catch (error) {
      reportLogger.error('Failed to duplicate report', {
        error: error instanceof Error ? error.message : 'Unknown error',
        reportId,
      })
      throw error
    }
  }
}

// Export singleton instance
export const reportService = new ReportServiceImpl()
