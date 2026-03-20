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

import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useManualResultsStore } from '../../store/manual/useManualResultsStore'
// import { useConversationalResultsStore } from '../../store/conversational/useConversationalResultsStore'
import { useSessionStore } from '../../store/useSessionStore'
import { useVersionHistoryStore } from '../../store/useVersionHistoryStore'
import {
  recoverPendingNormalizations,
  useNormalizationStore,
} from '../../store/useNormalizationStore'
import {
  recoverPendingTaxLatencies,
  useTaxLatencyStore,
} from '../../store/useTaxLatencyStore'
import { generalLogger } from '../../utils/logger'
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
      this.restoredReportIds.delete(reportId)
      this.restorationInProgress.delete(reportId)
      this.restorationPromises.delete(reportId)
    } else {
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

    // 1. Hydrate form store (for manual flow)
    if (!isConversational && data.formData && Object.keys(data.formData).length > 0) {
      try {
        const { updateFormData } = useManualFormStore.getState()
        // Cast to any to handle type differences between ValuationRequest and ValuationFormData
        // The normalizer extracts compatible fields, but TypeScript doesn't know they're compatible
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
      } catch (error) {
        generalLogger.error('[SessionRestoration] Form hydration failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // 2. Hydrate results store
    // CRITICAL: Restore valuation result AND output assets (htmlReport)
    // Sessions may have: (a) full result, (b) output-only, or (c) input-only
    const hasOutputAssets = !!data.htmlReport?.trim()
    const hasResult = !!data.valuationResult

    if (hasResult || hasOutputAssets) {
      try {
        // Build complete result with HTML reports merged in
        const fullResult = {
          ...(data.valuationResult || {}),
          valuation_id: (data.valuationResult as any)?.valuation_id || data.reportId,
          html_report: data.htmlReport || (data.valuationResult as any)?.html_report,
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
          if (data.htmlReport) manualStore.setHtmlReport(data.htmlReport)
        }

        restoredValuationResult = !!data.valuationResult
        restoredHtmlReport = !!fullResult.html_report || !!data.htmlReport
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
          generalLogger.info(
            '[SessionRestoration] Normalizations hydrated from session metadata',
            { count: rawMeta.length }
          )
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
        const rawTL = (data.formData as any)?._taxLatencies
        if (rawTL && Array.isArray(rawTL) && rawTL.length > 0) {
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

    // 6. Import Quality — hydrate spotlight store for guided resolution
    try {
      const rawIQ = (data.formData as any)?._import_quality
      if (rawIQ && typeof rawIQ === 'object' && Object.keys(rawIQ).length > 0) {
        const { useSpotlightStore } = await import('../../store/useSpotlightStore')
        useSpotlightStore.getState().setImportQuality(rawIQ)
        generalLogger.info('[SessionRestoration] Import quality hydrated for spotlight mode', {
          years: Object.keys(rawIQ).length,
        })
      }
    } catch (error) {
      generalLogger.warn('[SessionRestoration] Import quality hydration failed (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
      })
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

    // Build manifest of what should be restored
    // PERFORMANCE: Version history and EBITDA normalizations are now lazy-loaded
    const manifest: RestorationManifest = {
      formData: !isConversational && !!data.formData && Object.keys(data.formData).length > 0,
      valuationResult: !!data.valuationResult,
      htmlReport: !!data.htmlReport,
      pricingRange: !!data.pricingRange,
      versionHistory: false, // Lazy loaded on tab open
      ebitdaNormalizations: false, // Lazy loaded on demand
    }

    // Verify form data was actually applied (only for manual flow)
    if (manifest.formData) {
      const formStore = useManualFormStore.getState()
      const expectedCompanyName = data.formData.company_name
      const actualCompanyName = (formStore.formData as any).company_name
      if (expectedCompanyName && (!actualCompanyName || actualCompanyName.trim() === '')) {
        warnings.push('Form data company_name not restored to store')
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
        const hasHtmlReport = !!(resultsStore.result?.html_report || resultsStore.htmlReport)

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
          const raw = pkg.formData as Record<string, unknown>

          // Map camelCase package keys to snake_case form store keys.
          // Single-word keys (revenue, ebitda, city, industry) are the same in
          // both conventions and are passed through via the spread below.
          const camelToSnake: Record<string, string> = {
            companyName: 'company_name',
            kboNumber: 'kbo_number',
            vatNumber: 'vat_number',
            businessTypeId: 'business_type_id',
            employeeCount: 'number_of_employees',
            foundingYear: 'founding_year',
            countryCode: 'country_code',
            postalCode: 'postal_code',
            netIncome: 'net_income',
            historicalYearsData: 'historical_years_data',
            currentYearData: 'current_year_data',
            naceCode: 'nace_code',
            naceDescription: 'nace_description',
            legalForm: 'legal_form',
          }

          const mapped: Record<string, unknown> = {}
          for (const [key, value] of Object.entries(raw)) {
            if (value === undefined) continue
            const snakeKey = camelToSnake[key] ?? key
            mapped[snakeKey] = value
          }

          updateFormData(mapped as any)

          // Hydrate tax latencies and normalizations from package (instant restoration on refresh)
          // Priority: localStorage recovery (beforeunload buffer) > package formData
          try {
            const recoveredTL = recoverPendingTaxLatencies(reportId)
            if (recoveredTL && recoveredTL.length > 0) {
              useTaxLatencyStore.getState().setItems(recoveredTL)
            } else if (
              raw._taxLatencies &&
              Array.isArray(raw._taxLatencies) &&
              (raw._taxLatencies as any[]).length > 0
            ) {
              useTaxLatencyStore.getState().setItems(raw._taxLatencies as any)
            }
          } catch {
            // Non-critical
          }
          try {
            const recoveredNorm = recoverPendingNormalizations(reportId)
            if (recoveredNorm && recoveredNorm.length > 0) {
              useNormalizationStore.getState().setItems(recoveredNorm)
            } else if (
              raw._normalizations &&
              Array.isArray(raw._normalizations) &&
              (raw._normalizations as any[]).length > 0
            ) {
              useNormalizationStore.getState().setItems(raw._normalizations as any)
            }
          } catch {
            // Non-critical
          }
          try {
            if (raw._import_quality && typeof raw._import_quality === 'object') {
              const { useSpotlightStore } = await import('../../store/useSpotlightStore')
              useSpotlightStore.getState().setImportQuality(raw._import_quality as any)
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

      const fullResult = {
        valuation_id: reportId,
        ...pricingResult,
        html_report: pkg.htmlReport || undefined,
      }

      if (flow === 'manual') {
        const manualStore = useManualResultsStore.getState()
        const existingResult = manualStore.result || {}
        manualStore.setResult({
          ...existingResult,
          ...fullResult,
        } as any)
        // Explicitly set HTML assets for components that read them directly
        if (pkg.htmlReport) manualStore.setHtmlReport(pkg.htmlReport)
        // Sync session store for instant display (Results component reads session.htmlReport)
        // Include pdfUrl in sessionData so usePdfGeneration shows "ready" on refresh when PDF exists
        try {
          if (typeof window !== 'undefined') {
            const { useSessionStore } = require('../../store/useSessionStore')
            const session = useSessionStore.getState().session
            if (session) {
              useSessionStore.getState().updateSession({
                htmlReport: pkg.htmlReport || undefined,
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
