/**
 * Report Service
 *
 * Shared service for report operations across Manual and Conversational flows.
 * Provides a single, consistent API for report management.
 *
 * Key Features:
 * - Save report assets (valuation results, HTML reports)
 * - Complete report operations (mark as complete, track credits)
 * - Report retrieval and updates
 * - Unified error handling
 *
 * Used by:
 * - Manual Flow (after calculation completes)
 * - Conversational Flow (after calculation completes)
 *
 * @module services/report/ReportService
 */

import { ApplicationError, NetworkError, NotFoundError, ValidationError } from '../../types/errors'
import type { ValuationResponse } from '../../types/valuation'
import { getErrorMessage } from '../../utils/errors/errorConverter'
import { createContextLogger } from '../../utils/logger'
import { backendAPI } from '../backendApi'

const logger = createContextLogger('ReportService')

// ✅ FIX: Coordination mechanism to prevent race conditions between saveSession and saveReportAssets
// Tracks pending asset saves to ensure saveSession waits for saveReportAssets to complete
export const pendingAssetSaves = new Map<string, Promise<void>>()

/**
 * ReportService - Shared report management
 *
 * Singleton service for consistent report operations across all flows.
 */
export class ReportService {
  private static instance: ReportService

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ReportService {
    if (!ReportService.instance) {
      ReportService.instance = new ReportService()
    }
    return ReportService.instance
  }

  /**
   * Save complete report package
   *
   * Saves all report-related data in single atomic operation:
   * - Session data (input fields / collected data)
   * - Valuation result object
   * - HTML report (main)
   * - Info tab HTML
   *
   * @param reportId - Report identifier
   * @param assets - Complete report assets to save
   */
  async saveReportAssets(
    reportId: string,
    assets: {
      sessionData?: any // ✅ NEW: Input data (form fields or collected data)
      valuationResult?: ValuationResponse
      htmlReport?: string
      name?: string // Custom valuation name (e.g., "Amadeus report")
    }
  ): Promise<void> {
    // ✅ FIX: Check if there's already a pending save for this reportId
    // If so, wait for it to complete to prevent race conditions, then proceed with new save
    const existingSave = pendingAssetSaves.get(reportId)
    if (existingSave) {
      logger.info(
        '[ReportService] Waiting for pending asset save to complete before saving new assets',
        {
          reportId,
          note: 'Queueing save to prevent data loss - will save new assets after existing save completes',
        }
      )
      await existingSave
      // ✅ FIX: Continue to save new assets after existing save completes (removed early return)
      // This ensures all saves are processed sequentially without data loss
    }

    // Create save promise and track it
    const savePromise = this._saveReportAssetsInternal(reportId, assets)
    pendingAssetSaves.set(reportId, savePromise)

    try {
      await savePromise
    } finally {
      // Clean up tracking after completion
      pendingAssetSaves.delete(reportId)
    }
  }

