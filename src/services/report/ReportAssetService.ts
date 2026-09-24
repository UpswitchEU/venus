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

import { recordManualValuationSaved } from '../../features/manual/utils/manualValuationSaveReceipt'
import { getManualResultsSnapshot } from '../../store/manualResultsSnapshot'
import { ApplicationError, NetworkError, NotFoundError, ValidationError } from '../../types/errors'
import type { ValuationResponse } from '../../types/valuation'
import { getErrorMessage } from '../../utils/errors/errorConverter'
import { createContextLogger } from '../../utils/logger'
import { reportAccessScope, watchReportAccessScope } from '../../utils/reportAccessScope'
import {
  getCanonicalReportAlias,
  promoteSavedReportIdentity,
  rememberSavedReportAlias,
  resolveSavedReportIdentity,
} from '../../utils/reportIdentityPromotion'

const logger = createContextLogger('ReportAssetService')

// Coordinates saveSession with saveReportAssets so a session reload cannot race
// an in-flight asset write for the same report.
export const pendingReportAssetSaves = new Map<string, Promise<void>>()

export function reportAssetSaveKey(reportId: string): string {
  return `${reportAccessScope()}:${getCanonicalReportAlias(reportId) ?? reportId}`
}

export function pendingReportAssetSave(reportId: string): Promise<void> | undefined {
  return pendingReportAssetSaves.get(reportAssetSaveKey(reportId))
}

type ReportAssets = {
  sessionData?: Record<string, unknown>
  valuationResult?: ValuationResponse
  htmlReport?: string
  name?: string
}

