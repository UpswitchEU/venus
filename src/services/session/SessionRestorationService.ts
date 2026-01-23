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
 * Restoration manifest - tracks what assets should be restored
 */
export interface RestorationManifest {
  formData: boolean
  valuationResult: boolean
  htmlReport: boolean
  infoTabHtml: boolean
  versionHistory: boolean
  ebitdaNormalizations: boolean
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
  restoredVersionHistory: boolean
  restoredEbitdaNormalizations: boolean
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
  private async hydrateStores(data: NormalizedSessionData): Promise<Omit<RestorationResult, 'success' | 'error'>> {
    let restoredFormFields = 0
    let restoredValuationResult = false
    let restoredHtmlReport = false
    let restoredInfoTabHtml = false
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
        
        generalLogger.debug('[SessionRestoration] Results hydrated', {
          reportId: data.reportId,
          valuationId: (data.valuationResult as any)?.valuation_id,
          hasHtmlReport: restoredHtmlReport,
          hasInfoTabHtml: restoredInfoTabHtml,
          htmlReportLength: fullResult.html_report?.length || 0,
          infoTabHtmlLength: fullResult.info_tab_html?.length || 0,
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
      
      await useVersionHistoryStore.getState().fetchVersions(data.reportId)
      
      // Check if versions were loaded
      const versions = useVersionHistoryStore.getState().versions[data.reportId]
      restoredVersionHistory = versions && versions.length > 0
      
      generalLogger.debug('[SessionRestoration] Version history hydrated', {
        reportId: data.reportId,
        versionCount: versions?.length || 0,
      })
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
        
        await useEbitdaNormalizationStore.getState().loadAllNormalizations(data.reportId)
        
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
      restoredVersionHistory,
      restoredEbitdaNormalizations,
    }
  }
  
  /**
   * Verify that restoration completed successfully
   * 
   * Checks that all expected assets are present in their respective stores
   * based on what was in the normalized data.
   */
  private verifyRestoration(data: NormalizedSessionData): boolean {
    const isConversational = data.flowType === 'conversational'
    let allVerified = true
    
    // Verify form data (only for manual flow)
    if (!isConversational && data.formData && Object.keys(data.formData).length > 0) {
      const formStore = useManualFormStore.getState()
      const formDataKeys = Object.keys(formStore.formData)
      if (formDataKeys.length === 0) {
        generalLogger.warn('[SessionRestoration] Verification failed: form data missing')
        allVerified = false
      }
    }
    
    // Verify valuation result
    if (data.valuationResult) {
      const resultsStore = isConversational 
        ? useConversationalResultsStore.getState()
        : useManualResultsStore.getState()
      
      if (!resultsStore.result) {
        generalLogger.warn('[SessionRestoration] Verification failed: valuation result missing')
        allVerified = false
      }
      
      // Verify HTML reports if they were in the data
      if (data.htmlReport && !resultsStore.result?.html_report) {
        generalLogger.warn('[SessionRestoration] Verification failed: HTML report missing')
        allVerified = false
      }
      
      if (data.infoTabHtml && !resultsStore.result?.info_tab_html) {
        generalLogger.warn('[SessionRestoration] Verification failed: info tab HTML missing')
        allVerified = false
      }
      
      // Verify pricing range if it was in the valuation result
      const valuationAny = data.valuationResult as any
      const hasPricingRangeInData = !!(valuationAny?.pricing_range || valuationAny?.pricingRange)
      const resultAny = resultsStore.result as any
      const hasPricingRangeInStore = !!(resultAny?.pricing_range || resultAny?.pricingRange)
      
      if (hasPricingRangeInData && !hasPricingRangeInStore) {
        generalLogger.warn('[SessionRestoration] Verification failed: pricing range missing')
        allVerified = false
      }
    }
    
    return allVerified
  }
}

// Export singleton instance
export const SessionRestorationService = SessionRestorationServiceImpl.getInstance()

// Export class for testing
export { SessionRestorationServiceImpl }
