/**
 * Session Restoration Service
 *
 * World-class centralized restoration service that atomically hydrates
 * all Zustand stores from normalized session data. This is the SINGLE
 * entry point for all session restoration logic.
 *
 * Key Principles:
 * - Single entry point: All restoration goes through restore()
 * - Atomic hydration: All stores updated synchronously
 * - Idempotent: Safe to call multiple times for same reportId
 * - No scattered logic: ManualLayout/ConversationalLayout only render
 * - Complete restoration: Form, Results, Versions, EBITDA Normalizations
 *
 * @module services/session/SessionRestorationService
 */

// import { useConversationalResultsStore } from '../../store/conversational/useConversationalResultsStore'
import { useSessionStore } from '../../store/useSessionStore'
import { generalLogger } from '../../utils/logger'
import {
  clearMercurySessionPrefillSuppression,
  markMercurySessionPrefillSuppressed,
} from '../../utils/prefillRestorationGate'
import { hydrateSessionAuxiliaryArtifacts } from './SessionAuxiliaryArtifactHydrator'
import {
  type NormalizedSessionData,
  normalizeSessionData,
  validateNormalizedData,
} from './SessionNormalizer'
import { hydrateSessionFromPackage, type SessionHydrationPackage } from './SessionPackageHydrator'
import { asRecord } from './SessionRestorationCoercion'
import { verifySessionRestoration } from './SessionRestorationVerification'
import {
  hydrateRestoredFormState,
  hydrateRestoredMethodSelections,
  hydrateRestoredValuationResult,
} from './SessionRestoreStoreHydrator'

/**
 * Restoration manifest - tracks what assets should be restored
 * Bank-grade: Complete asset tracking for audit trail
 */
export interface RestorationManifest {
  formData: boolean
  valuationResult: boolean
  htmlReport: boolean
  pricingRange: boolean
  versionHistory: boolean
  ebitdaNormalizations: boolean
}

/**
 * Asset source tracking for audit trail
 * Tracks where each asset was sourced from during restoration
 */
export type AssetSource = 'session' | 'report' | 'version' | 'derived' | null

/**
 * Restoration audit - complete audit trail for debugging and compliance
 * Bank-grade: Full traceability of what was restored and from where
 */
export interface RestorationAudit {
  reportId: string
  timestamp: Date
  duration_ms: number
  manifest: RestorationManifest
  sources: {
    valuationResult: AssetSource
    htmlReport: AssetSource
    pricingRange: AssetSource
  }
  warnings: string[]
  errors: string[]
}

/**
 * Restoration result
 */
export interface RestorationResult {
  success: boolean
  reportId: string
  restoredFormFields: number
  restoredValuationResult: boolean
  restoredHtmlReport: boolean
  restoredPricingRange: boolean
  restoredVersionHistory: boolean
  restoredEbitdaNormalizations: boolean
  audit?: RestorationAudit
  error?: string
}

interface RestorationOptions {
  shouldContinue?: () => boolean
}

/**
 * Session Restoration Service
 *
 * Singleton service that handles all session restoration logic.
 * Prevents duplicate restoration and ensures atomic store updates.
 */
class SessionRestorationServiceImpl {
  private static instance: SessionRestorationServiceImpl
  private restoredReportIds = new Set<string>()
  private restorationInProgress = new Set<string>()
  private restorationPromises = new Map<string, Promise<RestorationResult>>()

  /**
   * Get singleton instance
   */
  static getInstance(): SessionRestorationServiceImpl {
    if (!SessionRestorationServiceImpl.instance) {
      SessionRestorationServiceImpl.instance = new SessionRestorationServiceImpl()
    }
    return SessionRestorationServiceImpl.instance
  }

  /**
   * Check if a report has already been restored
   *
   * Use this to check if restoration completed successfully for a given reportId.
   * UI components can use this to determine if all assets are ready.
   */
  isRestored(reportId: string): boolean {
    return this.restoredReportIds.has(reportId)
  }

  /**
   * Check if restoration is currently in progress for a report
   *
   * UI components can use this to show loading states during restoration.
   */
  isRestorationInProgress(reportId: string): boolean {
    return this.restorationInProgress.has(reportId)
  }

  /**
   * Check if restoration is complete and ready for UI rendering
   *
   * Returns true if:
   * - Restoration has completed (isRestored = true), OR
   * - Restoration was skipped (new session with no data)
   *
   * Returns false if:
   * - Restoration is in progress
   * - Restoration hasn't started yet
   */
  isRestorationComplete(reportId: string): boolean {
    // If restored, definitely complete
    if (this.restoredReportIds.has(reportId)) {
      return true
    }

    // If in progress, not complete yet
    if (this.restorationInProgress.has(reportId)) {
      return false
    }

    // If not restored and not in progress, either:
    // - New session (never needed restoration)
    // - Restoration hasn't started yet
    // UI should check session store status to differentiate
    return false
  }

