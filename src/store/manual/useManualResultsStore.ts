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
import { useSessionStore } from '../useSessionStore'
import type { ValuationMethodResult, ValuationResponse } from '../../types/valuation'
import { extractValuationResultsMap } from '../../utils/extractValuationResultsMap'
import {
  equalWeightsFor,
  isStandaloneMethod,
  isCombinableMethod,
  getConflictingMethod,
  sanitizeMethodSelection,
} from '../../constants/methodFieldConfig'
import { storeLogger } from '../../utils/logger'

interface ManualResultsStore {
  // Results state
  result: ValuationResponse | null
  htmlReport: string | null

  // Omni-Calc: selected valuation method
  selectedMethod: string

  // Upfront pre-selection: method chosen before calculation starts.
  // When set, drives adaptive input sections and becomes the default
  // selected_method sent with the calculation request.
  preSelectedMethod: string | null

  // Multi-method selection for blended valuation (Waarderingssynthese).
  // When length > 1, the synthesis step (weighting sliders) is shown.
  // `upswitch_adaptive` is mutually exclusive with all other methods.
  preSelectedMethods: string[]

  // User-configured weights for blended valuation (method_key → 0-100, sum = 100).
  userWeights: Record<string, number>
  userWeightJustification: string

  // Calculation state
  isCalculating: boolean
  error: string | null

  // Progress tracking (for long calculations)
  calculationProgress: number

  // Omni-Calc: derived active valuation from selected method
  getActiveValuation: () => ValuationMethodResult | null

  // The effective method is preSelectedMethod when set, otherwise selectedMethod.
  // Use this to drive UI that needs to react to the user's current intent.
  getEffectiveMethod: () => string

  // Actions (all atomic with functional updates)
  setResult: (result: ValuationResponse | null) => void
  setHtmlReport: (html: string) => void
  setSelectedMethod: (method: string) => void
  setPreSelectedMethod: (method: string | null) => void
  setPreSelectedMethods: (methods: string[]) => void
  togglePreSelectedMethod: (method: string) => void
  setUserWeights: (weights: Record<string, number>) => void
  setUserWeightJustification: (justification: string) => void
  setError: (error: string | null) => void
  clearError: () => void
  clearResults: () => void
  setCalculationProgress: (progress: number) => void

  // Atomic check-and-set for calculation state
  // Returns true if state was set, false if already calculating
  // Use this for immediate UI feedback (< 16ms)
  trySetCalculating: () => boolean
  setCalculating: (isCalculating: boolean) => void

}