type FailedAssetSave = { assets: ReportAssets; error: string }
const failedAssetSaves = new Map<string, FailedAssetSave>()
const saveStateListeners = new Set<() => void>()
export function subscribeReportAssetSaveState(listener: () => void): () => void {
  saveStateListeners.add(listener)
  return () => {
    saveStateListeners.delete(listener)
  }
}
export function failedReportAssetSave(reportId: string): FailedAssetSave | undefined {
  return failedAssetSaves.get(reportAssetSaveKey(reportId))
}
function notifySaveState(): void {
  saveStateListeners.forEach((listener) => listener())
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
    const accessScope = reportAccessScope()
    const access = watchReportAccessScope()
    const displayedResult = getManualResultsSnapshot()?.valuationResult
    const canUpdateView = () =>
      access.isCurrent() && getManualResultsSnapshot()?.valuationResult === displayedResult
    const queueKey = reportAssetSaveKey(reportId)
    const previousSave = pendingReportAssetSave(reportId)
    if (previousSave) {
      logger.info('[ReportAssetService] Queueing report asset save behind pending save', {
        reportId,
        note: 'Serializing saves for this reportId so later payloads cannot race earlier writes',
      })
    }

    const savePromise = (previousSave ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => {
        if (!access.isCurrent()) throw new Error('Report save cancelled: client context changed')
        return this._saveReportAssetsInternal(
          reportId,
          assetsSnapshot,
          access.isCurrent,
          canUpdateView
        )
      })
    pendingReportAssetSaves.set(queueKey, savePromise)

    try {
      await savePromise
      failedAssetSaves.delete(queueKey)
      failedAssetSaves.delete(`${accessScope}:${getCanonicalReportAlias(reportId) ?? reportId}`)
      // A durable save of a calculated result is the receipt the return to Mercury
      // reads (`from=valuation`), whichever path saved it: the completion hook, its
      // toast retry, or the error screen's "Try again" (`retryFailedSave`), which
      // used to save without recording it.
      if (assetsSnapshot.valuationResult) recordManualValuationSaved([reportId])
      notifySaveState()
    } catch (error) {
      if (canUpdateView() && pendingReportAssetSaves.get(queueKey) === savePromise) {
        failedAssetSaves.set(queueKey, { assets: assetsSnapshot, error: getErrorMessage(error) })
        notifySaveState()
      }
      throw error
    } finally {
      access.dispose()
      if (pendingReportAssetSaves.get(queueKey) === savePromise) {
        pendingReportAssetSaves.delete(queueKey)
      }
    }
  }

  async retryFailedSave(reportId: string): Promise<void> {
    const pending = pendingReportAssetSave(reportId)
    if (pending) return pending
    const failed = failedReportAssetSave(reportId)
    if (failed) await this.saveReportAssets(reportId, failed.assets)
  }

  private async _saveReportAssetsInternal(
    reportId: string,
    assets: ReportAssets,
    canSave: () => boolean = () => true,
    canUpdateView: () => boolean = () => true
  ): Promise<void> {
    const startTime = performance.now()
    const accessScope = reportAccessScope()

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
      // Dynamic imports yield: re-check immediately before transport so a new
      // client context can never be attached to an old client's queued payload.
      if (!canSave()) throw new Error('Report save cancelled: client context changed')
      const putResultStartTime = performance.now()
      const saveResponse = await sessionAPI.saveValuationResult(reportId, {
        sessionData: sessionDataWithContext,
        valuationResult: assets.valuationResult,
        htmlReport: assets.htmlReport,
        name: assets.name,
      })
      const putResultDuration = performance.now() - putResultStartTime
      const identity = resolveSavedReportIdentity({
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

      const { useSessionStore } = await import('../../store/useSessionStore')
      const isStillTarget = () =>
        canUpdateView() &&
        reportAccessScope() === accessScope &&
        [reportId, canonicalReportId].includes(useSessionStore.getState().session?.reportId ?? '')
      if (!isStillTarget()) return

      const { globalSessionCache } = await import('../../utils/sessionCacheManager')
      const { promoteScopedBootstrapReport } = await import(
        '../../lib/bootstrap/BootstrapProviderCache'
      )
      if (!isStillTarget()) return
      const current = useSessionStore.getState()
      const previousSession = current.session
      if (!previousSession) return
      const authoritative = saveResponse.session
      const savedSession = {
        ...previousSession,
        ...authoritative,
        reportId: canonicalReportId,
        sessionData: { ...authoritative?.sessionData, ...previousSession.sessionData },
        valuationResult:
          authoritative?.valuationResult ??
          assets.valuationResult ??
          previousSession.valuationResult,
        htmlReport: authoritative?.htmlReport || assets.htmlReport || previousSession.htmlReport,
        reportReady: saveResponse.reportReady ?? authoritative?.reportReady ?? false,
      }
      // Expose both confirmed aliases to the same queue before navigation can
      // enqueue another write under the UUID.
      const oldQueueKey = `${accessScope}:${reportId}`
      const canonicalQueueKey = `${accessScope}:${canonicalReportId}`
      const pending = pendingReportAssetSaves.get(oldQueueKey)
      if (pending && oldQueueKey !== canonicalQueueKey) {
        pendingReportAssetSaves.set(canonicalQueueKey, pending)
        void pending
          .finally(() => {
            if (pendingReportAssetSaves.get(canonicalQueueKey) === pending)
              pendingReportAssetSaves.delete(canonicalQueueKey)
          })
          .catch(() => undefined)
      }
      // Commit all render state before navigation is observable. Missing read-back
      // assets never erase the result already returned by the calculation.
      globalSessionCache.set(canonicalReportId, savedSession)
      if (canonicalReportId !== reportId) globalSessionCache.set(reportId, savedSession)
      rememberSavedReportAlias({ previousId: reportId, response: saveResponse })
      useSessionStore.getState().commitSavedReport(reportId, savedSession)
      promoteScopedBootstrapReport(reportId, savedSession)
      promoteSavedReportIdentity({
        previousId: reportId,
        response: saveResponse,
        valuationResult: assets.valuationResult,
      })
      current.onAssetSaveSuccess?.()
      // Recovery is background-only; a committed report does not need another
      // mandatory read on the same database connection that just completed its save.
      if (!savedSession.reportReady) {
        const { sessionService } = await import('../session/SessionService')
        if (isStillTarget()) sessionService.revalidateSessionInBackground(canonicalReportId)
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
