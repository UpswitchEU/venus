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
import {
  equalWeightsFor,
  getConflictingMethod,
  isCombinableMethod,
  isStandaloneMethod,
  resolveSynthesisPercentWeightsForMethods,
  sanitizeMethodSelection,
} from '../../constants/methodFieldConfig'
import type { ValuationMethodResult, ValuationResponse } from '../../types/valuation'
import {
  getValuationMethodResultForKey,
  hydrateClientValuationResultsMap,
  resolveSelectedValuationMethodForExtraction,
} from '../../utils/extractValuationResultsMap'
import { storeLogger } from '../../utils/logger'
import {
  getFirstRenderableReportHtml,
  getRenderableReportHtml,
  getRenderableReportHtmlFromCurrentOrFallback,
} from '../../utils/safetyNetReportHtml'
import { useSessionStore } from '../useSessionStore'

/**
 * When Titan/ValuationIQ returns weighted synthesis, restore multi-method + weights for the
 * left-panel sliders when session had no multi-method row (or it was collapsed).
 */
function hydrateBlendFromWeightedValuation(result: ValuationResponse): {
  methods: string[]
  weights: Record<string, number>
  justification?: string
} | null {
  const wv = result.weighted_valuation
  if (!wv?.contributions || !Array.isArray(wv.contributions) || wv.contributions.length < 2) {
    return null
  }
  const rawWeights: Record<string, number> = {}
  const order: string[] = []
  for (const c of wv.contributions) {
    if (!c || typeof c !== 'object') continue
    const row = c as { method_key?: unknown; weight?: unknown }
    const mk = row.method_key
    if (typeof mk !== 'string' || !mk.trim()) continue
    const key = mk.trim()
    order.push(key)
    const w = row.weight
    if (typeof w === 'number' && Number.isFinite(w)) {
      const pct = w <= 1 && w >= 0 ? Math.round(w * 100) : Math.round(w)
      rawWeights[key] = pct
    }
  }
  const methods = sanitizeMethodSelection(order)
  if (methods.length < 2 || methods.includes('upswitch_adaptive')) return null
  const filledWeights =
    resolveSynthesisPercentWeightsForMethods(methods, rawWeights) ?? equalWeightsFor(methods)
  const justification =
    typeof wv.user_justification === 'string' && wv.user_justification.trim()
      ? wv.user_justification.trim()
      : undefined
  return { methods, weights: filledWeights, justification }
}

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
      ? hydrateClientValuationResultsMap(result as unknown as Record<string, any>)
      : null
    if (!valuationResults) return null
    return getValuationMethodResultForKey(valuationResults, selectedMethod) ?? null
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
        // Standalone methods (upswitch_adaptive, fiscal_4x)
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
        const selectedForCtx =
          resolveSelectedValuationMethodForExtraction(result as unknown as Record<string, unknown>) ??
          result.selected_valuation_method
        const hydratedValuationResults = hydrateClientValuationResultsMap(
          result as unknown as Record<string, any>
        )
        const hydratedMethodFromPayload =
          typeof selectedForCtx === 'string' && selectedForCtx.trim() ? selectedForCtx.trim() : null
        const hydratedSelectedMethod =
          hydratedMethodFromPayload &&
          hydratedValuationResults &&
          getValuationMethodResultForKey(hydratedValuationResults, hydratedMethodFromPayload)
            ? hydratedMethodFromPayload
              : hydratedValuationResults &&
                getValuationMethodResultForKey(hydratedValuationResults, state.selectedMethod)
              ? state.selectedMethod
              : hydratedValuationResults &&
                  getValuationMethodResultForKey(hydratedValuationResults, 'upswitch_adaptive')
                ? 'upswitch_adaptive'
                : hydratedValuationResults
                  ? Object.keys(hydratedValuationResults)[0]
                  : state.selectedMethod

        const resultWithLegacyAliases = result as ValuationResponse & {
          htmlReport?: string | null
          details?: { html_report?: string | null }
        }
        const renderableHtmlReport = getRenderableReportHtmlFromCurrentOrFallback(
          [
            resultWithLegacyAliases.html_report,
            resultWithLegacyAliases.htmlReport,
            resultWithLegacyAliases.details?.html_report,
          ],
          [state.htmlReport]
        )

        storeLogger.info('[Manual] Valuation result set', {
          valuationId: result.valuation_id,
          hasHtmlReport: !!renderableHtmlReport,
          htmlReportLength: result.html_report?.length || 0,
          selectedMethod: hydratedSelectedMethod,
        })

        // Warn if html_report is missing
        if (!renderableHtmlReport) {
          storeLogger.error('[Manual] CRITICAL: renderable html_report missing or empty', {
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
                htmlReport: renderableHtmlReport,
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

        const keepSessionMulti =
          state.preSelectedMethods.length > 1 &&
          !state.preSelectedMethods.includes('upswitch_adaptive')
        const blendHydration = hydrateBlendFromWeightedValuation(result)

        let nextPreSelectedMethods: string[]
        let nextUserWeights: Record<string, number>
        let nextUserWeightJustification: string

        if (keepSessionMulti) {
          nextPreSelectedMethods = state.preSelectedMethods
          nextUserWeights = state.userWeights
          nextUserWeightJustification = state.userWeightJustification
        } else if (blendHydration) {
          nextPreSelectedMethods = blendHydration.methods
          nextUserWeights = blendHydration.weights
          nextUserWeightJustification =
            blendHydration.justification ?? state.userWeightJustification
        } else {
          nextPreSelectedMethods = [hydratedSelectedMethod]
          nextUserWeights = state.userWeights
          nextUserWeightJustification = state.userWeightJustification
        }

        const blendApplied = blendHydration && !keepSessionMulti ? blendHydration : null
        const nextSelectedMethod = blendApplied ? blendApplied.methods[0] : hydratedSelectedMethod
        const nextPreSelectedMethodSlot = blendApplied
          ? blendApplied.methods[0] === 'upswitch_adaptive'
            ? null
            : blendApplied.methods[0]
          : hydratedSelectedMethod

        return {
          ...state,
          result,
          htmlReport: renderableHtmlReport || null,
          selectedMethod: nextSelectedMethod,
          preSelectedMethod: nextPreSelectedMethodSlot,
          preSelectedMethods: nextPreSelectedMethods,
          userWeights: nextUserWeights,
          userWeightJustification: nextUserWeightJustification,
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
      const renderableHtml = getRenderableReportHtml(html)
      if (!renderableHtml) {
        storeLogger.warn('[Manual] Ignored non-renderable HTML report update', {
          htmlLength: html.length,
        })
        return state
      }

      const currentResult = state.result

      if (currentResult) {
        const updatedResult = { ...currentResult, html_report: renderableHtml }

        storeLogger.info('[Manual] HTML report updated in existing result', {
          htmlLength: renderableHtml.length,
        })

        return {
          ...state,
          result: updatedResult,
          htmlReport: renderableHtml,
        }
      } else {
        // Store HTML report even without result object
        storeLogger.info('[Manual] HTML report set without existing result', {
          htmlLength: renderableHtml.length,
        })

        return {
          ...state,
          htmlReport: renderableHtml,
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