  private shouldContinueRestoration(
    reportId: string,
    options: RestorationOptions | undefined,
    phase: string
  ): boolean {
    if (options?.shouldContinue?.() === false) {
      generalLogger.debug('[SessionRestoration] Ignoring stale restoration work', {
        reportId,
        phase,
      })
      return false
    }
    return true
  }

  private skippedRestorationResult(reportId: string): RestorationResult {
    return {
      success: false,
      reportId,
      restoredFormFields: 0,
      restoredValuationResult: false,
      restoredHtmlReport: false,
      restoredPricingRange: false,
      restoredVersionHistory: false,
      restoredEbitdaNormalizations: false,
      error: 'stale restoration',
    }
  }

  /**
   * Wait for restoration to complete for a report
   *
   * Returns immediately if already restored.
   * Waits for in-progress restoration to complete.
   * Throws if called when no restoration is in progress.
   */
  async waitForRestoration(reportId: string): Promise<RestorationResult> {
    // Already restored - return success
    if (this.restoredReportIds.has(reportId)) {
      return {
        success: true,
        reportId,
        restoredFormFields: 0,
        restoredValuationResult: false,
        restoredHtmlReport: false,
        restoredPricingRange: false,
        restoredVersionHistory: false,
        restoredEbitdaNormalizations: false,
      }
    }

    // Wait for in-progress restoration
    const inProgressPromise = this.restorationPromises.get(reportId)
    if (inProgressPromise) {
      return inProgressPromise
    }

    // No restoration in progress - return immediately
    return {
      success: true,
      reportId,
      restoredFormFields: 0,
      restoredValuationResult: false,
      restoredHtmlReport: false,
      restoredPricingRange: false,
      restoredVersionHistory: false,
      restoredEbitdaNormalizations: false,
    }
  }

  /**
   * Clear restoration state (for testing or forced re-restoration)
   */
  clearRestorationState(reportId?: string): void {
    if (reportId) {
      clearMercurySessionPrefillSuppression(reportId)
      this.restoredReportIds.delete(reportId)
      this.restorationInProgress.delete(reportId)
      this.restorationPromises.delete(reportId)
    } else {
      clearMercurySessionPrefillSuppression()
      this.restoredReportIds.clear()
      this.restorationInProgress.clear()
      this.restorationPromises.clear()
    }
  }

  /**
   * Main restoration method
   *
   * Takes raw backend session data, normalizes it, and atomically
   * hydrates all relevant Zustand stores including:
   * - Form data (useManualFormStore)
   * - Valuation results with HTML (useManualResultsStore/useConversationalResultsStore)
   * - Version history (useVersionHistoryStore)
   * - EBITDA normalizations (useNormalizationStore)
   *
   * **Idempotent per reportId:** Once restored, subsequent calls for the same reportId
   * return early without re-hydrating. To force re-hydration (e.g. after recalculation),
   * call `clearRestorationState(reportId)` first, or use `revalidateSessionInBackground()`
   * which bypasses the idempotency guard and hydrates stores directly.
   *
   * @param reportId - The report ID being restored
   * @param backendSession - Raw session data from backend
   * @returns Restoration result with details of what was restored
   */
  async restore(
    reportId: string,
    backendSession: unknown,
    options?: RestorationOptions
  ): Promise<RestorationResult> {
    const startTime = performance.now()

    if (!this.shouldContinueRestoration(reportId, options, 'start')) {
      return this.skippedRestorationResult(reportId)
    }

    // Idempotent check: Skip if already restored
    if (this.restoredReportIds.has(reportId)) {
      generalLogger.debug('[SessionRestoration] Skipping - already restored', { reportId })
      if (!this.shouldContinueRestoration(reportId, options, 'already-restored')) {
        return this.skippedRestorationResult(reportId)
      }
      markMercurySessionPrefillSuppressed(reportId)
      // Re-assert flag in case loadSession reset it between calls
      if (!useSessionStore.getState().restorationComplete) {
        useSessionStore.getState().setRestorationComplete(true)
      }
      return {
        success: true,
        reportId,
        restoredFormFields: 0,
        restoredValuationResult: false,
        restoredHtmlReport: false,
        restoredPricingRange: false,
        restoredVersionHistory: false,
        restoredEbitdaNormalizations: false,
      }
    }

    // Prevent concurrent restoration for same reportId - return existing promise
    const existingPromise = this.restorationPromises.get(reportId)
    if (existingPromise) {
      generalLogger.debug(
        '[SessionRestoration] Returning existing promise - restoration in progress',
        { reportId }
      )
      return existingPromise
    }

    this.restorationInProgress.add(reportId)

    // Create and store the restoration promise so waitForRestoration can use it
    const restorationPromise = this.executeRestoration(reportId, backendSession, startTime, options)
    this.restorationPromises.set(reportId, restorationPromise)

    try {
      return await restorationPromise
    } finally {
      // Clean up promise cache after completion
      this.restorationPromises.delete(reportId)
    }
  }

