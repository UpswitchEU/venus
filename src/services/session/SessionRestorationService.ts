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
import { useConversationalResultsStore } from '../../store/conversational/useConversationalResultsStore'
import { useVersionHistoryStore } from '../../store/useVersionHistoryStore'
import { useEbitdaNormalizationStore } from '../../store/useEbitdaNormalizationStore'
import { generalLogger } from '../../utils/logger'
import {
  normalizeSessionData,
  validateNormalizedData,
  type NormalizedSessionData,
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
      
      await new Promise(resolve => setTimeout(resolve, delay))
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
  infoTabHtml: boolean
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
    infoTabHtml: AssetSource
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
  restoredInfoTabHtml: boolean
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
        restoredInfoTabHtml: false,
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
      restoredInfoTabHtml: false,
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
   * - EBITDA normalizations (useEbitdaNormalizationStore)
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
      return {
        success: true,
        reportId,
        restoredFormFields: 0,
        restoredValuationResult: false,
        restoredHtmlReport: false,
        restoredInfoTabHtml: false,
        restoredPricingRange: false,
        restoredVersionHistory: false,
        restoredEbitdaNormalizations: false,
      }
    }
    
    // Prevent concurrent restoration for same reportId - return existing promise
    const existingPromise = this.restorationPromises.get(reportId)
    if (existingPromise) {
      generalLogger.debug('[SessionRestoration] Returning existing promise - restoration in progress', { reportId })
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
        return {
          success: true,
          reportId,
          restoredFormFields: 0,
          restoredValuationResult: false,
          restoredHtmlReport: false,
          restoredInfoTabHtml: false,
          restoredPricingRange: false,
          restoredVersionHistory: false,
          restoredEbitdaNormalizations: false,
        }
      }
      
      // 4. Hydrate ALL stores atomically
      const result = await this.hydrateStores(normalized)
      
      // 5. Verify restoration completed successfully
      const verified = this.verifyRestoration(normalized)
      if (!verified) {
        generalLogger.warn('[SessionRestoration] Verification found missing assets', {
          reportId,
          result,
        })
      }
      
      // 6. Mark as restored
      this.restoredReportIds.add(reportId)
      
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
      
      return {
        success: false,
        reportId,
        restoredFormFields: 0,
        restoredValuationResult: false,
        restoredHtmlReport: false,
        restoredInfoTabHtml: false,
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
  private async hydrateStores(data: NormalizedSessionData): Promise<Omit<RestorationResult, 'success' | 'error' | 'audit'>> {
    let restoredFormFields = 0
    let restoredValuationResult = false
    let restoredHtmlReport = false
    let restoredInfoTabHtml = false
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
        
        generalLogger.debug('[SessionRestoration] Form data hydrated', {
          reportId: data.reportId,
          fieldCount: restoredFormFields,
          fields: Object.keys(data.formData),
        })
      } catch (error) {
        generalLogger.error('[SessionRestoration] Form hydration failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    
    // 2. Hydrate results store
    if (data.valuationResult) {
      try {
        // Build complete result with HTML reports merged in
        const fullResult = {
          ...data.valuationResult,
          // Ensure HTML reports are in the result object
          html_report: data.htmlReport || data.valuationResult.html_report,
          info_tab_html: data.infoTabHtml || data.valuationResult.info_tab_html,
        }
        
        if (isConversational) {
          const { setResult } = useConversationalResultsStore.getState()
          setResult(fullResult as any)
        } else {
          const { setResult } = useManualResultsStore.getState()
          setResult(fullResult as any)
        }
        
        restoredValuationResult = true
        restoredHtmlReport = !!fullResult.html_report
        restoredInfoTabHtml = !!fullResult.info_tab_html
        restoredPricingRange = !!data.pricingRange
        
        generalLogger.debug('[SessionRestoration] Results hydrated', {
          reportId: data.reportId,
          valuationId: (data.valuationResult as any)?.valuation_id,
          hasHtmlReport: restoredHtmlReport,
          hasInfoTabHtml: restoredInfoTabHtml,
          hasPricingRange: restoredPricingRange,
          htmlReportLength: fullResult.html_report?.length || 0,
          infoTabHtmlLength: fullResult.info_tab_html?.length || 0,
          pricingRange: data.pricingRange,
        })
      } catch (error) {
        generalLogger.error('[SessionRestoration] Results hydration failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    
    // 3. Fetch and hydrate version history
    // This ensures the history tab is populated when viewing an existing report
    try {
      generalLogger.debug('[SessionRestoration] Fetching version history', {
        reportId: data.reportId,
      })
      
      // ✅ BANK-GRADE: Use retry mechanism for resilient version history fetch
      await withRetry(
        () => useVersionHistoryStore.getState().fetchVersions(data.reportId),
        { maxAttempts: 3, baseDelay: 500, name: 'Version history fetch' }
      )
      
      // Check if versions were loaded
      const versions = useVersionHistoryStore.getState().versions[data.reportId]
      restoredVersionHistory = versions && versions.length > 0
      
      generalLogger.debug('[SessionRestoration] Version history hydrated', {
        reportId: data.reportId,
        versionCount: versions?.length || 0,
      })
      
      // ✅ CRITICAL FIX: Fallback to version history for missing HTML reports
      // If we have a valuation result but HTML reports are still missing,
      // try to extract them from the latest version's version_data
      if (data.valuationResult && (!restoredHtmlReport || !restoredInfoTabHtml)) {
        const latestVersion = versions?.[0] as any
        const versionData = latestVersion?.version_data
        
        if (versionData) {
          // Extract HTML reports from version data - check multiple possible locations
          const versionHtmlReport = 
            versionData.htmlReport ||
            versionData.html_report ||
            versionData.outputs?.html_report ||
            versionData.outputs?.htmlReport
          const versionInfoTabHtml = 
            versionData.infoTabHtml ||
            versionData.info_tab_html ||
            versionData.outputs?.info_tab_html ||
            versionData.outputs?.infoTabHtml
          
          if ((versionHtmlReport && !restoredHtmlReport) || (versionInfoTabHtml && !restoredInfoTabHtml)) {
            generalLogger.info('[SessionRestoration] Recovering HTML from version history', {
              reportId: data.reportId,
              versionId: latestVersion?.id,
              hasHtmlInVersion: !!versionHtmlReport,
              hasInfoTabHtmlInVersion: !!versionInfoTabHtml,
            })
            
            // Get the current result from the store and update it
            const resultsStore = isConversational 
              ? useConversationalResultsStore.getState()
              : useManualResultsStore.getState()
            
            const currentResult = resultsStore.result
            if (currentResult) {
              const updatedResult = {
                ...currentResult,
                html_report: currentResult.html_report || versionHtmlReport,
                info_tab_html: currentResult.info_tab_html || versionInfoTabHtml,
              }
              
              if (isConversational) {
                const { setResult } = useConversationalResultsStore.getState()
                setResult(updatedResult as any)
              } else {
                const { setResult } = useManualResultsStore.getState()
                setResult(updatedResult as any)
              }
              
              // Update restoration flags
              if (versionHtmlReport && !restoredHtmlReport) {
                restoredHtmlReport = true
              }
              if (versionInfoTabHtml && !restoredInfoTabHtml) {
                restoredInfoTabHtml = true
              }
              
              generalLogger.info('[SessionRestoration] HTML reports recovered from version history', {
                reportId: data.reportId,
                restoredHtmlReport,
                restoredInfoTabHtml,
              })
            }
          }
        }
      }
    } catch (error) {
      // Non-fatal: version history is optional
      generalLogger.warn('[SessionRestoration] Version history fetch failed (non-fatal)', {
        reportId: data.reportId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    
    // 4. Load EBITDA normalizations if this is an existing report
    // Only load if we have a valuation result (indicates completed valuation)
    if (data.valuationResult) {
      try {
        generalLogger.debug('[SessionRestoration] Loading EBITDA normalizations', {
          reportId: data.reportId,
        })
        
        // ✅ BANK-GRADE: Use retry mechanism for resilient normalization fetch
        await withRetry(
          () => useEbitdaNormalizationStore.getState().loadAllNormalizations(data.reportId),
          { maxAttempts: 3, baseDelay: 500, name: 'EBITDA normalizations fetch' }
        )
        
        // Check if normalizations were loaded
        const normalizations = useEbitdaNormalizationStore.getState().normalizations
        restoredEbitdaNormalizations = Object.keys(normalizations).length > 0
        
        generalLogger.debug('[SessionRestoration] EBITDA normalizations hydrated', {
          reportId: data.reportId,
          yearCount: Object.keys(normalizations).length,
        })
      } catch (error) {
        // Non-fatal: normalizations are optional
        generalLogger.warn('[SessionRestoration] EBITDA normalizations fetch failed (non-fatal)', {
          reportId: data.reportId,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    
    return {
      reportId: data.reportId,
      restoredFormFields,
      restoredValuationResult,
      restoredHtmlReport,
      restoredInfoTabHtml,
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
    const manifest: RestorationManifest = {
      formData: !isConversational && !!data.formData && Object.keys(data.formData).length > 0,
      valuationResult: !!data.valuationResult,
      htmlReport: !!data.htmlReport,
      infoTabHtml: !!data.infoTabHtml,
      pricingRange: !!data.pricingRange,
      versionHistory: true, // Always expect version history fetch
      ebitdaNormalizations: !!data.valuationResult, // Only if we have valuation result
    }
    
    // Verify form data (only for manual flow)
    if (manifest.formData) {
      const formStore = useManualFormStore.getState()
      const formDataKeys = Object.keys(formStore.formData)
      if (formDataKeys.length === 0) {
        warnings.push('Form data missing from store')
        allVerified = false
      }
    }
    
    // Verify valuation result
    if (manifest.valuationResult) {
      const resultsStore = isConversational 
        ? useConversationalResultsStore.getState()
        : useManualResultsStore.getState()
      
      if (!resultsStore.result) {
        warnings.push('Valuation result missing from store')
        allVerified = false
      } else {
        // Verify HTML reports if they were in the data
        if (manifest.htmlReport && !resultsStore.result.html_report) {
          warnings.push('HTML report missing from results store')
          allVerified = false
        }
        
        if (manifest.infoTabHtml && !resultsStore.result.info_tab_html) {
          warnings.push('Info tab HTML missing from results store')
          allVerified = false
        }
      }
    }
    
    // Verify pricing range
    if (manifest.pricingRange) {
      const resultsStore = isConversational 
        ? useConversationalResultsStore.getState()
        : useManualResultsStore.getState()
      
      const resultAny = resultsStore.result as any
      const hasPricingRangeInStore = !!(
        resultAny?.pricing_range || 
        resultAny?.priceRange ||
        (resultAny?.equity_value_low && resultAny?.equity_value_mid && resultAny?.equity_value_high)
      )
      
      if (!hasPricingRangeInStore) {
        warnings.push('Pricing range missing from results store')
        allVerified = false
      }
    }
    
    // Verify version history
    if (manifest.versionHistory) {
      const versions = useVersionHistoryStore.getState().versions[data.reportId]
      if (!versions || versions.length === 0) {
        // Version history is optional - don't fail verification, just warn
        warnings.push('Version history empty (may be new report)')
      }
    }
    
    // Verify EBITDA normalizations
    if (manifest.ebitdaNormalizations) {
      const normalizations = useEbitdaNormalizationStore.getState().normalizations
      if (Object.keys(normalizations).length === 0) {
        // Normalizations are optional - don't fail verification, just warn
        warnings.push('EBITDA normalizations empty (may be new report)')
      }
    }
    
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
}

// Export singleton instance
export const SessionRestorationService = SessionRestorationServiceImpl.getInstance()

// Export class for testing
export { SessionRestorationServiceImpl }
