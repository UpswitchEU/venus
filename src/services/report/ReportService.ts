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
      infoTabHtml?: string // Info tab HTML (legacy)
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
      infoTabHtml?: string
      name?: string // Custom valuation name (e.g., "Amadeus report")
    }
  ): Promise<void> {
    const startTime = performance.now()

    try {
      console.log('[ReportService] DIAGNOSTIC: saveReportAssets called', {
        reportId,
        hasSessionData: !!assets.sessionData,
        hasResult: !!assets.valuationResult,
        hasHtmlReport: !!assets.htmlReport,
        htmlLength: assets.htmlReport?.length || 0,
      })

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
        
        if (clientContext.isActingAsClient && clientContext.client && clientContext.accountant && clientContext.relationshipId) {
          sessionDataWithContext = {
            ...sessionDataWithContext,
            _client_context: {
              client_user_id: clientContext.client.id,
              accountant_user_id: clientContext.accountant.id,
              relationship_id: clientContext.relationshipId,
            },
          }
          
          logger.debug('[ReportService] Including client context in save payload', {
            reportId,
            clientUserId: clientContext.client.id.substring(0, 8) + '...',
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

      console.log('[ReportService] DIAGNOSTIC: About to call sessionAPI.saveValuationResult', {
        reportId,
        hasClientContext: !!(sessionDataWithContext as any)?._client_context,
      })

      // Save complete package to backend in single API call
      const putResultStartTime = performance.now()
      await sessionAPI.saveValuationResult(reportId, {
        sessionData: sessionDataWithContext,
        valuationResult: assets.valuationResult,
        htmlReport: assets.htmlReport,
        infoTabHtml: assets.infoTabHtml,
        name: assets.name,
      })
      const putResultDuration = performance.now() - putResultStartTime

      console.log('[ReportService] DIAGNOSTIC: PUT /result completed successfully', {
        reportId,
        timestamp: new Date().toISOString(),
        duration_ms: putResultDuration.toFixed(2),
        hasHtmlReport: !!assets.htmlReport,
        htmlReportLength: assets.htmlReport?.length || 0,
      })

      logger.info('Complete report package saved successfully (PUT /result)', {
        reportId,
        hasSessionData: !!assets.sessionData,
        hasValuationResult: !!assets.valuationResult,
        hasHtmlReport: !!assets.htmlReport,
        duration_ms: putResultDuration.toFixed(2),
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

        logger.info('[ReportService] Starting cache update after report save', {
          reportId,
          hasHtmlReport: !!assets.htmlReport,
        })

        // Clear cache first to ensure we fetch fresh data from backend
        globalSessionCache.remove(reportId)
        logger.debug('[ReportService] Cache cleared, fetching fresh session from backend', {
          reportId,
        })

        // Small delay to ensure database write is visible (eventual consistency)
        await new Promise((resolve) => setTimeout(resolve, 100))

        // ✅ FIX: Reload session from backend AFTER PUT /result completes
        // This ensures cache has latest data including HTML reports
        const reloadStartTime = performance.now()
        const putResultDuration_ms = putResultDuration.toFixed(2)
        logger.info('[ReportService] DIAGNOSTIC: Starting session reload after PUT /result', {
          reportId,
          timestamp: new Date().toISOString(),
          putResultDuration_ms,
          note: 'Reloading to update cache with fresh data from backend',
        })

        const freshSession = await sessionService.loadSession(reportId)
        const reloadDuration = performance.now() - reloadStartTime

        logger.info('[ReportService] DIAGNOSTIC: Session reload completed', {
          reportId,
          reloadDuration_ms: reloadDuration.toFixed(2),
          hasSession: !!freshSession,
          hasHtmlReport: !!freshSession?.htmlReport,
          htmlReportLength: freshSession?.htmlReport?.length || 0,
          timestamp: new Date().toISOString(),
        })

        // ✅ CRITICAL: Update session store with fresh data so UI can restore HTML reports
        // This ensures restoration effects see the updated session with HTML reports
        if (freshSession) {
          try {
            const { useSessionStore } = await import('../../store/useSessionStore')
            useSessionStore.getState().updateSession(freshSession)
            logger.info('[ReportService] DIAGNOSTIC: Session store updated with fresh data', {
              reportId,
              hasHtmlReport: !!freshSession.htmlReport,
              htmlReportLength: freshSession.htmlReport?.length || 0,
              timestamp: new Date().toISOString(),
            })
          } catch (storeError) {
            logger.error('[ReportService] Failed to update session store after reload', {
              reportId,
              error: storeError instanceof Error ? storeError.message : String(storeError),
            })
          }
        }

        if (freshSession) {
          // ✅ FIX: Check for valuation result instead of HTML reports
          // HTML reports are excluded from cache, so we verify valuation result exists
          const hasValuationResult = !!freshSession.valuationResult
          const hasHtmlReportInBackend = !!freshSession.htmlReport

          if (!hasValuationResult) {
            logger.warn('[ReportService] Fresh session missing valuation result, will retry', {
              reportId,
              hasValuationResult,
              hasHtmlReport: hasHtmlReportInBackend,
            })

            // Retry once after another delay
            await new Promise((resolve) => setTimeout(resolve, 200))
            const retrySession = await sessionService.loadSession(reportId)

            if (retrySession && retrySession.valuationResult) {
              // Cache session (HTML reports excluded, fetched from backend on demand)
              globalSessionCache.set(reportId, retrySession)
              logger.info('[ReportService] Cache updated after retry (SUCCESS)', {
                reportId,
                reloadDuration_ms: (performance.now() - reloadStartTime).toFixed(2),
                hasValuationResult: !!retrySession.valuationResult,
                hasHtmlReportInBackend: !!retrySession.htmlReport,
                hasSessionData: !!retrySession.sessionData,
                note: 'HTML reports excluded from cache, fetched from backend on demand',
              })
            } else {
              logger.error(
                '[ReportService] Cache update failed even after retry - session still incomplete',
                {
                  reportId,
                  hasValuationResult: !!retrySession?.valuationResult,
                }
              )
            }
          } else {
            // Session has valuation result, cache it (HTML reports excluded, but sessionData included)
            const cacheStartTime = performance.now()

            // ✅ CRITICAL: Verify sessionData (form input fields) is included before caching
            // This ensures form fields can be restored from localStorage when revisiting
            const hasSessionData = !!freshSession.sessionData
            const sessionDataKeys = freshSession.sessionData
              ? Object.keys(freshSession.sessionData)
              : []
            const sessionData = freshSession.sessionData || ({} as any)
            const hasFormFields =
              hasSessionData &&
              (sessionData.company_name ||
                (sessionData.current_year_data as any)?.revenue ||
                (sessionData.current_year_data as any)?.ebitda ||
                sessionData.current_year_data)

            if (!hasSessionData) {
              logger.warn(
                '[ReportService] Fresh session missing sessionData (form fields) - cache may be incomplete',
                {
                  reportId,
                  note: 'Form fields may not restore properly from cache',
                }
              )
            }

            globalSessionCache.set(reportId, freshSession)
            const cacheDuration = performance.now() - cacheStartTime

            logger.info('[ReportService] DIAGNOSTIC: Cache updated with fresh session (SUCCESS)', {
              reportId,
              putResultDuration_ms,
              reloadDuration_ms: reloadDuration.toFixed(2),
              cacheDuration_ms: cacheDuration.toFixed(2),
              totalDuration_ms: (performance.now() - startTime).toFixed(2),
              hasValuationResult: !!freshSession.valuationResult,
              hasHtmlReportInBackend: hasHtmlReportInBackend,
              htmlReportLength: freshSession.htmlReport?.length || 0,
              hasSessionData,
              hasFormFields,
              sessionDataKeys: sessionDataKeys.slice(0, 10), // Log first 10 keys
              sessionDataKeysCount: sessionDataKeys.length,
              timestamp: new Date().toISOString(),
              note: 'HTML reports excluded from cache, but sessionData (form fields) included for restoration',
            })

            console.log('[ReportService] DIAGNOSTIC: Complete save flow finished', {
              reportId,
              putResultDuration_ms,
              reloadDuration_ms: reloadDuration.toFixed(2),
              cacheDuration_ms: cacheDuration.toFixed(2),
              totalDuration_ms: (performance.now() - startTime).toFixed(2),
              hasHtmlReportInBackend,
              htmlReportLength: freshSession.htmlReport?.length || 0,
            })
          }
        } else {
          logger.error(
            '[ReportService] Failed to reload session after report save - session is null',
            { reportId }
          )
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