  /**
   * Execute the actual restoration logic (internal method)
   */
  private async executeRestoration(
    reportId: string,
    backendSession: unknown,
    startTime: number,
    options?: RestorationOptions
  ): Promise<RestorationResult> {
    try {
      // 1. Normalize data
      const normalized = normalizeSessionData(backendSession)

      // 2. Validate
      if (!validateNormalizedData(normalized)) {
        throw new Error('Session data validation failed')
      }

      if (!this.shouldContinueRestoration(reportId, options, 'normalized')) {
        return this.skippedRestorationResult(reportId)
      }

      // 3. Check if this is an existing report with data
      if (!normalized.hasExistingData) {
        generalLogger.debug('[SessionRestoration] New report - no data to restore', { reportId })
        if (!this.shouldContinueRestoration(reportId, options, 'empty-session')) {
          return this.skippedRestorationResult(reportId)
        }
        this.restoredReportIds.add(reportId)
        useSessionStore.getState().setRestorationComplete(true)
        return {
          success: true,
          reportId,
          restoredFormFields: 0,
          restoredValuationResult: false,
          restoredHtmlReport: false,
          restoredPricingRange: false,
          restoredVersionHistory: false,
          restoredEbitdaNormalizations: false,
        }
      }

      // 4. Hydrate ALL stores atomically
      const result = await this.hydrateStores(normalized, options)
      if (!this.shouldContinueRestoration(reportId, options, 'hydrated')) {
        return this.skippedRestorationResult(reportId)
      }
      markMercurySessionPrefillSuppressed(reportId)

      // 5. Signal restoration complete so ManualLayout can unblock the UI immediately
      if (!this.shouldContinueRestoration(reportId, options, 'complete-signal')) {
        return this.skippedRestorationResult(reportId)
      }
      useSessionStore.getState().setRestorationComplete(true)

      // 6. Verify restoration completed successfully
      if (!this.shouldContinueRestoration(reportId, options, 'verify')) {
        return this.skippedRestorationResult(reportId)
      }
      const verified = verifySessionRestoration(normalized)
      if (!verified) {
        generalLogger.warn('[SessionRestoration] Verification found missing assets', {
          reportId,
          result,
        })
      }

      // 7. Mark as restored and clear pending restoration (G2 fix)
      this.restoredReportIds.add(reportId)
      this.clearPendingRestoration(reportId)

      const duration = performance.now() - startTime
      generalLogger.info('[SessionRestoration] Restoration complete', {
        durationMs: Math.round(duration),
        verified,
        ...result, // result already includes reportId
      })

      return {
        success: true,
        ...result,
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      generalLogger.error('[SessionRestoration] Restoration failed', {
        reportId,
        error: errorMessage,
      })

      // Always unblock the UI even when restoration fails
      if (!this.shouldContinueRestoration(reportId, options, 'error')) {
        return this.skippedRestorationResult(reportId)
      }
      useSessionStore.getState().setRestorationComplete(true)

      return {
        success: false,
        reportId,
        restoredFormFields: 0,
        restoredValuationResult: false,
        restoredHtmlReport: false,
        restoredPricingRange: false,
        restoredVersionHistory: false,
        restoredEbitdaNormalizations: false,
        error: errorMessage,
      }
    } finally {
      this.restorationInProgress.delete(reportId)
    }
  }

  /**
   * Hydrate all stores atomically
   *
   * This method updates all relevant Zustand stores to ensure consistent state.
   * Includes: Form data, Results, Version history, EBITDA normalizations
   */
  private async hydrateStores(
    data: NormalizedSessionData,
    options?: RestorationOptions
  ): Promise<Omit<RestorationResult, 'success' | 'error' | 'audit'>> {
    let restoredFormFields = 0
    let restoredValuationResult = false
    let restoredHtmlReport = false
    let restoredPricingRange = false
    let restoredVersionHistory = false
    let restoredEbitdaNormalizations = false

    const currentResult = () => ({
      reportId: data.reportId,
      restoredFormFields,
      restoredValuationResult,
      restoredHtmlReport,
      restoredPricingRange,
      restoredVersionHistory,
      restoredEbitdaNormalizations,
    })

    const formHydration = hydrateRestoredFormState(data, (phase) =>
      this.shouldContinueRestoration(data.reportId, options, phase)
    )
    restoredFormFields = formHydration.restoredFormFields
    if (formHydration.stopped) {
      return currentResult()
    }

    const methodHydration = hydrateRestoredMethodSelections(data, (phase) =>
      this.shouldContinueRestoration(data.reportId, options, phase)
    )
    if (methodHydration.stopped) {
      return currentResult()
    }

    const resultHydration = hydrateRestoredValuationResult(data, (phase) =>
      this.shouldContinueRestoration(data.reportId, options, phase)
    )
    restoredValuationResult = resultHydration.restoredValuationResult
    restoredHtmlReport = resultHydration.restoredHtmlReport
    restoredPricingRange = resultHydration.restoredPricingRange
    if (resultHydration.stopped) {
      return currentResult()
    }

    // 3. Version history - LAZY LOADED
    // PERFORMANCE OPTIMIZATION: Version history is now lazy-loaded when user opens the tab
    // This saves 500ms-2s on initial page load
    // See: useVersionHistoryStore.fetchVersions() is called by VersionHistoryTab on mount
    generalLogger.debug('[SessionRestoration] Skipping version history (lazy loaded on tab open)', {
      reportId: data.reportId,
    })
    restoredVersionHistory = false // Will be loaded on demand

    // 4. Auxiliary artifacts: normalizations, tax latencies, import quality, and
    // persisted imported-ledger prompts. Keep these side effects out of the
    // orchestration singleton so restore/package hydration share one provenance-safe path.
    const auxiliaryResult = await hydrateSessionAuxiliaryArtifacts({
      reportId: data.reportId,
      formData: asRecord(data.formData),
      source: 'restore',
      loadNormalizationsFromTitan: true,
      shouldContinue: (phase) => this.shouldContinueRestoration(data.reportId, options, phase),
    })
    restoredEbitdaNormalizations = auxiliaryResult.restoredEbitdaNormalizations
    if (auxiliaryResult.stopped) {
      return currentResult()
    }

    return {
      reportId: data.reportId,
      restoredFormFields,
      restoredValuationResult,
      restoredHtmlReport,
      restoredPricingRange,
      restoredVersionHistory,
      restoredEbitdaNormalizations,
    }
  }

  /**
   * WORLD-CLASS: Instant hydration from valuationPackage
   *
   * Called during bootstrap to instantly populate stores with pre-fetched data.
   * This bypasses the full restoration flow for existing reports that have
   * complete package data, enabling < 100ms report display.
   */
  hydrateFromPackage(
    reportId: string,
    pkg: SessionHydrationPackage,
    flow: 'manual' | 'conversational' = 'manual'
  ): void {
    hydrateSessionFromPackage({
      reportId,
      pkg,
      flow,
      onRestored: (restoredReportId) => {
        this.restoredReportIds.add(restoredReportId)
      },
    })
  }

  /**
   * Check if a report can skip full restoration (has package data)
   */
  canSkipRestoration(reportId: string): boolean {
    return this.restoredReportIds.has(reportId)
  }

  /**
   * WORLD-CLASS: Mark a report for pending restoration
   *
   * Called when package hydration fails and we need to trigger full restoration.
   * ManualLayout/ConversationalLayout will check this and call restore() if needed.
   */
  private pendingRestorationIds = new Set<string>()

  markForRestoration(reportId: string): void {
    this.pendingRestorationIds.add(reportId)
    generalLogger.info('[SessionRestoration] Marked report for pending restoration', {
      reportId: reportId.substring(0, 30),
    })
  }

  /**
   * Check if a report is pending restoration (hydration failed)
   */
  isPendingRestoration(reportId: string): boolean {
    return this.pendingRestorationIds.has(reportId)
  }

  /**
   * Clear pending restoration flag after successful restore
   */
  clearPendingRestoration(reportId: string): void {
    this.pendingRestorationIds.delete(reportId)
  }

  /**
   * After client-side HTML self-heal, mark restoration complete so session
   * managers stop forcing loadSession on reportReady: false / pending flags.
   */
  acknowledgeHtmlRecoveryComplete(reportId: string): void {
    this.restoredReportIds.add(reportId)
    this.clearPendingRestoration(reportId)
  }
}

// Export singleton instance
export const SessionRestorationService = SessionRestorationServiceImpl.getInstance()

// Export class for testing
export { SessionRestorationServiceImpl }
