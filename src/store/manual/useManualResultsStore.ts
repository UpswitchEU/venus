/**
 * Manual Flow - Results Store
 *
 * Manages valuation results state for the manual flow.
 * Isolated from conversational flow to prevent race conditions.
 *
 * Key Features:
 * - Atomic functional updates (no race conditions)
 * - trySetCalculating pattern (prevents double submissions)
 * - Calculation state management (isCalculating, error)
 * - Results storage (valuation result, HTML reports)
 *
 * @module store/manual/useManualResultsStore
 */

import { create } from 'zustand'
import type { ValuationResponse } from '../../types/valuation'
import { storeLogger } from '../../utils/logger'

interface ManualResultsStore {
  // Results state
  result: ValuationResponse | null
  htmlReport: string | null
  infoTabHtml: string | null

  // Calculation state
  isCalculating: boolean
  error: string | null

  // Progress tracking (for long calculations)
  calculationProgress: number

  // Actions (all atomic with functional updates)
  setResult: (result: ValuationResponse | null) => void
  setHtmlReport: (html: string) => void
  setInfoTabHtml: (html: string) => void
  setError: (error: string | null) => void
  clearError: () => void
  clearResults: () => void
  setCalculationProgress: (progress: number) => void

  // Atomic check-and-set for calculation state
  // Returns true if state was set, false if already calculating
  // Use this for immediate UI feedback (< 16ms)
  trySetCalculating: () => boolean
  setCalculating: (isCalculating: boolean) => void

  // Async optimized methods (non-blocking, parallel execution)
  calculateInBackground: (request: any) => Promise<ValuationResponse | null>
}

