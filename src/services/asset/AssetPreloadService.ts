/**
 * Asset Preload Service
 *
 * PERFORMANCE OPTIMIZATION: Loads heavy assets (HTML reports, Info tab) asynchronously
 * AFTER the UI renders with summary data. This enables:
 * - 2-3 second initial page load (summary data only)
 * - Background loading of HTML reports without blocking UI
 * - Progressive enhancement as assets arrive
 *
 * Usage:
 * 1. UI renders with summary data from bootstrap
 * 2. AssetPreloadService.preloadAssets(reportId) called after mount
 * 3. Stores are updated as assets arrive
 * 4. UI re-renders with full content
 *
 * @module services/asset/AssetPreloadService
 */

import { useManualResultsStore } from '../../store/manual/useManualResultsStore'
import { getApiUrl } from '../../utils/getMercuryUrl'
import { generalLogger } from '../../utils/logger'
import { getFirstRenderableReportHtml } from '../../utils/safetyNetReportHtml'

// import { useConversationalResultsStore } from '../../store/conversational/useConversationalResultsStore'

const API_BASE_URL = getApiUrl()

/**
 * Check if assets are already loaded in the store
 * This prevents unnecessary API calls when SessionRestorationService
 * has already hydrated the store with HTML reports
 */
function areAssetsAlreadyLoaded(flowType: 'manual' | 'conversational'): boolean {
  // CONVERSATIONAL STORE REMOVED: Only check manual store
  // The conversational stores have been removed from the codebase
  if (flowType === 'conversational') {
    // Conversational flow no longer supported - return false to skip preload
    generalLogger.debug('[AssetPreload] Conversational flow not supported - skipping preload check')
    return false
  }

  const store = useManualResultsStore.getState()

  const result = store.result as any
  if (!result) return false

  // Check if HTML report is already present
  const hasHtmlReport = !!getFirstRenderableReportHtml(result.html_report, result.htmlReport)

  return hasHtmlReport
}

/**
 * Get client context headers for accountant-client workflows
 * This ensures preload requests have proper authorization for shared sessions
 */
async function getClientContextHeaders(): Promise<Record<string, string>> {
  try {
    // Dynamic import to avoid circular dependencies
    const { useClientContext } = await import('../../stores/clientContext')
    const contextHeaders = useClientContext.getState().getContextHeaders()
    return contextHeaders
  } catch (error) {
    generalLogger.debug('[AssetPreload] Could not get client context headers', {
      error: error instanceof Error ? error.message : String(error),
    })
    return {}
  }
}

/**
 * Asset loading status
 */
export type AssetStatus = 'idle' | 'loading' | 'loaded' | 'error'

/**
 * Preload progress tracking
 */
export interface PreloadProgress {
  htmlReport: AssetStatus
  startTime: number
  completedTime?: number
}

/**
 * Asset Preload Service
 *
 * Singleton service for background asset loading
 */
class AssetPreloadServiceImpl {
  private static instance: AssetPreloadServiceImpl
  private preloadPromises = new Map<string, Promise<void>>()
  private preloadProgress = new Map<string, PreloadProgress>()

  static getInstance(): AssetPreloadServiceImpl {
    if (!AssetPreloadServiceImpl.instance) {
      AssetPreloadServiceImpl.instance = new AssetPreloadServiceImpl()
    }
    return AssetPreloadServiceImpl.instance
  }

  /**
   * Get current preload progress for a report
   */
  getProgress(reportId: string): PreloadProgress | null {
    return this.preloadProgress.get(reportId) || null
  }

  /**
   * Check if assets are currently being preloaded
   */
  isPreloading(reportId: string): boolean {
    return this.preloadPromises.has(reportId)
  }

  /**
   * Preload assets for a report asynchronously
   *
   * This method:
   * 1. Checks if assets are already loaded (skip if so)
   * 2. Fetches the full session data from the API
   * 3. Extracts HTML reports and Info tab content
   * 4. Updates the appropriate results store
   *
   * @param reportId - Session key or report ID
   * @param flowType - 'manual' or 'conversational' to determine which store to update
   */
  async preloadAssets(
    reportId: string,
    flowType: 'manual' | 'conversational' = 'manual'
  ): Promise<void> {
    // OPTIMIZATION: Skip if assets are already loaded by SessionRestorationService
    // This prevents unnecessary API calls and potential race conditions
    if (areAssetsAlreadyLoaded(flowType)) {
      generalLogger.debug('[AssetPreload] Assets already loaded in store, skipping preload', {
        reportId: reportId.substring(0, 30) + '...',
        flowType,
      })
      // Mark progress as already loaded
      this.preloadProgress.set(reportId, {
        htmlReport: 'loaded',
        startTime: performance.now(),
        completedTime: performance.now(),
      })
      return
    }

    // Deduplicate concurrent requests
    const existingPromise = this.preloadPromises.get(reportId)
    if (existingPromise) {
      generalLogger.debug('[AssetPreload] Returning existing preload promise', { reportId })
      return existingPromise
    }

    // Initialize progress tracking
    this.preloadProgress.set(reportId, {
      htmlReport: 'loading',
      startTime: performance.now(),
    })

    const preloadPromise = this.executePreload(reportId, flowType)
    this.preloadPromises.set(reportId, preloadPromise)

    try {
      await preloadPromise
    } finally {
      this.preloadPromises.delete(reportId)
    }
  }

