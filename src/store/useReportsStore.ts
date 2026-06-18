/**
 * Reports Store
 *
 * Single Responsibility: Manage report list state
 * Separation: Reports list separate from active session state (useValuationSessionStore)
 */

import { create } from 'zustand'
import { reportService } from '../services/reports'
import type { ValuationSession } from '../types/valuation'
import { isSessionKey, isValuationIdSameAsActiveReport } from '../utils/identifiers'
import { createContextLogger } from '../utils/logger'

const reportsLogger = createContextLogger('ReportsStore')

export interface ReportsStore {
  // State
  reports: ValuationSession[]
  loading: boolean
  error: string | null

  // Actions
  fetchReports: (userId?: string) => Promise<void>
  addReport: (report: ValuationSession) => void
  updateReport: (reportId: string, updates: Partial<ValuationSession>) => void
  deleteReport: (reportId: string) => Promise<void>
  clearReports: () => void
}

export const useReportsStore = create<ReportsStore>((set, get) => ({
  // Initial state
  reports: [],
  loading: false,
  error: null,

  /**
   * Fetch recent reports for the current user/guest
   */
  fetchReports: async (userId?: string) => {
    set({ loading: true, error: null })

    try {
      reportsLogger.info('Fetching reports', {
        userId: userId ? userId.substring(0, 8) + '...' : 'guest',
      })

      const reports = await reportService.listRecentReports({
        userId,
        limit: 20,
        status: 'all',
      })

      set({ reports, loading: false })

      reportsLogger.info('Reports fetched successfully', {
        count: reports.length,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      set({ error: errorMessage, loading: false })

      reportsLogger.error('Failed to fetch reports', {
        error: errorMessage,
      })
    }
  },

  /**
   * Add new report to list (prepend - most recent first)
   */
  addReport: (report: ValuationSession) => {
    set((state) => ({
      reports: [report, ...state.reports],
    }))

    reportsLogger.info('Report added to list', {
      reportId: report.reportId,
      totalReports: get().reports.length,
    })
  },

  /**
   * Update existing report in list
   */
  updateReport: (reportId: string, updates: Partial<ValuationSession>) => {
    set((state) => ({
      reports: state.reports.map((r) => (r.reportId === reportId ? { ...r, ...updates } : r)),
    }))

    reportsLogger.info('Report updated in list', {
      reportId,
      updateFields: Object.keys(updates).length,
    })
  },

  /**
   * Delete report from backend and remove from list
   */
  deleteReport: async (reportId: string) => {
    try {
      reportsLogger.info('Deleting report', { reportId })

      // Delete from backend
      await reportService.deleteReport(reportId)

      // ✅ CRITICAL: Clear localStorage cache AND session store for this report
      // This ensures the report doesn't reappear after page refresh
      let didClearSession = false
      try {
        const { globalSessionCache } = await import('../utils/sessionCacheManager')
        globalSessionCache.remove(reportId)
        reportsLogger.info('Cache cleared for deleted report', { reportId })

        // Also clear from session store if it's the active session
        const { useSessionStore } = await import('./useSessionStore')
        const currentSession = useSessionStore.getState().session
        const activeId = currentSession?.reportId
        if (
          activeId &&
          isValuationIdSameAsActiveReport(reportId, {
            reportId: activeId,
            resolvedReportId: activeId,
            sessionReportId: isSessionKey(activeId) ? undefined : activeId,
            sessionKey: isSessionKey(activeId) ? activeId : undefined,
          })
        ) {
          const { markReportsDeleting } = await import(
            '../features/manual/utils/manualReportDeleteGuard'
          )
          const { tearDownWorkspaceAfterActiveReportDeleted } = await import(
            '../features/manual/utils/resetManualWorkspaceState'
          )
          const sessionReportIdForGuard = isSessionKey(activeId) ? undefined : activeId
          const activeSessionKeyForGuard = isSessionKey(activeId) ? activeId : undefined
          markReportsDeleting([
            reportId,
            activeId,
            sessionReportIdForGuard,
            activeSessionKeyForGuard,
          ])
          tearDownWorkspaceAfterActiveReportDeleted([reportId, activeId])
          didClearSession = true
          reportsLogger.info('Active session cleared for deleted report', { reportId })
          // Leave delete guard set until navigation — same as sidebar delete success path.
        }
      } catch (cacheError) {
        // Don't fail delete if cache clear fails
        reportsLogger.warn('Failed to clear cache for deleted report', {
          reportId,
          error: cacheError instanceof Error ? cacheError.message : String(cacheError),
        })
      }

      // Remove from local state
      set((state) => ({
        reports: state.reports.filter((r) => r.reportId !== reportId),
      }))

      // Broadcast for same-origin tab sync and notify Mercury when embedded
      try {
        const { broadcastReportDeleted } = await import('../utils/auth/cross-domain-logout')
        broadcastReportDeleted({ reportId })

        if (typeof window !== 'undefined' && window !== window.parent) {
          const isEmbedded = sessionStorage.getItem('upswitch_venus_embedded') === 'true'
          if (isEmbedded) {
            window.parent.postMessage(
              { type: 'venus-report-deleted', data: { reportId }, source: 'venus' },
              '*'
            )
            if (didClearSession) {
              const localeMatch = window.location.pathname.match(/^\/(en|nl|fr)/)
              const locale = localeMatch?.[1] ?? 'en'
              const { navigateToMercuryFromManualHandoff } = await import(
                '../features/manual/utils/manualMercuryNavigate'
              )
              navigateToMercuryFromManualHandoff({
                currentLocale: locale,
                hasCompletedValuation: false,
              })
            }
          }
        }
      } catch (syncError) {
        reportsLogger.warn('Failed to broadcast report deleted', {
          reportId,
          error: syncError instanceof Error ? syncError.message : String(syncError),
        })
      }

      reportsLogger.info('Report deleted successfully', {
        reportId,
        remainingReports: get().reports.length,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      reportsLogger.error('Failed to delete report', {
        error: errorMessage,
        reportId,
      })

      throw error
    }
  },

  /**
   * Clear all reports from state
   */
  clearReports: () => {
    set({ reports: [], error: null })

    reportsLogger.info('Reports cleared from state')
  },
}))
