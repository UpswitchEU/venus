/**
 * Report Asset Service
 *
 * Shared service for serialized report asset persistence across Manual and
 * Conversational flows.
 *
 * Key Features:
 * - Save report assets (valuation results, HTML reports)
 * - Serialize same-report writes so later payloads cannot race earlier writes
 * - Keep session cache coherent after successful asset persistence
 * - Unified error handling
 *
 * Used by:
 * - Manual Flow (after calculation completes)
 * - Conversational Flow (after calculation completes)
 *
 * @module services/report/ReportAssetService
 */

import { ApplicationError, NetworkError, NotFoundError, ValidationError } from '../../types/errors'
import type { ValuationResponse } from '../../types/valuation'
import { getErrorMessage } from '../../utils/errors/errorConverter'
import { createContextLogger } from '../../utils/logger'
import { promoteSavedReportIdentity } from '../../utils/reportIdentityPromotion'

const logger = createContextLogger('ReportAssetService')

// Coordinates saveSession with saveReportAssets so a session reload cannot race
// an in-flight asset write for the same report.
export const pendingReportAssetSaves = new Map<string, Promise<void>>()

type ReportAssets = {
  sessionData?: Record<string, unknown>
  valuationResult?: ValuationResponse
  htmlReport?: string
  name?: string
}

function snapshotValue<T>(value: T): T {
  if (value == null || typeof value !== 'object') {
    return value
  }

  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => snapshotValue(item)) as T
  }

  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = snapshotValue(child)
  }
  return out as T
}

function snapshotReportAssets(assets: ReportAssets): ReportAssets {
  return {
    ...assets,
    sessionData: snapshotValue(assets.sessionData),
    valuationResult: snapshotValue(assets.valuationResult),
  }
}

/**
 * ReportAssetService - Serialized report asset persistence
 *
 * Singleton service for durable report asset writes across all flows.
 */
export class ReportAssetService {
  private static instance: ReportAssetService

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ReportAssetService {
    if (!ReportAssetService.instance) {
      ReportAssetService.instance = new ReportAssetService()
    }
    return ReportAssetService.instance
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
  async saveReportAssets(reportId: string, assets: ReportAssets): Promise<void> {
    const assetsSnapshot = snapshotReportAssets(assets)
    const previousSave = pendingReportAssetSaves.get(reportId)
    if (previousSave) {
      logger.info('[ReportAssetService] Queueing report asset save behind pending save', {
        reportId,
        note: 'Serializing saves for this reportId so later payloads cannot race earlier writes',
      })
    }

    const savePromise = (previousSave ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => this._saveReportAssetsInternal(reportId, assetsSnapshot))
    pendingReportAssetSaves.set(reportId, savePromise)

    try {
      await savePromise
    } finally {
      if (pendingReportAssetSaves.get(reportId) === savePromise) {
        pendingReportAssetSaves.delete(reportId)
      }
    }
  }

  private async _saveReportAssetsInternal(
    reportId: string,
    assets: ReportAssets
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

      // Include accountant-client context so Titan can link the valuation to
      // accountant_customers without every caller remembering this envelope.
      let sessionDataWithContext: Record<string, unknown> = assets.sessionData || {}
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

          logger.debug('[ReportAssetService] Including client context in save payload', {
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
        logger.warn('[ReportAssetService] Failed to get client context for save (non-critical)', {
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
      const identity = promoteSavedReportIdentity({
        previousId: reportId,
        response: saveResponse,
        valuationResult: assets.valuationResult,
      })
      const canonicalReportId = identity.reportId ?? reportId

      logger.info('Complete report package saved successfully (PUT /result)', {
        reportId,
        canonicalReportId,
        sessionKey: identity.sessionKey ?? null,
        engineRunId: identity.engineRunId ?? null,
        hasSessionData: !!assets.sessionData,
        hasValuationResult: !!assets.valuationResult,
        hasHtmlReport: !!assets.htmlReport,
        duration_ms: putResultDuration.toFixed(2),
        reportReady: saveResponse.reportReady ?? null,
        hasAuthoritativeSession: !!saveResponse.session,
        timestamp: new Date().toISOString(),
      })

      // Trigger the optional asset-save callback for toast notification.
      try {
        const { useSessionStore } = await import('../../store/useSessionStore')
        const state = useSessionStore.getState()
        if (state.onAssetSaveSuccess) {
          state.onAssetSaveSuccess()
        }
      } catch (callbackError) {
        // Don't fail the save if callback fails
        logger.warn('[ReportAssetService] Failed to trigger asset save success callback', {
          reportId,
          error: callbackError instanceof Error ? callbackError.message : String(callbackError),
        })
      }

      // Update cache with fresh data so refresh loads the completed valuation immediately.
      try {
        const { sessionService } = await import('../session/SessionService')
        const { globalSessionCache } = await import('../../utils/sessionCacheManager')
        const { useSessionStore } = await import('../../store/useSessionStore')
        const authoritativeSession = saveResponse.session

        logger.info('[ReportAssetService] Starting cache update after report save', {
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
          const canonicalSession = {
            ...authoritativeSession,
            reportId: canonicalReportId,
          }
          globalSessionCache.set(canonicalReportId, canonicalSession)
          if (canonicalReportId !== reportId) {
            globalSessionCache.set(reportId, canonicalSession)
          }
          useSessionStore.getState().hydrateSession(canonicalSession)
        }

        const needsImmediateReload =
          !authoritativeSession ||
          authoritativeSession.reportReady === false ||
          saveResponse.reportReady === false

        if (!needsImmediateReload) {
          sessionService.revalidateSessionInBackground(canonicalReportId)
          logger.info(
            '[ReportAssetService] Cache updated from authoritative PUT /result response',
            {
              reportId,
              hasValuationResult: !!authoritativeSession.valuationResult,
              hasHtmlReport: !!authoritativeSession.htmlReport,
              hasSessionData: !!authoritativeSession.sessionData,
            }
          )
        } else {
          const reloadStartTime = performance.now()
          // loadSession is cache-first; force a fresh fetch by removing the
          // stale entry first. We restore it below if the reload succeeds,
          // and leave the previous (pre-save) cache intact if the reload
          // fails so the page can keep rendering the same reportId.
          const preSaveCache =
            globalSessionCache.get(canonicalReportId) ?? globalSessionCache.get(reportId)
          globalSessionCache.remove(canonicalReportId)
          let freshSession = await sessionService.loadSession(canonicalReportId)

          if (freshSession && freshSession.reportReady === false) {
            logger.warn(
              '[ReportAssetService] Immediate reload still not report-ready, retrying once',
              {
                reportId,
              }
            )
            freshSession = await sessionService.loadSession(canonicalReportId)
          }

          if (freshSession) {
            const canonicalFreshSession = { ...freshSession, reportId: canonicalReportId }
            globalSessionCache.set(canonicalReportId, canonicalFreshSession)
            useSessionStore.getState().hydrateSession(canonicalFreshSession)
            logger.info('[ReportAssetService] Cache updated from immediate post-save reload', {
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
              globalSessionCache.set(canonicalReportId, preSaveCache)
            }
            logger.error(
              '[ReportAssetService] Failed to reload session after report save - restored pre-save cache',
              { reportId, hadPreSaveCache: !!preSaveCache }
            )
          }
        }
      } catch (cacheError) {
        // Don't fail the entire save operation if cache update fails
        logger.error(
          '[ReportAssetService] Failed to update cache after report save - exception thrown',
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
}

// Export singleton instance
export const reportAssetService = ReportAssetService.getInstance()