  /**
   * Execute the actual preload logic
   */
  private async executePreload(
    reportId: string,
    flowType: 'manual' | 'conversational'
  ): Promise<void> {
    const startTime = performance.now()

    generalLogger.info('[AssetPreload] Starting background asset preload', {
      reportId: reportId.substring(0, 30) + '...',
      flowType,
    })

    try {
      // Get client context headers for accountant-client workflows
      // This ensures proper authorization for shared sessions
      const clientContextHeaders = await getClientContextHeaders()

      // Fetch full session data from backend
      const response = await fetch(`${API_BASE_URL}/api/v2/valuations/sessions/${reportId}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          ...clientContextHeaders, // Include accountant context if available
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch session assets: ${response.status}`)
      }

      const data = await response.json()
      const session = data.data || data

      // Extract assets from session data
      const sessionData = session.session_data || {}
      const htmlReport =
        getFirstRenderableReportHtml(
          sessionData.htmlReport,
          sessionData.html_report,
          sessionData._htmlReport,
          session.htmlReport
        ) || null
      const valuationResult =
        sessionData.valuationResult ||
        sessionData.valuation_result ||
        session.valuationResult ||
        null

      // Update progress
      const progress = this.preloadProgress.get(reportId)
      if (progress) {
        progress.htmlReport = htmlReport ? 'loaded' : 'idle'
        progress.completedTime = performance.now()
      }

      // Update the appropriate store with loaded assets
      if (valuationResult || htmlReport) {
        const vr = (valuationResult || {}) as Record<string, any>
        const { html_report: _vrTopHtml, details: vrd, ...vrRest } = vr
        const safeTop = getFirstRenderableReportHtml(
          htmlReport,
          _vrTopHtml,
          vrd && typeof vrd === 'object' ? (vrd as { html_report?: string }).html_report : null
        )
        const result: Record<string, any> = {
          ...vrRest,
          html_report: safeTop,
        }
        if (vrd !== undefined) {
          result.details =
            vrd && typeof vrd === 'object'
              ? {
                  ...(vrd as Record<string, unknown>),
                  html_report: getFirstRenderableReportHtml(
                    safeTop,
                    (vrd as { html_report?: string }).html_report
                  ),
                }
              : vrd
        }

        if (flowType === 'conversational') {
          // CONVERSATIONAL STORE REMOVED: Conversational flow no longer supported
          // The conversational stores have been removed from the codebase
          // Skip updating conversational store
          generalLogger.debug(
            '[AssetPreload] Skipping conversational store update - stores removed',
            {
              reportId: reportId.substring(0, 30) + '...',
            }
          )
        } else {
          const { setResult } = useManualResultsStore.getState()
          setResult(result as any)
        }

        generalLogger.info('[AssetPreload] Assets loaded and stores updated', {
          reportId: reportId.substring(0, 30) + '...',
          durationMs: Math.round(performance.now() - startTime),
          hasHtmlReport: !!htmlReport,
          hasValuationResult: !!valuationResult,
          htmlReportSize: htmlReport?.length || 0,
        })
      } else {
        generalLogger.debug('[AssetPreload] No assets found in session', {
          reportId: reportId.substring(0, 30) + '...',
        })
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Update progress with error
      const progress = this.preloadProgress.get(reportId)
      if (progress) {
        progress.htmlReport = 'error'
        progress.completedTime = performance.now()
      }

      generalLogger.error('[AssetPreload] Failed to preload assets', {
        reportId: reportId.substring(0, 30) + '...',
        error: errorMessage,
        durationMs: Math.round(performance.now() - startTime),
      })

      // Don't throw - this is a background operation, failure shouldn't crash the UI
    }
  }

  /**
   * Clear preload state for a report (for cleanup)
   */
  clearPreloadState(reportId: string): void {
    this.preloadPromises.delete(reportId)
    this.preloadProgress.delete(reportId)
  }
}

// Export singleton instance
export const AssetPreloadService = AssetPreloadServiceImpl.getInstance()

// Export class for testing
export { AssetPreloadServiceImpl }
