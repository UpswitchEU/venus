/**
 * Report Service
 *
 * Single Responsibility: Manage report lifecycle (CRUD operations)
 * Dependency Inversion: Depends on API abstraction
 */

import type { ValuationRequest, ValuationSession } from '../../types/valuation'
import { createContextLogger } from '../../utils/logger'
import { generateReportId } from '../../utils/reportIdGenerator'
import { backendAPI } from '../backendApi'
import { guestSessionService } from '../guestSessionService'

const reportLogger = createContextLogger('ReportService')

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
   * List recent reports for the current user/guest
   * Uses existing GET /api/reports endpoint
   */
  async listRecentReports(options: ListReportsOptions = {}): Promise<ValuationSession[]> {
    const { userId, limit = 20, offset = 0, status = 'all' } = options

    try {
      reportLogger.info('Fetching recent reports', {
        userId: userId ? userId.substring(0, 8) + '...' : 'guest',
        limit,
        offset,
        status,
      })

      // Call existing backend endpoint: GET /api/reports
      // Include guest session ID header for guest users
      const baseURL =
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        'https://api.upswitch.app'
      const url = `${baseURL}/api/reports?limit=${limit}&offset=${offset}`

      // Get guest session ID if user is a guest
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }

      // Add guest session ID header for guest users
      if (!userId || userId === 'guest') {
        try {
          const guestSessionId = guestSessionService.getGuestSessionId()
          if (guestSessionId) {
            headers['x-guest-session-id'] = guestSessionId
            reportLogger.debug('Added guest session ID to request', {
              guestSessionId: guestSessionId.substring(0, 15) + '...',
            })
          }
        } catch (error) {
          reportLogger.warn('Failed to get guest session ID', { error })
          // Continue without guest session ID - backend will return empty
        }
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

      const json = await response.json()

      // Backend returns: { success: true, data: [...] }
      const reports = json.data || json.sessions || []

      // Transform backend reports to ValuationSession format
      const sessions: ValuationSession[] = reports.map((report: any) => {
        // Get valuation data if available
        // Backend returns: session_data, partial_data (both are JSONB objects)
        const partialData = report.partial_data || {}
        const sessionData = report.session_data || report.valuation_data || {}

        // Ensure company_name is in sessionData if provided at top level
        // Backend extracts company_name from session_data for convenience
        const enrichedSessionData = {
          ...sessionData,
          ...(report.company_name && !sessionData.company_name
            ? { company_name: report.company_name }
            : {}),
        }

        return {
          reportId: report.id || report.report_id,
          currentView:
            report.flow_type === 'ai-guided' || report.current_view === 'ai-guided'
              ? 'conversational'
              : 'manual',
          dataSource:
            report.flow_type === 'ai-guided' || report.data_source === 'ai-guided'
              ? 'conversational'
              : 'manual',
          name: report.name || undefined, // Custom valuation name
          createdAt: report.created_at ? new Date(report.created_at) : new Date(),
          updatedAt: report.updated_at ? new Date(report.updated_at) : new Date(),
          completedAt: report.completed_at ? new Date(report.completed_at) : undefined,
          partialData,
          sessionData: enrichedSessionData,
          // CRITICAL: Include valuation result fields from backend
          valuationResult: report.valuation_result || null,
          htmlReport: report.html_report || null,
          infoTabHtml: report.info_tab_html || null,
          calculatedAt: report.calculated_at ? new Date(report.calculated_at) : undefined,
        } as ValuationSession
      })

      reportLogger.info('Reports fetched successfully', {
        count: sessions.length,
      })

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
        hasResult: !!(session.sessionData as any)?.valuation_result,
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
      const baseURL =
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        'https://api.upswitch.app'
      const url = `${baseURL}/api/billing/plan-enforcement/check?usage_type=VALUATION`

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

      const result = await response.json()

      if (!result.allowed) {
        // User has hit their valuation limit
        const error: any = new Error(result.message || 'Valuation limit reached')
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
      if ((error as any).isPaywallError) {
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
      const baseURL =
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        'https://api.upswitch.app'
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

  /**
   * Create new report
   */
  async createReport(initialData?: Partial<ValuationRequest>): Promise<ValuationSession> {
    const reportId = generateReportId()

    try {
      reportLogger.info('Creating new report', {
        reportId,
        hasInitialData: !!initialData && Object.keys(initialData).length > 0,
      })

      // 1. Check plan enforcement BEFORE creating valuation
      await this.checkValuationLimit()

      // 2. Create session object matching ValuationSession interface
      const newSession: ValuationSession = {
        reportId,
        currentView: 'manual',
        dataSource: 'manual',
        createdAt: new Date(),
        updatedAt: new Date(),
        partialData: initialData || {},
        sessionData: initialData || {},
      }

      const response = await backendAPI.createValuationSession(newSession)

      reportLogger.info('Report created successfully', {
        reportId,
      })

      // 3. Log usage after successful creation
      await this.logValuationUsage(reportId)

      return response.session
    } catch (error) {
      // If it's a paywall error, re-throw with additional context
      if ((error as any).isPaywallError) {
        reportLogger.info('Valuation blocked by plan enforcement', {
          current: (error as any).current,
          limit: (error as any).limit,
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
   * Uses existing DELETE /api/reports/:reportId endpoint
   */
  async deleteReport(reportId: string): Promise<void> {
    try {
      reportLogger.info('Deleting report', { reportId })

      // Call existing backend endpoint: DELETE /api/reports/:reportId
      const baseURL =
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        'https://api.upswitch.app'
      const url = `${baseURL}/api/reports/${reportId}`

      // Get guest session ID header for guest users
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }

      // Add guest session ID header for guest users
      try {
        const guestSessionId = guestSessionService.getGuestSessionId()
        if (guestSessionId) {
          headers['x-guest-session-id'] = guestSessionId
          reportLogger.debug('Added guest session ID to delete request', {
            guestSessionId: guestSessionId.substring(0, 15) + '...',
            reportId,
          })
        }
      } catch (error) {
        reportLogger.warn('Failed to get guest session ID for delete', { error })
        // Continue without guest session ID - backend will check auth
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
