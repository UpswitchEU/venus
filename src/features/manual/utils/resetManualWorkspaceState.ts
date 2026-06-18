import { flushSync } from 'react-dom'
import type { RightPanelView, ValuationReportData } from '../../../components/calculator'
import { resetBootstrapSyncGateForRetry } from '../../../hooks/useBootstrapSync'
import { resetBootstrapGuard } from '../../../lib/bootstrap/BootstrapProvider'
import { bootstrapService } from '../../../lib/bootstrap/SessionBootstrapService'
import { resetSessionEngine } from '../../../services/session/SessionEngineFactory'
import { useManualFormStore, useManualResultsStore } from '../../../store/manual'
import { usePreparerMultipleStore } from '../../../store/manual/usePreparerMultipleStore'
import { useNbbPrefillStore } from '../../../store/useNbbPrefillStore'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import { useTaxLatencyStore } from '../../../store/useTaxLatencyStore'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'

export interface ResetManualWorkspaceStateOptions {
  /** When true, keep form inputs (delete flow keeps left-panel prefill). */
  preserveForm?: boolean
  /** Clears right-panel report UI (e.g. setReport(null)). */
  onClearReportUi?: () => void
  /** Version-history keys to drop (report UUID, val_* session key, etc.). */
  reportIdsToClearVersions?: Array<string | null | undefined>
  /** localStorage session cache keys to drop (defaults to reportIdsToClearVersions). */
  cacheIdsToRemove?: Array<string | null | undefined>
}

/**
 * Resets in-memory manual calculator workspace state.
 * Shared by "New valuation" (full reset) and "Delete current report" (preserve form).
 */
function uniqueIds(ids: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    const trimmed = id?.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

export interface ClearCurrentReportPresentationOptions {
  setReport: (value: ValuationReportData | null) => void
  setShowFullscreenModal: (value: boolean) => void
  setRightPanelView?: (view: RightPanelView) => void
}

/**
 * Synchronously clears right-panel report presentation (before/without waiting on DELETE).
 * Uses flushSync so the iframe updates before slow navigation or bootstrap re-hydration.
 */
export function clearCurrentReportPresentation(
  options: ClearCurrentReportPresentationOptions
): void {
  useManualResultsStore.getState().clearResults()
  useManualResultsStore.getState().setCalculating(false)
  flushSync(() => {
    options.setReport(null)
    options.setShowFullscreenModal(false)
    // Preview tab shows ReportPlaceholder when report is null.
    options.setRightPanelView?.('preview')
  })
}

/**
 * Instant right-panel clear while DELETE is in flight.
 * Keeps session/bootstrap intact so a failed delete can restore without reload.
 */
export function beginOptimisticCurrentReportDelete(
  presentation: ClearCurrentReportPresentationOptions
): void {
  clearCurrentReportPresentation(presentation)
}

/** @deprecated Prefer {@link beginOptimisticCurrentReportDelete} — session teardown runs after successful DELETE. */
export function beginCurrentReportDelete(
  _cacheIds: Array<string | null | undefined>,
  presentation: ClearCurrentReportPresentationOptions
): void {
  beginOptimisticCurrentReportDelete(presentation)
}

/**
 * Tear down in-memory state after a report was deleted on the server (home list, etc.).
 * Keeps the delete guard set so bootstrap cannot briefly resurrect the report on the same URL.
 */
export function tearDownWorkspaceAfterActiveReportDeleted(
  cacheIds: Array<string | null | undefined>
): void {
  clearVenusBootstrapCachesAfterReportDelete()
  resetSessionEngine()
  useManualResultsStore.getState().clearResults()
  useManualResultsStore.getState().setCalculating(false)
  useSessionStore.getState().clearSession()
  void clearManualValuationSessionCaches(cacheIds)
}

/** Module-level bootstrap/sync caches that can resurrect a soft-deleted report on SPA nav. */
export function clearVenusBootstrapCachesAfterReportDelete(): void {
  resetBootstrapGuard()
  bootstrapService.clearCache()
  bootstrapService.clearInflightCache()
  bootstrapService.resetCircuitBreaker()
  resetBootstrapSyncGateForRetry()
}

/** Drop persisted session caches for deleted / replaced valuation ids. */
export async function clearManualValuationSessionCaches(
  ids: Array<string | null | undefined>
): Promise<void> {
  const keys = uniqueIds(ids)
  if (keys.length === 0) return
  try {
    const { globalSessionCache } = await import('../../../utils/sessionCacheManager')
    for (const key of keys) {
      globalSessionCache.remove(key)
    }
  } catch {
    // Non-fatal cache cleanup.
  }
}

export function resetManualWorkspaceState(options: ResetManualWorkspaceStateOptions = {}): void {
  const {
    preserveForm = false,
    onClearReportUi,
    reportIdsToClearVersions = [],
    cacheIdsToRemove,
  } = options

  useSessionStore.getState().clearSession()

  resetSessionEngine()
  clearVenusBootstrapCachesAfterReportDelete()

  if (!preserveForm) {
    useManualFormStore.getState().resetForm()
  }

  useManualResultsStore.getState().clearResults()
  useManualResultsStore.getState().setCalculating(false)
  useNormalizationStore.getState().clear()
  useTaxLatencyStore.getState().clear({ source: 'system' })
  useNbbPrefillStore.getState().clear()
  usePreparerMultipleStore.getState().reset()

  for (const trimmed of uniqueIds(reportIdsToClearVersions)) {
    useVersionHistoryStore.getState().clearVersions(trimmed)
  }

  void clearManualValuationSessionCaches(cacheIdsToRemove ?? reportIdsToClearVersions)

  onClearReportUi?.()
}
