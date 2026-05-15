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

import {
  SESSION_PRE_SELECTED_VALUATION_METHOD_ALT_KEY,
  SESSION_PRE_SELECTED_VALUATION_METHOD_KEY,
  sanitizePreSelectedValuationMethod,
  sessionHasStoredPreSelectedMethod,
} from '../../constants/sessionUiKeys'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useManualResultsStore } from '../../store/manual/useManualResultsStore'
import { useImportQualityStore } from '../../store/useImportQualityStore'
import { useNbbPrefillStore } from '../../store/useNbbPrefillStore'
import {
  recoverPendingNormalizations,
  useNormalizationStore,
} from '../../store/useNormalizationStore'
// import { useConversationalResultsStore } from '../../store/conversational/useConversationalResultsStore'
import { useSessionStore } from '../../store/useSessionStore'
import {
  recoverPendingTaxLatencies,
  useTaxLatencyStore,
} from '../../store/useTaxLatencyStore'
import { useVersionHistoryStore } from '../../store/useVersionHistoryStore'
import {
  type FormSnapshotForRevenueNav,
  parseCurrentYearRevenueForMethodNav,
} from '../../utils/currentYearRevenueForMethodNav'
import {
  hydrateClientValuationResultsMap,
  resolveSelectedValuationMethodForExtraction,
} from '../../utils/extractValuationResultsMap'
import {
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from '../../utils/fiscalYear'
import { buildNormalizationItemsFromImportedLedgerAnalysis } from '../../utils/importedLedgerNormalization'
import { buildTaxLatencyCandidatesFromImportedLedgerAnalysis } from '../../utils/importedLedgerTaxLatencies'
import { generalLogger } from '../../utils/logger'
import {
  buildOptionalSessionGapFillPatch,
  mergeSessionSurfaceForOptionalPrefill,
} from '../../utils/mergeOptionalSessionPrefillFields'
import {
  clearMercurySessionPrefillSuppression,
  markMercurySessionPrefillSuppressed,
} from '../../utils/prefillRestorationGate'
import { getFirstRenderableReportHtml } from '../../utils/safetyNetReportHtml'
import {
  type NormalizedSessionData,
  normalizeSessionData,
  validateNormalizedData,
} from './SessionNormalizer'

/**
 * Bank-grade retry utility with exponential backoff
 * Used for resilient asset fetching during restoration
 *
 * @param fn - Async function to retry
 * @param options - Retry configuration
 * @returns Result of the function or throws after max attempts
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelay?: number; name?: string } = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelay = 500, name = 'operation' } = options

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (attempt === maxAttempts) {
        generalLogger.error(`[SessionRestoration] ${name} failed after ${maxAttempts} attempts`, {
          error: errorMessage,
          attempts: maxAttempts,
        })
        throw error
      }

      const delay = baseDelay * Math.pow(2, attempt - 1)
      generalLogger.warn(`[SessionRestoration] ${name} failed, retrying in ${delay}ms`, {
        attempt,
        maxAttempts,
        error: errorMessage,
      })

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw new Error(`${name} failed after ${maxAttempts} attempts`)
}

function seedNbbPrefillFromFormData(
  formData: Record<string, unknown> | null | undefined,
  reportId: string,
  source: 'restore' | 'package'
): void {
  if (!formData) return
  const official = formData.official_financials
  if (!official || typeof official !== 'object' || Array.isArray(official)) return
  const years =
    ((official as { historicalYears?: unknown }).historicalYears as unknown[] | undefined) ??
    ((official as { historical_years?: unknown }).historical_years as unknown[] | undefined)
  if (!Array.isArray(years) || years.length === 0) return
  useNbbPrefillStore.getState().setFromHistoricalYears(years as any)
  generalLogger.info('[SessionRestoration] NBB prefill snapshots hydrated', {
    reportId: reportId.substring(0, 30),
    source,
    yearsCount: years.length,
  })
}

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
  async restore(reportId: string, backendSession: any): Promise<RestorationResult> {
    const startTime = performance.now()

    // Idempotent check: Skip if already restored
    if (this.restoredReportIds.has(reportId)) {
      generalLogger.debug('[SessionRestoration] Skipping - already restored', { reportId })
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
    const restorationPromise = this.executeRestoration(reportId, backendSession, startTime)
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
    backendSession: any,
    startTime: number
  ): Promise<RestorationResult> {
    try {
      // 1. Normalize data
      const normalized = normalizeSessionData(backendSession)

      // 2. Validate
      if (!validateNormalizedData(normalized)) {
        throw new Error('Session data validation failed')
      }

      // 3. Check if this is an existing report with data
      if (!normalized.hasExistingData) {
        generalLogger.debug('[SessionRestoration] New report - no data to restore', { reportId })
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
      const result = await this.hydrateStores(normalized)
      markMercurySessionPrefillSuppressed(reportId)

      // 5. Signal restoration complete so ManualLayout can unblock the UI immediately
      useSessionStore.getState().setRestorationComplete(true)

      // 6. Verify restoration completed successfully
      const verified = this.verifyRestoration(normalized)
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
    data: NormalizedSessionData
  ): Promise<Omit<RestorationResult, 'success' | 'error' | 'audit'>> {
    let restoredFormFields = 0
    let restoredValuationResult = false
    let restoredHtmlReport = false
    let restoredPricingRange = false
    let restoredVersionHistory = false
    let restoredEbitdaNormalizations = false

    // Determine which results store to use based on flow type
    const isConversational = data.flowType === 'conversational'

    // 1. Hydrate form store (for manual flow): normalized snapshot first, then merged envelope gap-fill.
    if (!isConversational) {
      try {
        const { updateFormData } = useManualFormStore.getState()

        if (data.formData && Object.keys(data.formData).length > 0) {
          updateFormData(data.formData as any)
          restoredFormFields = Object.keys(data.formData).length

          generalLogger.info('[SessionRestoration] Form data hydrated', {
            reportId: data.reportId?.substring(0, 30),
            fieldCount: restoredFormFields,
            fields: Object.keys(data.formData),
            kboFields: {
              company_name: !!data.formData.company_name,
              kbo_number: !!data.formData.kbo_number,
              vat_number: !!data.formData.vat_number,
            },
          })
        }

        const gapPatch = buildOptionalSessionGapFillPatch(
          data.sessionDataEnvelope,
          useManualFormStore.getState().formData
        )
        if (Object.keys(gapPatch).length > 0) {
          updateFormData(gapPatch as any)
          restoredFormFields += Object.keys(gapPatch).length
          generalLogger.debug('[SessionRestoration] Optional envelope gap-fill after restore', {
            reportId: data.reportId?.substring(0, 24),
            keys: Object.keys(gapPatch),
          })
        }

        const fdFinal = useManualFormStore.getState().formData as unknown as Record<
          string,
          unknown
        >
        if (Object.keys(fdFinal).length > 0) {
          seedNbbPrefillFromFormData(fdFinal, data.reportId, 'restore')
        }
      } catch (error) {
        generalLogger.error('[SessionRestoration] Form hydration failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // 1b. Upfront valuation method (draft / pre-calculate only — result payload overrides later).
    // Firm may be unknown (null); revenue from restored form aligns omzet with nav/session rules.
    if (
      !isConversational &&
      !data.valuationResult &&
      data.preSelectedValuationMethod !== undefined
    ) {
      try {
        if (data.preSelectedValuationMethod === null) {
          useManualResultsStore.getState().setPreSelectedMethod(null)
        } else {
          const revFromForm =
            data.formData && typeof data.formData === 'object'
              ? parseCurrentYearRevenueForMethodNav(data.formData as FormSnapshotForRevenueNav)
              : undefined
          const parsed = sanitizePreSelectedValuationMethod(
            data.preSelectedValuationMethod,
            null,
            revFromForm
          )
          if (parsed !== null) {
            useManualResultsStore.getState().setPreSelectedMethod(parsed)
          } else {
            useManualResultsStore.getState().setPreSelectedMethod(null)
          }
        }
        generalLogger.debug('[SessionRestoration] Pre-selected valuation method hydrated', {
          reportId: data.reportId?.substring(0, 30),
          raw: data.preSelectedValuationMethod,
        })
      } catch (error) {
        generalLogger.warn('[SessionRestoration] Pre-selected method hydration failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // 1c. Restore blended / single upfront method selection (Waarderingssynthese + single pin).
    // Applied both for drafts and completed valuations so recalculation preserves
    // the accountant's configured method mix and weighting.
    if (!isConversational) {
      const store = useManualResultsStore.getState()
      if (data.preSelectedMethods && data.preSelectedMethods.length > 0) {
        store.setPreSelectedMethods(data.preSelectedMethods)
      }
      if (data.userWeights && Object.keys(data.userWeights).length > 0) {
        store.setUserWeights(data.userWeights)
      }
      if (data.userWeightJustification) {
        store.setUserWeightJustification(data.userWeightJustification)
      }
    }

    // 2. Hydrate results store
    // CRITICAL: Restore valuation result AND output assets (htmlReport)
    // Sessions may have: (a) full result, (b) output-only, or (c) input-only
    const hasOutputAssets = !!getFirstRenderableReportHtml(
      data.htmlReport,
      (data.valuationResult as { html_report?: string } | null | undefined)?.html_report,
      (data.valuationResult as { details?: { html_report?: string } } | null | undefined)?.details
        ?.html_report
    )
    const hasResult = !!data.valuationResult

    if (hasResult || hasOutputAssets) {
      try {
        const existingResult = useManualResultsStore.getState().result as Record<string, any> | null
        const vr = data.valuationResult as Record<string, any> | null | undefined
        const mergeHydrateOpts = {
          selectedValuationMethodOverride:
            resolveSelectedValuationMethodForExtraction(vr) ??
            resolveSelectedValuationMethodForExtraction(existingResult) ??
            vr?.selected_valuation_method ??
            existingResult?.selected_valuation_method,
        }
        const normalizedValuationResults =
          hydrateClientValuationResultsMap(vr, mergeHydrateOpts) ??
          hydrateClientValuationResultsMap(existingResult, mergeHydrateOpts)
        const renderableMergeHtml = getFirstRenderableReportHtml(
          data.htmlReport,
          (data.valuationResult as { html_report?: string } | undefined)?.html_report,
          (data.valuationResult as { details?: { html_report?: string } } | undefined)?.details
            ?.html_report
        )
        // Build complete result with HTML reports merged in
        const fullResult = {
          ...(data.valuationResult || {}),
          valuation_id: (data.valuationResult as any)?.valuation_id || data.reportId,
          html_report: renderableMergeHtml,
          valuation_results: normalizedValuationResults ?? undefined,
          ...(data.pricingRange && {
            equity_value_low: data.pricingRange.min,
            equity_value_mid: data.pricingRange.mid,
            equity_value_high: data.pricingRange.max,
            currency: data.pricingRange.currency,
          }),
        }

        if (isConversational) {
          // CONVERSATIONAL STORE REMOVED: Conversational flow no longer supported
          generalLogger.debug(
            '[SessionRestoration] Skipping conversational results hydration - stores removed',
            {
              reportId: data.reportId,
            }
          )
        } else {
          const manualStore = useManualResultsStore.getState()
          manualStore.setResult(fullResult as any)
          // Explicitly set HTML assets so components reading htmlReport directly get them
          const renderableHtmlReport = getFirstRenderableReportHtml(
            fullResult.html_report,
            data.htmlReport
          )
          if (renderableHtmlReport) manualStore.setHtmlReport(renderableHtmlReport)
        }

        restoredValuationResult = !!data.valuationResult
        restoredHtmlReport = !!getFirstRenderableReportHtml(fullResult.html_report, data.htmlReport)
        restoredPricingRange = !!data.pricingRange

        generalLogger.debug('[SessionRestoration] Results hydrated', {
          reportId: data.reportId,
          hasValuationResult: restoredValuationResult,
          hasHtmlReport: restoredHtmlReport,
          hasPricingRange: restoredPricingRange,
        })
      } catch (error) {
        generalLogger.error('[SessionRestoration] Results hydration failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // 3. Version history - LAZY LOADED
    // PERFORMANCE OPTIMIZATION: Version history is now lazy-loaded when user opens the tab
    // This saves 500ms-2s on initial page load
    // See: useVersionHistoryStore.fetchVersions() is called by VersionHistoryTab on mount
    generalLogger.debug('[SessionRestoration] Skipping version history (lazy loaded on tab open)', {
      reportId: data.reportId,
    })
    restoredVersionHistory = false // Will be loaded on demand

    // 4. Normalizations — hydrate unified store
    // Priority: localStorage recovery > session JSONB > Titan API
    try {
      const { useNormalizationStore, recoverPendingNormalizations } = await import(
        '../../store/useNormalizationStore'
      )
      const normStore = useNormalizationStore.getState()

      // First: check for items buffered to localStorage during a previous beforeunload
      const recovered = recoverPendingNormalizations(data.reportId)
      if (recovered && recovered.length > 0) {
        normStore.setItems(recovered)
        restoredEbitdaNormalizations = true
        generalLogger.info('[SessionRestoration] Normalizations recovered from localStorage', {
          count: recovered.length,
        })
      } else {
        // Check if normalizations are embedded in form metadata (session JSONB _normalizations)
        const rawMeta = (data.formData as any)?._normalizations
        if (rawMeta && Array.isArray(rawMeta) && rawMeta.length > 0) {
          normStore.setItems(rawMeta)
          restoredEbitdaNormalizations = true
          generalLogger.info('[SessionRestoration] Normalizations hydrated from session metadata', {
            count: rawMeta.length,
          })
        } else {
          // Fallback: load from Titan API
          await normStore.loadFromTitan(data.reportId)
          restoredEbitdaNormalizations = normStore.items.length > 0
          generalLogger.info('[SessionRestoration] Normalizations loaded from Titan API', {
            count: normStore.items.length,
          })
        }
      }
    } catch (error) {
      generalLogger.warn('[SessionRestoration] Normalization hydration failed (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
      })
      restoredEbitdaNormalizations = false
    }

    // 5. Tax Latencies — hydrate store from session JSONB or localStorage
    try {
      const { useTaxLatencyStore, recoverPendingTaxLatencies } = await import(
        '../../store/useTaxLatencyStore'
      )
      const taxLatStore = useTaxLatencyStore.getState()

      const recoveredTL = recoverPendingTaxLatencies(data.reportId)
      if (recoveredTL && recoveredTL.length > 0) {
        taxLatStore.setItems(recoveredTL)
        generalLogger.info('[SessionRestoration] Tax latencies recovered from localStorage', {
          count: recoveredTL.length,
        })
      } else {
        const fd = (data.formData as any) ?? {}
        const rawTL = fd._taxLatencies ?? fd.tax_latencies ?? fd.taxLatencies
        if (rawTL !== undefined && Array.isArray(rawTL)) {
          taxLatStore.setItems(rawTL)
          generalLogger.info('[SessionRestoration] Tax latencies hydrated from session metadata', {
            count: rawTL.length,
          })
        }
      }
    } catch (error) {
      generalLogger.warn('[SessionRestoration] Tax latency hydration failed (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    // 6. Import quality + provider (metadata for import UX; no separate spotlight mode)
    try {
      const fd = (data.formData as any) ?? {}
      const rawIQ = fd._import_quality ?? fd.import_quality ?? fd.importQuality
      if (rawIQ && typeof rawIQ === 'object' && Object.keys(rawIQ).length > 0) {
        const provenanceProvider = (fd.business_context ?? fd.businessContext)
          ?._imported_ledger_provenance?.provider
        useImportQualityStore.getState().setImportQuality(rawIQ, {
          provider: typeof provenanceProvider === 'string' ? provenanceProvider : null,
        })
        generalLogger.info('[SessionRestoration] Import quality hydrated', {
          years: Object.keys(rawIQ).length,
        })
      }
    } catch (error) {
      generalLogger.warn('[SessionRestoration] Import quality hydration failed (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    // 7. Imported ledger analysis — seed review prompts from persisted import analysis
    try {
      const normStore = useNormalizationStore.getState()
      useTaxLatencyStore.getState().setCandidates([])
      const bc = (data.formData as any)?.business_context
      const analysis =
        bc?._imported_ledger_analysis ?? (data.formData as any)?._imported_ledger_analysis
      if (analysis && typeof analysis === 'object') {
        if (normStore.items.length === 0) {
          const items = buildNormalizationItemsFromImportedLedgerAnalysis(analysis)
          if (items.length > 0) {
            normStore.addItems(items)
            restoredEbitdaNormalizations = true
            generalLogger.info(
              '[SessionRestoration] SDE drafts seeded from persisted imported ledger analysis',
              { count: items.length }
            )
          }
        }
        const taxLatencyCandidates = buildTaxLatencyCandidatesFromImportedLedgerAnalysis(
          analysis as any
        )
        useTaxLatencyStore.getState().setCandidates(taxLatencyCandidates)
      }
    } catch (error) {
      generalLogger.warn(
        '[SessionRestoration] Imported ledger normalization seed failed (non-blocking)',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      )
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
   * Verify that restoration completed successfully
   *
   * Bank-grade verification that checks all expected assets are present
   * in their respective stores based on what was in the normalized data.
   * Creates complete audit trail for debugging and compliance.
   */
  private verifyRestoration(data: NormalizedSessionData): boolean {
    const isConversational = data.flowType === 'conversational'
    const warnings: string[] = []
    let allVerified = true

    const mergedEnvelope = mergeSessionSurfaceForOptionalPrefill(data.sessionDataEnvelope)
    const hasEnvelopeIdentity = !!(
      (typeof mergedEnvelope.company_name === 'string' &&
        mergedEnvelope.company_name.trim() !== '') ||
      mergedEnvelope.kbo_number ||
      mergedEnvelope.kboNumber ||
      mergedEnvelope.vat_number ||
      mergedEnvelope.vatNumber
    )

    // Build manifest of what should be restored
    // PERFORMANCE: Version history and EBITDA normalizations are now lazy-loaded
    const manifest: RestorationManifest = {
      formData:
        !isConversational &&
        ((!!data.formData && Object.keys(data.formData).length > 0) || hasEnvelopeIdentity),
      valuationResult: !!data.valuationResult,
      htmlReport: !!data.htmlReport,
      pricingRange: !!data.pricingRange,
      versionHistory: false, // Lazy loaded on tab open
      ebitdaNormalizations: false, // Lazy loaded on demand
    }

    // Verify form data was actually applied (only for manual flow)
    if (manifest.formData && !isConversational) {
      const formStore = useManualFormStore.getState()
      const expectedCompanyName =
        (typeof data.formData.company_name === 'string' && data.formData.company_name.trim()) ||
        (typeof mergedEnvelope.company_name === 'string' ? mergedEnvelope.company_name.trim() : '')
      const actualCompanyName = (formStore.formData as any).company_name
      if (expectedCompanyName && (!actualCompanyName || actualCompanyName.trim() === '')) {
        warnings.push('Form data company_name not restored to store')
        allVerified = false
      }
      const expectedKbo =
        (typeof data.formData.kbo_number === 'string' && data.formData.kbo_number.trim()) ||
        (typeof mergedEnvelope.kbo_number === 'string' && mergedEnvelope.kbo_number.trim()) ||
        (typeof mergedEnvelope.kboNumber === 'string' && mergedEnvelope.kboNumber.trim()) ||
        ''
      const actualKbo = (formStore.formData as any).kbo_number
      if (expectedKbo && (!actualKbo || String(actualKbo).trim() === '')) {
        warnings.push('Form data kbo_number not restored to store')
        allVerified = false
      }
    }

    // Verify valuation result and output assets
    if (manifest.valuationResult || manifest.htmlReport) {
      if (isConversational) {
        generalLogger.debug(
          '[SessionRestoration] Skipping conversational results verification - stores removed',
          {
            reportId: data.reportId,
          }
        )
      } else {
        const resultsStore = useManualResultsStore.getState()
        const hasResult = !!resultsStore.result
        const hasHtmlReport = !!getFirstRenderableReportHtml(
          resultsStore.result?.html_report,
          resultsStore.htmlReport
        )

        if (manifest.valuationResult && !hasResult) {
          warnings.push('Valuation result missing from store')
          allVerified = false
        }
        if (manifest.htmlReport && !hasHtmlReport) {
          warnings.push('HTML report missing from results store')
          allVerified = false
        }
      }
    }

    // Verify pricing range
    if (manifest.pricingRange) {
      if (isConversational) {
        // CONVERSATIONAL STORE REMOVED: Skip verification for conversational flow
        // The conversational stores have been removed from the codebase
        generalLogger.debug(
          '[SessionRestoration] Skipping conversational pricing range verification - stores removed',
          {
            reportId: data.reportId,
          }
        )
      } else {
        const resultsStore = useManualResultsStore.getState()

        const resultAny = resultsStore.result as any
        const hasPricingRangeInStore = !!(
          resultAny?.pricing_range ||
          resultAny?.priceRange ||
          (resultAny?.equity_value_low &&
            resultAny?.equity_value_mid &&
            resultAny?.equity_value_high)
        )

        if (!hasPricingRangeInStore) {
          warnings.push('Pricing range missing from results store')
          allVerified = false
        }
      }
    }

    // Version history and EBITDA normalizations are lazy-loaded
    // No verification needed during initial restoration

    // Log complete audit trail
    if (warnings.length > 0) {
      generalLogger.warn('[SessionRestoration] Verification warnings', {
        reportId: data.reportId,
        manifest,
        warnings,
        allVerified,
      })
    } else {
      generalLogger.debug('[SessionRestoration] Verification passed', {
        reportId: data.reportId,
        manifest,
      })
    }

    return allVerified
  }

  /**
   * WORLD-CLASS: Instant hydration from valuationPackage
   *
   * Called during bootstrap to instantly populate stores with pre-fetched data.
   * This bypasses the full restoration flow for existing reports that have
   * complete package data, enabling < 100ms report display.
   *
   * @param reportId - Report ID
   * @param pkg - Valuation package from bootstrap response
   * @param flow - Flow type (manual or conversational)
   */
  hydrateFromPackage(
    reportId: string,
    pkg: {
      htmlReport: string | null
      pricingRange: { min: number; mid: number; max: number; currency: string } | null
      versions: {
        current: number
        total: number
        history?: Array<{
          version: number
          createdAt: Date
          summary: string | null
          createdBy: string | null
        }>
      }
      pdf: { url: string | null; status: 'ready' | 'generating' | 'none' }
      formData?: Record<string, unknown>
    },
    flow: 'manual' | 'conversational' = 'manual'
  ): void {
    const startTime = performance.now()

    generalLogger.info('[SessionRestoration] WORLD-CLASS: Instant hydration from package', {
      reportId: reportId.substring(0, 30),
      hasHtmlReport: !!pkg.htmlReport,
      hasPricing: !!pkg.pricingRange,
      formFieldCount: pkg.formData ? Object.keys(pkg.formData).length : 0,
      versionCount: pkg.versions.total,
      pdfStatus: pkg.pdf.status,
    })

    try {
      // WORLD-CLASS: Hydrate form store first (enables instant form display on refresh)
      if (flow === 'manual' && pkg.formData && Object.keys(pkg.formData).length > 0) {
        try {
          const { updateFormData } = useManualFormStore.getState()
          const raw = mergeSessionSurfaceForOptionalPrefill(pkg.formData)

          // Map camelCase package keys to snake_case form store keys.
          // Single-word keys (revenue, ebitda, city, industry) are the same in
          // both conventions and are passed through via the spread below.
          const camelToSnake: Record<string, string> = {
            companyName: 'company_name',
            kboNumber: 'kbo_number',
            vatNumber: 'vat_number',
            businessTypeId: 'business_type_id',
            businessDescription: 'business_description',
            subIndustry: 'subIndustry',
            employeeCount: 'number_of_employees',
            numberOfEmployees: 'number_of_employees',
            employees: 'employees',
            foundingYear: 'founding_year',
            filingYearConfirmed: 'filing_year_confirmed',
            countryCode: 'country_code',
            postalCode: 'postal_code',
            netIncome: 'net_income',
            historicalYearsData: 'historical_years_data',
            forecastYearsData: 'forecast_years_data',
            currentYearData: 'current_year_data',
            naceCode: 'nace_code',
            naceDescription: 'nace_description',
            canonicalNaceCode: 'canonical_nace_code',
            activityCode: 'activity_code',
            activityLabel: 'activity_label',
            businessContext: 'business_context',
            officialFinancials: 'official_financials',
            officialVarianceAnalysis: 'official_variance_analysis',
            officialVerificationBadge: 'official_verification_badge',
            legalForm: 'legal_form',
          }

          const mapped: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(raw)) {
            if (value === undefined) continue
            const snakeKey = camelToSnake[key] ?? key
            if (snakeKey === '_businessInfo' || snakeKey === 'businessInfo') continue
            if (snakeKey.startsWith('_bootstrap')) continue
            const current = mapped[snakeKey]
            if (
              current !== undefined &&
              current !== null &&
              !(typeof current === 'string' && current.trim() === '') &&
              (value === null || (typeof value === 'string' && value.trim() === ''))
            ) {
              // Keep the richer existing value (e.g. `_businessInfo.company_name`) over blank aliases.
              continue
            }
            mapped[snakeKey] = value
          }

          const mappedCurrentYearData = mapped.current_year_data as
            | { year?: number; revenue?: number; ebitda?: number }
            | undefined
          if (mappedCurrentYearData && typeof mappedCurrentYearData === 'object') {
            mapped.current_year_data = {
              ...mappedCurrentYearData,
              year: normalizeCurrentYearForFiling(
                mappedCurrentYearData.year,
                mapped.filing_year_confirmed
              ),
            }
          }

          if (Array.isArray(mapped.historical_years_data)) {
            mapped.historical_years_data = normalizeHistoricalYearsForFiling(
              mapped.historical_years_data as Array<{
                year: number
                revenue?: number
                ebitda?: number
              }>,
              mapped.filing_year_confirmed
            )
          }

          updateFormData(mapped as any)
          const gapPatch = buildOptionalSessionGapFillPatch(
            pkg.formData ?? {},
            useManualFormStore.getState().formData
          )
          if (Object.keys(gapPatch).length > 0) {
            updateFormData(gapPatch as any)
            generalLogger.debug('[SessionRestoration] Package envelope gap-fill after map', {
              reportId: reportId.substring(0, 30),
              keys: Object.keys(gapPatch),
            })
          }

          seedNbbPrefillFromFormData(
            useManualFormStore.getState().formData as unknown as Record<string, unknown>,
            reportId,
            'package'
          )
          markMercurySessionPrefillSuppressed(reportId)

          // Hydrate tax latencies and normalizations from package (instant restoration on refresh)
          // Priority: localStorage recovery (beforeunload buffer) > package formData.
          // Both branches pass `{ source: 'system' }` so the latency auto-recalc
          // subscription in ManualLayout skips them — at this point that
          // subscription may already be active, and a fresh calc would either
          // race with the page-load valuation fetch or overwrite it.
          try {
            const recoveredTL = recoverPendingTaxLatencies(reportId)
            if (recoveredTL && recoveredTL.length > 0) {
              useTaxLatencyStore.getState().setItems(recoveredTL, { source: 'system' })
            } else if (
              Array.isArray(
                (
                  raw as {
                    _taxLatencies?: unknown
                    tax_latencies?: unknown
                    taxLatencies?: unknown
                  }
                )._taxLatencies ??
                  (raw as { tax_latencies?: unknown }).tax_latencies ??
                  (raw as { taxLatencies?: unknown }).taxLatencies
              )
            ) {
              const rawTaxLatencies =
                (
                  raw as {
                    _taxLatencies?: unknown
                    tax_latencies?: unknown
                    taxLatencies?: unknown
                  }
                )._taxLatencies ??
                (raw as { tax_latencies?: unknown }).tax_latencies ??
                (raw as { taxLatencies?: unknown }).taxLatencies
              useTaxLatencyStore
                .getState()
                .setItems(rawTaxLatencies as any, { source: 'system' })
            }
          } catch {
            // Non-critical
          }
          try {
            const recoveredNorm = recoverPendingNormalizations(reportId)
            if (recoveredNorm && recoveredNorm.length > 0) {
              useNormalizationStore.getState().setItems(recoveredNorm)
            } else if (
              Array.isArray(
                (raw as { _normalizations?: unknown; normalizations?: unknown })._normalizations ??
                  (raw as { normalizations?: unknown }).normalizations
              ) &&
              (
                ((raw as { _normalizations?: unknown[] })._normalizations as
                  | unknown[]
                  | undefined) ??
                ((raw as { normalizations?: unknown[] }).normalizations as unknown[] | undefined) ??
                []
              ).length > 0
            ) {
              const rawNormalizations =
                (raw as { _normalizations?: unknown; normalizations?: unknown })._normalizations ??
                (raw as { normalizations?: unknown }).normalizations
              useNormalizationStore.getState().setItems(rawNormalizations as any)
            }
          } catch {
            // Non-critical
          }
          try {
            const rawImportQuality =
              (
                raw as {
                  _import_quality?: unknown
                  import_quality?: unknown
                  importQuality?: unknown
                }
              )._import_quality ??
              (raw as { import_quality?: unknown }).import_quality ??
              (raw as { importQuality?: unknown }).importQuality
            if (rawImportQuality && typeof rawImportQuality === 'object') {
              const bc = (raw.business_context ?? raw.businessContext) as
                | Record<string, unknown>
                | undefined
              const prov = (bc?._imported_ledger_provenance as { provider?: unknown } | undefined)
                ?.provider
              useImportQualityStore.getState().setImportQuality(rawImportQuality as any, {
                provider: typeof prov === 'string' ? prov : null,
              })
            }
          } catch {
            // Non-critical
          }
          try {
            const ns = useNormalizationStore.getState()
            useTaxLatencyStore.getState().setCandidates([])
            const bc = (raw.business_context ?? raw.businessContext) as
              | Record<string, unknown>
              | undefined
            const analysis =
              bc?._imported_ledger_analysis ??
              (raw as { _imported_ledger_analysis?: unknown })._imported_ledger_analysis
            if (analysis && typeof analysis === 'object') {
              if (ns.items.length === 0) {
                const items = buildNormalizationItemsFromImportedLedgerAnalysis(analysis as any)
                if (items.length > 0) {
                  ns.addItems(items)
                }
              }
              const taxLatencyCandidates = buildTaxLatencyCandidatesFromImportedLedgerAnalysis(
                analysis as any
              )
              useTaxLatencyStore.getState().setCandidates(taxLatencyCandidates)
            }
          } catch {
            // Non-critical
          }

          generalLogger.info('[SessionRestoration] Form data hydrated from package', {
            reportId: reportId.substring(0, 30),
            fieldCount: Object.keys(mapped).length,
          })
        } catch (formError) {
          generalLogger.warn(
            '[SessionRestoration] Form hydration from package failed (non-critical)',
            {
              error: formError instanceof Error ? formError.message : String(formError),
            }
          )
        }
      }

      // WORLD-CLASS: Build complete result for ManualLayout report display
      // Must include html_report so the report useEffect builds the ValuationReportData
      const pricingResult = pkg.pricingRange
        ? {
            equity_value_low: pkg.pricingRange.min,
            equity_value_mid: pkg.pricingRange.mid,
            equity_value_high: pkg.pricingRange.max,
            currency: pkg.pricingRange.currency,
          }
        : {}

      if (flow === 'manual') {
        const manualStore = useManualResultsStore.getState()
        const existingResult = manualStore.result || {}
        const pkgRenderableHtml = getFirstRenderableReportHtml(pkg.htmlReport)
        const fullResult = {
          valuation_id: reportId,
          ...pricingResult,
          html_report: pkgRenderableHtml,
          valuation_results:
            hydrateClientValuationResultsMap(existingResult as Record<string, any> | null) ??
            undefined,
        }
        manualStore.setResult({
          ...existingResult,
          ...fullResult,
        } as any)
        // Explicitly set HTML assets for components that read them directly
        if (pkgRenderableHtml) manualStore.setHtmlReport(pkgRenderableHtml)

        const mergedAfterSet = useManualResultsStore.getState().result as Record<
          string,
          unknown
        > | null
        if (
          mergedAfterSet &&
          !(mergedAfterSet as { selected_valuation_method?: string }).selected_valuation_method &&
          pkg.formData &&
          typeof pkg.formData === 'object'
        ) {
          const rawPkg = pkg.formData as Record<string, unknown>
          if (sessionHasStoredPreSelectedMethod(rawPkg)) {
            const v =
              rawPkg[SESSION_PRE_SELECTED_VALUATION_METHOD_KEY] ??
              rawPkg[SESSION_PRE_SELECTED_VALUATION_METHOD_ALT_KEY]
            if (v === null) {
              useManualResultsStore.getState().setPreSelectedMethod(null)
            } else if (typeof v === 'string') {
              const revFromForm =
                pkg.formData && typeof pkg.formData === 'object'
                  ? parseCurrentYearRevenueForMethodNav(pkg.formData as FormSnapshotForRevenueNav)
                  : undefined
              const parsed = sanitizePreSelectedValuationMethod(v, null, revFromForm)
              useManualResultsStore.getState().setPreSelectedMethod(parsed)
            }
          }
        }
        // Sync session store for instant display (Results component reads session.htmlReport)
        // Include pdfUrl in sessionData so usePdfGeneration shows "ready" on refresh when PDF exists
        try {
          if (typeof window !== 'undefined') {
            const { useSessionStore } = require('../../store/useSessionStore')
            const session = useSessionStore.getState().session
            if (session) {
              useSessionStore.getState().hydrateSession({
                htmlReport: getFirstRenderableReportHtml(pkg.htmlReport) || undefined,
                valuationResult: { ...existingResult, ...fullResult },
                sessionData: {
                  ...(session.sessionData || {}),
                  pdfUrl: pkg.pdf?.url || undefined,
                },
              } as any)
            }
          }
        } catch {
          // Non-critical: session may not be loaded yet
        }
      } else {
        const fullResult = {
          valuation_id: reportId,
          ...pricingResult,
          html_report: getFirstRenderableReportHtml(pkg.htmlReport),
        }
        generalLogger.debug(
          '[SessionRestoration] Skipping conversational hydration - stores removed',
          {
            reportId: reportId.substring(0, 30),
          }
        )
      }

      // WORLD-CLASS: Hydrate version history for instant version tab
      if (pkg.versions.history && pkg.versions.history.length > 0) {
        const versionStore = useVersionHistoryStore.getState()

        // Type-safe partial version stub interface
        // Contains only the fields available from package, full data loaded on-demand
        interface VersionStub {
          id: string
          reportId: string
          versionNumber: number
          versionLabel: string
          createdAt: Date
          createdBy: string | null
          formData: Record<string, unknown>
          valuationResult: null
          htmlReport: null
          changesSummary: { totalChanges: number; sections: never[]; fields: never[] }
          isActive: boolean
          isPinned: boolean
          notes: string | null
        }

        // Create version stubs from package history
        const versions: VersionStub[] = pkg.versions.history.map((v) => ({
          id: `pkg-${reportId}-v${v.version}`,
          reportId,
          versionNumber: v.version,
          versionLabel: `Version ${v.version}`,
          createdAt: new Date(v.createdAt),
          createdBy: v.createdBy,
          // Placeholder data - full details fetched on-demand when version is selected
          formData: {},
          valuationResult: null,
          htmlReport: null,
          changesSummary: { totalChanges: 0, sections: [], fields: [] },
          isActive: v.version === pkg.versions.current,
          isPinned: false,
          notes: v.summary,
        }))

        // Merge with existing versions (package versions take priority)
        const existingVersions = versionStore.versions[reportId] || []
        const mergedVersions: VersionStub[] = [...versions]

        // Add any existing versions not in the package
        existingVersions.forEach((v) => {
          if (!mergedVersions.find((pv) => pv.versionNumber === v.versionNumber)) {
            // Cast existing version to VersionStub for compatibility
            mergedVersions.push(v as unknown as VersionStub)
          }
        })

        // Sort by version number descending
        mergedVersions.sort((a, b) => b.versionNumber - a.versionNumber)

        // Update store - cast to store's expected type
        // The store accepts partial versions for display, full data loaded on-demand
        versionStore.versions[reportId] = mergedVersions as unknown as typeof existingVersions

        generalLogger.debug('[SessionRestoration] Hydrated version history from package', {
          reportId: reportId.substring(0, 30),
          versionCount: versions.length,
          total: pkg.versions.total,
        })
      }

      // Mark as restored to prevent duplicate restoration
      this.restoredReportIds.add(reportId)
      // CRITICAL: Unblock UI - ManualLayout waits for restorationComplete
      useSessionStore.getState().setRestorationComplete(true)

      const durationMs = performance.now() - startTime
      generalLogger.info('[SessionRestoration] WORLD-CLASS: Instant hydration complete', {
        reportId: reportId.substring(0, 30),
        durationMs: Math.round(durationMs),
      })
    } catch (error) {
      generalLogger.error('[SessionRestoration] Package hydration failed', {
        reportId: reportId.substring(0, 30),
        error: error instanceof Error ? error.message : String(error),
      })
      // Don't throw - fall back to normal restoration
    }
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
}

// Export singleton instance
export const SessionRestorationService = SessionRestorationServiceImpl.getInstance()

// Export class for testing
export { SessionRestorationServiceImpl }