export const useManualResultsStore = create<ManualResultsStore>((set, get) => ({
  // Initial state
  result: null,
  htmlReport: null,
  selectedMethod: 'upswitch_adaptive',
  preSelectedMethod: null,
  preSelectedMethods: ['upswitch_adaptive'],
  userWeights: {},
  userWeightJustification: '',
  isCalculating: false,
  error: null,
  calculationProgress: 0,

  getActiveValuation: () => {
    const { result, selectedMethod } = get()
    const valuationResults = result
      ? extractValuationResultsMap(result as Record<string, any>, {
          selectedValuationMethod: result.selected_valuation_method,
        })
      : null
    if (!valuationResults) return null
    return valuationResults[selectedMethod] ?? null
  },

  getEffectiveMethod: () => {
    const { preSelectedMethod, selectedMethod } = get()
    return preSelectedMethod ?? selectedMethod
  },

  setSelectedMethod: (method: string) => {
    set((state) => {
      storeLogger.info('[Manual] Valuation method switched', { method })
      return { ...state, selectedMethod: method, preSelectedMethod: method }
    })
  },

  setPreSelectedMethod: (method: string | null) => {
    set((state) => {
      storeLogger.info('[Manual] Pre-selected method changed', { method })
      const effective = method ?? 'upswitch_adaptive'
      return {
        ...state,
        preSelectedMethod: method,
        selectedMethod: effective,
        preSelectedMethods: [effective],
        userWeights: {},
        userWeightJustification: '',
      }
    })
  },

  setPreSelectedMethods: (methods: string[]) => {
    set((state) => {
      const resolved = sanitizeMethodSelection(methods)
      storeLogger.info('[Manual] Pre-selected methods set', { methods: resolved })
      const primary = resolved[0]
      const weights = resolved.length > 1 ? equalWeightsFor(resolved) : {}
      return {
        ...state,
        preSelectedMethods: resolved,
        preSelectedMethod: primary === 'upswitch_adaptive' ? null : primary,
        selectedMethod: primary,
        userWeights: weights,
      }
    })
  },

  togglePreSelectedMethod: (method: string) => {
    set((state) => {
      const current = state.preSelectedMethods

      let next: string[]

      if (isStandaloneMethod(method)) {
        // Standalone methods (upswitch_adaptive, fiscal_4x, adjusted_nav)
        // always become the sole selection — they cannot be combined.
        next = [method]
      } else if (current.includes(method)) {
        // Toggling OFF a currently-selected combinable method
        next = current.filter((m) => m !== method)
        if (next.length === 0) next = ['upswitch_adaptive']
      } else {
        // Toggling ON a combinable method:
        // 1. Remove any standalone methods from the selection
        let base = current.filter((m) => isCombinableMethod(m))
        // 2. Remove conflicting method (e.g. SDE ↔ EBITDA, omzet ↔ revenue_multiple)
        const conflict = getConflictingMethod(method)
        if (conflict) {
          base = base.filter((m) => m !== conflict)
        }
        next = [...base, method]
      }

      storeLogger.info('[Manual] Method toggled', { method, result: next })
      const primary = next[0]
      const weights = next.length > 1 ? equalWeightsFor(next) : {}
      return {
        ...state,
        preSelectedMethods: next,
        preSelectedMethod: primary === 'upswitch_adaptive' ? null : primary,
        selectedMethod: primary,
        userWeights: weights,
        userWeightJustification: next.length <= 1 ? '' : state.userWeightJustification,
      }
    })
  },

  setUserWeights: (weights: Record<string, number>) => {
    set((state) => ({ ...state, userWeights: weights }))
  },

  setUserWeightJustification: (justification: string) => {
    set((state) => ({ ...state, userWeightJustification: justification }))
  },

  // Set result (atomic)
  setResult: (result: ValuationResponse | null) => {
    set((state) => {
      if (result) {
        const hydratedValuationResults = extractValuationResultsMap(result as Record<string, any>, {
          selectedValuationMethod: result.selected_valuation_method,
        })
        const hydratedMethodFromPayload =
          typeof result.selected_valuation_method === 'string' && result.selected_valuation_method.trim()
            ? result.selected_valuation_method
            : null
        const hydratedSelectedMethod =
          hydratedMethodFromPayload &&
          hydratedValuationResults &&
          hydratedMethodFromPayload in hydratedValuationResults
            ? hydratedMethodFromPayload
            : hydratedValuationResults && state.selectedMethod in hydratedValuationResults
              ? state.selectedMethod
              : hydratedValuationResults && 'upswitch_adaptive' in hydratedValuationResults
                ? 'upswitch_adaptive'
                : hydratedValuationResults
                  ? Object.keys(hydratedValuationResults)[0]
                  : state.selectedMethod

        storeLogger.info('[Manual] Valuation result set', {
          valuationId: result.valuation_id,
          hasHtmlReport: !!result.html_report,
          htmlReportLength: result.html_report?.length || 0,
          selectedMethod: hydratedSelectedMethod,
        })

        // Warn if html_report is missing
        if (!result.html_report || result.html_report.trim().length === 0) {
          storeLogger.error('[Manual] CRITICAL: html_report missing or empty', {
            valuationId: result.valuation_id,
            resultKeys: Object.keys(result),
          })
        }

        // ✅ OPTIMISTIC: Update session cache immediately for instant refresh UX
        // This ensures page refresh shows the result without waiting for backend save
        try {
          if (typeof window !== 'undefined') {
            const session = useSessionStore.getState().session
            if (session) {
              useSessionStore.getState().updateSession({
                valuationResult: result as any,
                htmlReport: result.html_report,
              })
              storeLogger.debug('[Manual] Session cache updated optimistically', {
                valuationId: result.valuation_id,
              })
            }
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
          selectedMethod: hydratedSelectedMethod,
          preSelectedMethod: hydratedSelectedMethod,
          preSelectedMethods:
            state.preSelectedMethods.length > 1
              ? state.preSelectedMethods
              : [hydratedSelectedMethod],
        }
      } else {
        storeLogger.debug('[Manual] Valuation result cleared')

        return {
          ...state,
          result: null,
          htmlReport: null,
          selectedMethod: 'upswitch_adaptive',
          preSelectedMethod: null,
          preSelectedMethods: ['upswitch_adaptive'],
          userWeights: {},
          userWeightJustification: '',
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
      selectedMethod: 'upswitch_adaptive',
      preSelectedMethod: null,
      preSelectedMethods: ['upswitch_adaptive'],
      userWeights: {},
      userWeightJustification: '',
      error: null,
      calculationProgress: 0,
      isCalculating: false,
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
}))