  private async _saveReportAssetsInternal(
    reportId: string,
    assets: {
      sessionData?: any
      valuationResult?: ValuationResponse
      htmlReport?: string
      name?: string // Custom valuation name (e.g., "Amadeus report")
    }
  ): Promise<void> {
    const startTime = performance.now()

    try {
      logger.info('Saving complete report package', {
        reportId,
        hasSessionData: !!assets.sessionData,
        sessionDataKeys: assets.sessionData ? Object.keys(assets.sessionData) : [],
        hasResult: !!assets.valuationResult,
        hasHtmlReport: !!assets.htmlReport,
        htmlLength: assets.htmlReport?.length || 0,
      })

      // Import SessionAPI dynamically to avoid circular dependencies
      const { SessionAPI } = await import('../api/session/SessionAPI')
      const sessionAPI = new SessionAPI()

      // ✅ CRITICAL FIX: Ensure _client_context is included in sessionData for accountant-client workflows
      // This ensures backend can properly link the valuation to accountant_customers
      let sessionDataWithContext = assets.sessionData || {}
      try {
        const { useClientContext } = await import('../../stores/clientContext')
        const clientContext = useClientContext.getState()

        if (
          clientContext.isActingAsClient &&
          clientContext.accountant &&
          clientContext.relationshipId
        ) {
          sessionDataWithContext = {
            ...sessionDataWithContext,
            _client_context: {
              client_user_id: clientContext.client?.id ?? null,
              accountant_user_id: clientContext.accountant.id,
              relationship_id: clientContext.relationshipId,
            },
          }

          logger.debug('[ReportService] Including client context in save payload', {
            reportId,
            clientUserId: clientContext.client?.id
              ? clientContext.client.id.substring(0, 8) + '...'
              : 'null',
            accountantUserId: clientContext.accountant.id.substring(0, 8) + '...',
            relationshipId: clientContext.relationshipId.substring(0, 8) + '...',
          })
        }
      } catch (error) {
        // Non-critical: Log but continue if client context check fails
        logger.warn('[ReportService] Failed to get client context for save (non-critical)', {
          reportId,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      // Save complete package to backend in single API call
      const putResultStartTime = performance.now()
      const saveResponse = await sessionAPI.saveValuationResult(reportId, {
        sessionData: sessionDataWithContext,
        valuationResult: assets.valuationResult,
        htmlReport: assets.htmlReport,
        name: assets.name,
      })
      const putResultDuration = performance.now() - putResultStartTime

      logger.info('Complete report package saved successfully (PUT /result)', {
        reportId,
        hasSessionData: !!assets.sessionData,
        hasValuationResult: !!assets.valuationResult,
        hasHtmlReport: !!assets.htmlReport,
        duration_ms: putResultDuration.toFixed(2),
        reportReady: saveResponse.reportReady ?? null,
        hasAuthoritativeSession: !!saveResponse.session,
        timestamp: new Date().toISOString(),
      })

      // ✅ NEW: Trigger asset save success callback (for toast notification)
      try {
        const { useSessionStore } = await import('../../store/useSessionStore')
        const state = useSessionStore.getState()
        if (state.onAssetSaveSuccess) {
          state.onAssetSaveSuccess()
        }
      } catch (callbackError) {
        // Don't fail the save if callback fails
        logger.warn('[ReportService] Failed to trigger asset save success callback', {
          reportId,
          error: callbackError instanceof Error ? callbackError.message : String(callbackError),
        })
      }

      // ✅ CRITICAL: Update cache with fresh data (Cursor/ChatGPT pattern)
      // This ensures page refresh loads complete valuation instantly
      try {
        const { sessionService } = await import('../session/SessionService')
        const { globalSessionCache } = await import('../../utils/sessionCacheManager')
        const { useSessionStore } = await import('../../store/useSessionStore')
        const authoritativeSession = saveResponse.session

        logger.info('[ReportService] Starting cache update after report save', {
          reportId,
          hasHtmlReport: !!assets.htmlReport,
          hasAuthoritativeSession: !!authoritativeSession,
          reportReady: saveResponse.reportReady ?? authoritativeSession?.reportReady ?? null,
        })

        // Resilience: never invalidate the cache *before* we have a replacement
        // in hand. The save succeeded — the page is on a valid reportId that
        // shouldn't briefly look stateless.
        //
        // History: Titan used to occasionally return PUT /result with `session`
        // omitted (e.g. the rpt_<uuid> session-key UUID-cast regression in
        // SessionService.findOne). When we cleared the cache unconditionally
        // here and the follow-up loadSession also degraded, the page lost all
        // session state and the bootstrap fallback minted a fresh
        // `val_<timestamp>_v<rand>` reportId. The browser then polled
        // `/reports/by-session/<new-val-id>` forever and the skeleton never
        // resolved.
        if (authoritativeSession) {
          globalSessionCache.set(reportId, authoritativeSession)
          useSessionStore.getState().hydrateSession(authoritativeSession)
        }

        const needsImmediateReload =
          !authoritativeSession ||
          authoritativeSession.reportReady === false ||
          saveResponse.reportReady === false

        if (!needsImmediateReload) {
          sessionService.revalidateSessionInBackground(reportId)
          logger.info('[ReportService] Cache updated from authoritative PUT /result response', {
            reportId,
            hasValuationResult: !!authoritativeSession.valuationResult,
            hasHtmlReport: !!authoritativeSession.htmlReport,
            hasSessionData: !!authoritativeSession.sessionData,
          })
        } else {
          const reloadStartTime = performance.now()
          // loadSession is cache-first; force a fresh fetch by removing the
          // stale entry first. We restore it below if the reload succeeds,
          // and leave the previous (pre-save) cache intact if the reload
          // fails so the page can keep rendering the same reportId.
          const preSaveCache = globalSessionCache.get(reportId)
          globalSessionCache.remove(reportId)
          let freshSession = await sessionService.loadSession(reportId)

          if (freshSession && freshSession.reportReady === false) {
            logger.warn('[ReportService] Immediate reload still not report-ready, retrying once', {
              reportId,
            })
            freshSession = await sessionService.loadSession(reportId)
          }

          if (freshSession) {
            globalSessionCache.set(reportId, freshSession)
            useSessionStore.getState().hydrateSession(freshSession)
            logger.info('[ReportService] Cache updated from immediate post-save reload', {
              reportId,
              reloadDuration_ms: (performance.now() - reloadStartTime).toFixed(2),
              hasValuationResult: !!freshSession.valuationResult,
              hasHtmlReport: !!freshSession.htmlReport,
              reportReady: freshSession.reportReady ?? null,
            })
          } else {
            // Reload failed — restore the pre-save cache so the page keeps
            // its session state and we don't trigger the bootstrap fallback
            // that mints a fresh `val_<timestamp>_v<rand>` reportId.
            if (preSaveCache) {
              globalSessionCache.set(reportId, preSaveCache)
            }
            logger.error(
              '[ReportService] Failed to reload session after report save — restored pre-save cache',
              { reportId, hadPreSaveCache: !!preSaveCache },
            )
          }
        }
      } catch (cacheError) {
        // Don't fail the entire save operation if cache update fails
        logger.error(
          '[ReportService] Failed to update cache after report save - exception thrown',
          {
            reportId,
            error: getErrorMessage(cacheError),
            stack: cacheError instanceof Error ? cacheError.stack : undefined,
          }
        )
      }
    } catch (error) {
      const duration = performance.now() - startTime

      // Use instanceof checks for specific error handling
      if (error instanceof ValidationError) {
        logger.warn('Failed to save report assets - validation error', {
          error: error.message,
          field: error.field,
          reportId,
          duration_ms: duration.toFixed(2),
        })
        throw error
      } else if (error instanceof NetworkError && error.retryable) {
        logger.warn('Failed to save report assets - network error (retryable)', {
          error: error.message,
          reportId,
          duration_ms: duration.toFixed(2),
        })
        throw error
      } else if (error instanceof NotFoundError) {
        logger.error('Failed to save report assets - resource not found', {
          error: error.message,
          resourceType: error.resourceType,
          resourceId: error.resourceId,
          reportId,
          duration_ms: duration.toFixed(2),
        })
        throw error
      } else {
        logger.error('Failed to save report assets - unknown error', {
          error: getErrorMessage(error),
          reportId,
          duration_ms: duration.toFixed(2),
        })
        throw new ApplicationError(
          `Failed to save report assets: ${getErrorMessage(error)}`,
          'REPORT_SAVE_FAILED',
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
   * Complete report
   *
   * Marks report as complete and tracks credit usage.
   * This is the final step after successful valuation calculation.
   *
   * @param reportId - Report identifier
   * @param sessionId - Session identifier
   * @param valuationResult - Valuation result object
   */
  async completeReport(
    reportId: string,
    sessionId: string,
    valuationResult: ValuationResponse
  ): Promise<void> {
    const startTime = performance.now()

    try {
      logger.info('Completing report', {
        reportId,
        sessionId,
        valuationId: valuationResult.valuation_id,
      })

      // Import ReportAPI dynamically to avoid circular dependencies
      const { ReportAPI } = await import('../api/report')
      const reportAPI = new ReportAPI()

      // NOTE: completeReport method not available in ReportAPI
      // Credit tracking is handled by backend during calculation
      // This call can be removed or implemented if needed

      const duration = performance.now() - startTime

      logger.info('Report completed successfully', {
        reportId,
        duration_ms: duration.toFixed(2),
      })
    } catch (error) {
      const duration = performance.now() - startTime

      // Use instanceof checks for specific error handling
      if (error instanceof ValidationError) {
        logger.warn('Failed to complete report - validation error (non-critical)', {
          error: error.message,
          field: error.field,
          reportId,
          duration_ms: duration.toFixed(2),
        })
      } else if (error instanceof NetworkError) {
        logger.warn('Failed to complete report - network error (non-critical)', {
          error: error.message,
          reportId,
          duration_ms: duration.toFixed(2),
        })
      } else {
        logger.warn('Failed to complete report - unknown error (non-critical)', {
          error: getErrorMessage(error),
          reportId,
          duration_ms: duration.toFixed(2),
        })
      }

      // Don't throw - completing report is not critical for user experience
      // The valuation is already saved, credit tracking can be retried later
      logger.info('Report completion failed but valuation is saved', {
        reportId,
      })
    }
  }

  /**
   * Delete report
   *
   * Permanently deletes a report and all associated data.
   *
   * @param reportId - Report identifier
   */
  async deleteReport(reportId: string): Promise<void> {
    try {
      logger.info('Deleting report', { reportId })
      await backendAPI.deleteReport(reportId)
      logger.info('Report deleted successfully', { reportId })
    } catch (error) {
      logger.error('Failed to delete report', {
        reportId,
        error: getErrorMessage(error),
      })
      throw error
    }
  }

  /**
   * Get report
   *
   * Retrieves a saved report by ID.
   *
   * @param reportId - Report identifier
   * @returns Valuation response object
   */
  async getReport(reportId: string): Promise<ValuationResponse> {
    const startTime = performance.now()

    try {
      logger.info('Getting report', { reportId })

      const report = await backendAPI.getReport(reportId)

      const duration = performance.now() - startTime

      logger.info('Report retrieved successfully', {
        reportId,
        duration_ms: duration.toFixed(2),
      })

      return report
    } catch (error) {
      const duration = performance.now() - startTime

      // Use instanceof checks for specific error handling
      if (error instanceof NotFoundError) {
        logger.warn('Failed to get report - not found', {
          error: error.message,
          resourceType: error.resourceType,
          resourceId: error.resourceId,
          reportId,
          duration_ms: duration.toFixed(2),
        })
        throw error
      } else if (error instanceof NetworkError && error.retryable) {
        logger.warn('Failed to get report - network error (retryable)', {
          error: error.message,
          reportId,
          duration_ms: duration.toFixed(2),
        })
        throw error
      } else {
        logger.error('Failed to get report - unknown error', {
          error: getErrorMessage(error),
          reportId,
          duration_ms: duration.toFixed(2),
        })
        throw new ApplicationError(
          `Failed to get report: ${getErrorMessage(error)}`,
          'REPORT_GET_FAILED',
          {
            originalError: error,
            reportId,
            duration_ms: duration.toFixed(2),
          }
        )
      }
    }
  }
}

// Export singleton instance
export const reportService = ReportService.getInstance()