export const useManualResultsStore = create<ManualResultsStore>((set, get) => ({
  // Initial state
  result: null,
  htmlReport: null,
  infoTabHtml: null,
  isCalculating: false,
  error: null,
  calculationProgress: 0,

  // Set result (atomic)
  setResult: (result: ValuationResponse | null) => {
    set((state) => {
      if (result) {
        storeLogger.info('[Manual] Valuation result set', {
          valuationId: result.valuation_id,
          hasHtmlReport: !!result.html_report,
          hasInfoTabHtml: !!result.info_tab_html,
          htmlReportLength: result.html_report?.length || 0,
          infoTabHtmlLength: result.info_tab_html?.length || 0,
        })

        // Warn if html_report is missing
        if (!result.html_report || result.html_report.trim().length === 0) {
          storeLogger.error('[Manual] CRITICAL: html_report missing or empty', {
            valuationId: result.valuation_id,
            resultKeys: Object.keys(result),
          })
        }

        // Warn if info_tab_html is missing
        if (!result.info_tab_html || result.info_tab_html.trim().length === 0) {
          storeLogger.error('[Manual] CRITICAL: info_tab_html missing or empty', {
            valuationId: result.valuation_id,
            resultKeys: Object.keys(result),
          })
        }

        // ✅ OPTIMISTIC: Update session cache immediately for instant refresh UX
        // This ensures page refresh shows the result without waiting for backend save
        try {
          const { useSessionStore } = require('../useSessionStore')
          const session = useSessionStore.getState().session
          if (session) {
            useSessionStore.getState().updateSession({
              valuationResult: result as any,
              htmlReport: result.html_report,
              infoTabHtml: result.info_tab_html,
            })
            storeLogger.debug('[Manual] Session cache updated optimistically', {
              valuationId: result.valuation_id,
            })
          }
        } catch (error) {
          // Don't fail if optimistic update fails
          storeLogger.warn('[Manual] Failed to update session cache optimistically', {
            error: error instanceof Error ? error.message : String(error),
          })
        }

        return {
          ...state,
          result,
          htmlReport: result.html_report || state.htmlReport,
          infoTabHtml: result.info_tab_html || state.infoTabHtml,
        }
      } else {
        storeLogger.debug('[Manual] Valuation result cleared')

        return {
          ...state,
          result: null,
        }
      }
    })
  },

  // Set HTML report separately (atomic)
  setHtmlReport: (html: string) => {
    set((state) => {
      const currentResult = state.result

      if (currentResult) {
        const updatedResult = { ...currentResult, html_report: html }

        storeLogger.info('[Manual] HTML report updated in existing result', {
          htmlLength: html.length,
        })

        return {
          ...state,
          result: updatedResult,
          htmlReport: html,
        }
      } else {
        // Store HTML report even without result object
        storeLogger.info('[Manual] HTML report set without existing result', {
          htmlLength: html.length,
        })

        return {
          ...state,
          htmlReport: html,
        }
      }
    })
  },

  // Set info tab HTML separately (atomic)
  setInfoTabHtml: (html: string) => {
    set((state) => {
      const currentResult = state.result

      if (currentResult) {
        const updatedResult = { ...currentResult, info_tab_html: html }

        storeLogger.info('[Manual] Info tab HTML updated in existing result', {
          htmlLength: html.length,
        })

        return {
          ...state,
          result: updatedResult,
          infoTabHtml: html,
        }
      } else {
        // Store info tab HTML even without result object
        storeLogger.info('[Manual] Info tab HTML set without existing result', {
          htmlLength: html.length,
        })

        return {
          ...state,
          infoTabHtml: html,
        }
      }
    })
  },

  // Set error (atomic)
  setError: (error: string | null) => {
    set((state) => {
      if (error) {
        storeLogger.error('[Manual] Calculation error', {
          error,
        })
      }

      return {
        ...state,
        error,
        isCalculating: false, // Always clear calculating state on error
      }
    })
  },

  // Clear error (atomic)
  clearError: () => {
    set((state) => ({
      ...state,
      error: null,
    }))
  },

  // Clear results (atomic)
  clearResults: () => {
    set((state) => ({
      ...state,
      result: null,
      htmlReport: null,
      infoTabHtml: null,
      error: null,
      calculationProgress: 0,
    }))

    storeLogger.debug('[Manual] Results cleared')
  },

  // Set calculation progress (for UI feedback during long operations)
  setCalculationProgress: (progress: number) => {
    set((state) => ({
      ...state,
      calculationProgress: Math.min(Math.max(progress, 0), 100),
    }))
  },

  // Atomic check-and-set for calculation state
  // Returns true if state was set to calculating, false if already calculating
  // Use this before calling ValuationService.calculateValuation to ensure immediate UI feedback
  // CRITICAL: This provides < 16ms UI response time (instant button disable)
  trySetCalculating: () => {
    let wasSet = false

    set((state) => {
      if (state.isCalculating) {
        storeLogger.debug('[Manual] Already calculating, preventing duplicate submission')
        return state // Already calculating, don't change
      }

      wasSet = true
      storeLogger.info('[Manual] Loading state set to true immediately (< 16ms)')

      return {
        ...state,
        isCalculating: true,
        error: null,
        calculationProgress: 0, // Reset progress for new calculation
      }
    })

    return wasSet
  },

  // Set calculating state (atomic)
  // Use trySetCalculating instead for double-submission prevention
  setCalculating: (isCalculating: boolean) => {
    set((state) => {
      // If trying to set to true but already calculating, don't change state
      if (isCalculating && state.isCalculating) {
        storeLogger.debug('[Manual] Already calculating, skipping duplicate setCalculating(true)')
        return state
      }

      storeLogger.debug('[Manual] Calculating state changed', {
        isCalculating,
      })

      return {
        ...state,
        isCalculating,
      }
    })
  },

  // Async optimized: Calculate with progress tracking
  // Non-blocking, runs in background, immediate UI feedback
  calculateInBackground: async (request: any) => {
    const { trySetCalculating, setResult, setCalculationProgress, setError, setCalculating } = get()

    // Step 1: Immediate UI feedback (< 16ms) via trySetCalculating
    const wasSet = trySetCalculating()
    if (!wasSet) {
      storeLogger.warn('[Manual] Calculation already in progress, skipping')
      return null
    }

    try {
      // Step 2: Background calculation with progress tracking
      storeLogger.info('[Manual] Starting background calculation', {
        companyName: request.company_name,
      })

      const startTime = performance.now()

      // Import ValuationService dynamically
      const { valuationService } = await import('../../services')

      // Calculate with progress callback
      const result = await valuationService.calculateValuation(request, (progress, message) => {
        // Update progress in real-time
        setCalculationProgress(progress)
        storeLogger.debug('[Manual] Calculation progress', { progress, message })
      })

      // Step 3: Atomic state update
      set((state) => ({
        ...state,
        result,
        htmlReport: result.html_report || null,
        infoTabHtml: result.info_tab_html || null,
        isCalculating: false,
        calculationProgress: 100,
        error: null,
      }))

      const duration = performance.now() - startTime

      storeLogger.info('[Manual] Calculation completed successfully (background)', {
        valuationId: result.valuation_id,
        duration_ms: duration.toFixed(2),
        hasHtmlReport: !!result.html_report,
        hasInfoTabHtml: !!result.info_tab_html,
      })

      return result
    } catch (error) {
      // Error handling (non-blocking)
      const errorMessage = error instanceof Error ? error.message : 'Calculation failed'

      set((state) => ({
        ...state,
        isCalculating: false,
        calculationProgress: 0,
        error: errorMessage,
      }))

      storeLogger.error('[Manual] Calculation failed (background)', {
        error: errorMessage,
        companyName: request.company_name,
      })

      throw error
    }
  },
}))
