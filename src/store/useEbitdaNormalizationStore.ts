/**
 * EBITDA Normalization Zustand Store
 *
 * Manages state for EBITDA normalization feature
 * Supports optimistic updates, market rate suggestions, and session persistence
 */

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { getCategoryDefinition } from '../config/normalizationCategories'
import { NormalizationAPIError, normalizationService } from '../services/ebitdaNormalizationService'
import {
  CustomAdjustment,
  EbitdaNormalization,
  MarketRateSuggestion,
  NormalizationAdjustment,
  NormalizationCategory,
} from '../types/ebitdaNormalization'

interface EbitdaNormalizationStore {
  // State
  normalizations: Record<number, EbitdaNormalization> // Keyed by year
  isLoading: boolean
  isSaving: boolean
  activeYear: number | null // Currently editing year
  marketRateSuggestions: Record<number, MarketRateSuggestion[]> // Keyed by year
  errors: Record<string, string> // Error messages keyed by context

  // Actions
  openNormalizationModal: (year: number, reportedEbitda: number, sessionId: string) => Promise<void>
  closeNormalizationModal: () => void
  updateAdjustment: (
    year: number,
    category: NormalizationCategory,
    amount: number,
    note?: string
  ) => void
  addCustomAdjustment: (year: number, description?: string, amount?: number, note?: string) => void
  updateCustomAdjustment: (
    year: number,
    customId: string,
    description: string,
    amount: number,
    note?: string
  ) => void
  removeCustomAdjustment: (year: number, customId: string) => void
  saveNormalization: (
    sessionId: string,
    year: number,
    userId?: string,
    versionId?: string
  ) => Promise<void>
  loadNormalization: (sessionId: string, year: number) => Promise<void>
  loadAllNormalizations: (sessionId: string) => Promise<void>
  removeNormalization: (sessionId: string, year: number) => Promise<void>
  fetchMarketRates: (
    industry: string,
    revenue: number,
    year: number,
    location?: string
  ) => Promise<void>
  clearError: (context: string) => void

  // Computed
  getTotalAdjustments: (year: number) => number
  getNormalizedEbitda: (year: number) => number
  hasNormalization: (year: number) => boolean
  getAdjustmentPercentage: (year: number) => number
  getAdjustmentCount: (year: number) => number
  getLastUpdated: (year: number) => Date
}

export const useEbitdaNormalizationStore = create<EbitdaNormalizationStore>()(
  devtools(
    (set, get) => ({
      // Initial state
      normalizations: {},
      isLoading: false,
      isSaving: false,
      activeYear: null,
      marketRateSuggestions: {},
      errors: {},

      // Open modal and initialize normalization for year
      // OPTIMISTIC UI: Opens modal immediately with template, then loads data asynchronously
      openNormalizationModal: async (year, reportedEbitda, sessionId) => {
        const { normalizations, loadNormalization } = get()

        // OPTIMISTIC: Create template immediately if doesn't exist
        if (!normalizations[year]) {
          const template: EbitdaNormalization = {
            session_id: sessionId,
            year,
            reported_ebitda: reportedEbitda,
            adjustments: [],
            custom_adjustments: [],
            total_adjustments: 0,
            normalized_ebitda: reportedEbitda,
            confidence_score: 'medium',
          }

          set({
            normalizations: {
              ...normalizations,
              [year]: template,
            },
            activeYear: year, // Open modal immediately
          })

          // Async: Try to load actual data from backend
          loadNormalization(sessionId, year)
            .then(() => {
              // Data loaded successfully - store already updated by loadNormalization
            })
            .catch((error) => {
              // No data found - template is already shown, no action needed
              console.log(`No existing normalization for ${year}, using template`)
            })
        } else {
          // Already exists in store, just open modal
          set({ activeYear: year })
        }
      },

      // Close modal
      closeNormalizationModal: () => {
        set({ activeYear: null })
      },

      // Update adjustment (optimistic update)
      updateAdjustment: (year, category, amount, note) => {
        const { normalizations } = get()
        const normalization = normalizations[year]

        if (!normalization) {
          console.error(`No normalization found for year ${year}`)
          return
        }

        // Update or add adjustment
        const existingAdjustmentIndex = normalization.adjustments.findIndex(
          (adj) => adj.category === category
        )

        let updatedAdjustments: NormalizationAdjustment[]

        if (existingAdjustmentIndex >= 0) {
          // Update existing
          updatedAdjustments = [...normalization.adjustments]
          updatedAdjustments[existingAdjustmentIndex] = {
            category,
            amount,
            note,
          }
        } else {
          // Add new
          updatedAdjustments = [...normalization.adjustments, { category, amount, note }]
        }

        // Remove adjustments with amount = 0 and no note
        updatedAdjustments = updatedAdjustments.filter((adj) => adj.amount !== 0 || adj.note)

        // Calculate totals (include custom adjustments)
        const standardAdjustmentsSum = updatedAdjustments.reduce((sum, adj) => sum + adj.amount, 0)
        const customAdjustmentsSum = (normalization.custom_adjustments || []).reduce(
          (sum, adj) => sum + adj.amount,
          0
        )
        const totalAdjustments = standardAdjustmentsSum + customAdjustmentsSum
        const normalizedEbitda = normalization.reported_ebitda + totalAdjustments

        // Update state
        set({
          normalizations: {
            ...normalizations,
            [year]: {
              ...normalization,
              adjustments: updatedAdjustments,
              total_adjustments: totalAdjustments,
              normalized_ebitda: normalizedEbitda,
            },
          },
        })
      },

      // Add custom adjustment
      addCustomAdjustment: (year, description = '', amount = 0, note) => {
        const { normalizations } = get()
        const normalization = normalizations[year]

        if (!normalization) {
          console.error(`No normalization found for year ${year}`)
          return
        }

        const newCustom: CustomAdjustment = {
          id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          description,
          amount,
          note,
        }

        const updatedCustom = [...(normalization.custom_adjustments || []), newCustom]

        // Recalculate totals
        const standardSum = normalization.adjustments.reduce((sum, adj) => sum + adj.amount, 0)
        const customSum = updatedCustom.reduce((sum, adj) => sum + adj.amount, 0)
        const totalAdjustments = standardSum + customSum

        set({
          normalizations: {
            ...normalizations,
            [year]: {
              ...normalization,
              custom_adjustments: updatedCustom,
              total_adjustments: totalAdjustments,
              normalized_ebitda: normalization.reported_ebitda + totalAdjustments,
            },
          },
        })
      },

      // Update custom adjustment
      updateCustomAdjustment: (year, customId, description, amount, note) => {
        const { normalizations } = get()
        const normalization = normalizations[year]

        if (!normalization) {
          console.error(`No normalization found for year ${year}`)
          return
        }

        const updatedCustom = (normalization.custom_adjustments || []).map((custom) =>
          custom.id === customId ? { ...custom, description, amount, note } : custom
        )

        // Recalculate totals
        const standardSum = normalization.adjustments.reduce((sum, adj) => sum + adj.amount, 0)
        const customSum = updatedCustom.reduce((sum, adj) => sum + adj.amount, 0)
        const totalAdjustments = standardSum + customSum

        set({
          normalizations: {
            ...normalizations,
            [year]: {
              ...normalization,
              custom_adjustments: updatedCustom,
              total_adjustments: totalAdjustments,
              normalized_ebitda: normalization.reported_ebitda + totalAdjustments,
            },
          },
        })
      },

      // Remove custom adjustment
      removeCustomAdjustment: (year, customId) => {
        const { normalizations } = get()
        const normalization = normalizations[year]

        if (!normalization) {
          console.error(`No normalization found for year ${year}`)
          return
        }

        const updatedCustom = (normalization.custom_adjustments || []).filter(
          (custom) => custom.id !== customId
        )

        // Recalculate totals
        const standardSum = normalization.adjustments.reduce((sum, adj) => sum + adj.amount, 0)
        const customSum = updatedCustom.reduce((sum, adj) => sum + adj.amount, 0)
        const totalAdjustments = standardSum + customSum

        set({
          normalizations: {
            ...normalizations,
            [year]: {
              ...normalization,
              custom_adjustments: updatedCustom,
              total_adjustments: totalAdjustments,
              normalized_ebitda: normalization.reported_ebitda + totalAdjustments,
            },
          },
        })
      },

      // Save normalization to backend
      saveNormalization: async (sessionId, year, userId, versionId) => {
        const { normalizations } = get()
        const normalization = normalizations[year]

        if (!normalization) {
          throw new Error(`No normalization found for year ${year}`)
        }

        set({ isSaving: true })

        try {
          const response = await normalizationService.saveNormalization({
            session_id: sessionId,
            user_id: userId,
            version_id: versionId,
            year,
            reported_ebitda: normalization.reported_ebitda,
            adjustments: normalization.adjustments,
            custom_adjustments: normalization.custom_adjustments || [],
            confidence_score: normalization.confidence_score,
            market_rate_source: normalization.market_rate_source || undefined,
          })

          // API call succeeded - log diagnostic info
          console.log('[Normalization] Save succeeded', {
            year,
            sessionId,
            responseHasId: !!response?.id,
            responseHasTimestamps: !!(response?.created_at && response?.updated_at),
            responseKeys: Object.keys(response || {}),
          })

          // Try to update state with server response
          try {
            set({
              normalizations: {
                ...get().normalizations,
                [year]: {
                  ...normalization,
                  // Safely access response fields with fallbacks
                  id: response?.id,
                  created_at: response?.created_at,
                  updated_at: response?.updated_at,
                },
              },
              isSaving: false,
            })

            console.log('Normalization saved successfully', {
              year,
              id: response?.id,
              session_id: sessionId,
            })
          } catch (stateUpdateError) {
            // State update failed, but API save succeeded
            // Log the error but don't throw - modal should still close
            console.warn('State update failed after successful save', {
              error: stateUpdateError,
              year,
              sessionId,
              note: 'Data was saved to database successfully',
            })

            set({ isSaving: false })
          }

          // Clear any previous errors for this year
          const { errors } = get()
          const newErrors = { ...errors }
          delete newErrors[`save-${year}`]
          set({ errors: newErrors })
        } catch (apiError) {
          // API call failed - this is a real error
          console.error('API error saving normalization', apiError)

          set({
            isSaving: false,
            errors: {
              ...get().errors,
              [`save-${year}`]:
                apiError instanceof NormalizationAPIError
                  ? apiError.message
                  : 'Failed to save normalization to server',
            },
          })

          // Only throw if it's an actual API error (4xx, 5xx)
          throw apiError
        }
      },

      // Load normalization from backend
      loadNormalization: async (sessionId, year) => {
        set({ isLoading: true })

        try {
          const response = await normalizationService.getNormalization(sessionId, year)

          const normalization: EbitdaNormalization = {
            id: response.id,
            session_id: sessionId,
            version_id: response.version_id,
            year: response.year,
            reported_ebitda: response.reported_ebitda,
            adjustments: response.adjustments,
            custom_adjustments: response.custom_adjustments || [],
            total_adjustments: response.total_adjustments,
            normalized_ebitda: response.normalized_ebitda,
            confidence_score: response.confidence_score,
            market_rate_source: response.market_rate_source || undefined,
            created_at: response.created_at,
            updated_at: response.updated_at,
          }

          set({
            normalizations: {
              ...get().normalizations,
              [year]: normalization,
            },
            isLoading: false,
          })

          console.log('Normalization loaded successfully', { year })
        } catch (error) {
          set({ isLoading: false })

          // For 404 or 500 errors, throw so openNormalizationModal can create a template
          // This allows the UI to work even when backend has issues
          if (error instanceof NormalizationAPIError) {
            if (error.status === 404) {
              // Not found - no normalization exists yet, this is expected
              console.log('No normalization found for year, will create template', { year })
            } else {
              // 500 or other server errors - log but allow UI to continue with template
              console.warn('Error loading normalization from backend, will create template', {
                year,
                status: error.status,
                message: error.message,
              })
            }
            // Throw to allow openNormalizationModal to catch and create template
            throw error
          } else {
            // Unknown error - log and throw
            console.error('Unexpected error loading normalization', error)
            set({
              errors: {
                ...get().errors,
                [`load-${year}`]: 'Failed to load normalization',
              },
            })
            throw error
          }
        }
      },

      // Load all normalizations for session
      loadAllNormalizations: async (sessionId) => {
        set({ isLoading: true })

        try {
          const responses = await normalizationService.getAllNormalizations(sessionId)

          const normalizationsMap: Record<number, EbitdaNormalization> = {}

          for (const response of responses) {
            normalizationsMap[response.year] = {
              id: response.id,
              session_id: sessionId,
              version_id: response.version_id,
              year: response.year,
              reported_ebitda: response.reported_ebitda,
              adjustments: response.adjustments,
              custom_adjustments: response.custom_adjustments || [],
              total_adjustments: response.total_adjustments,
              normalized_ebitda: response.normalized_ebitda,
              confidence_score: response.confidence_score,
              market_rate_source: response.market_rate_source || undefined,
              created_at: response.created_at,
              updated_at: response.updated_at,
            }
          }

          set({
            normalizations: {
              ...get().normalizations,
              ...normalizationsMap,
            },
            isLoading: false,
          })

          console.log('All normalizations loaded', { count: responses.length })
        } catch (error) {
          console.error('Error loading all normalizations', error)
          set({
            isLoading: false,
            errors: {
              ...get().errors,
              'load-all':
                error instanceof NormalizationAPIError
                  ? error.message
                  : 'Failed to load normalizations',
            },
          })
        }
      },

      // Remove normalization
      removeNormalization: async (sessionId, year) => {
        const { normalizations } = get()

        // Optimistically remove from state
        const { [year]: removed, ...remaining } = normalizations
        set({ normalizations: remaining })

        try {
          await normalizationService.deleteNormalization(sessionId, year)
          console.log('Normalization removed successfully', { year })
        } catch (error) {
          console.error('Error removing normalization', error)

          // Rollback on error
          set({
            normalizations: {
              ...get().normalizations,
              [year]: removed,
            },
            errors: {
              ...get().errors,
              [`remove-${year}`]:
                error instanceof NormalizationAPIError
                  ? error.message
                  : 'Failed to remove normalization',
            },
          })
          throw error
        }
      },

      // Fetch market rate suggestions
      fetchMarketRates: async (industry, revenue, year, location = 'Belgium') => {
        try {
          const response = await normalizationService.getMarketRates(
            industry,
            revenue,
            location,
            year
          )

          // Convert market rates response to suggestions
          const suggestions: MarketRateSuggestion[] = []

          // Owner compensation suggestion
          if (response.owner_compensation_market_rate) {
            const categoryDef = getCategoryDefinition(NormalizationCategory.OWNER_COMPENSATION)
            suggestions.push({
              category: NormalizationCategory.OWNER_COMPENSATION,
              suggested_amount: response.owner_compensation_market_rate,
              market_rate_50th_percentile: response.owner_compensation_percentile_50,
              market_rate_75th_percentile: response.owner_compensation_percentile_75,
              rationale: `Market rate for CEO/owner in ${industry} with €${(revenue / 1000).toFixed(0)}k revenue`,
              confidence: response.confidence,
              source: response.source,
            })
          }

          // Personal expenses suggestion (as % of revenue)
          if (response.personal_expenses_suggested_percentage && revenue) {
            const suggestedAmount =
              (revenue * response.personal_expenses_suggested_percentage) / 100
            suggestions.push({
              category: NormalizationCategory.PERSONAL_EXPENSES,
              suggested_amount: Math.round(suggestedAmount),
              suggested_percentage: response.personal_expenses_suggested_percentage,
              rationale: `Typical personal expenses: ${response.personal_expenses_suggested_percentage}% of revenue`,
              confidence: response.confidence,
              source: response.source,
            })
          }

          // Discretionary expenses suggestion (as % of revenue)
          if (response.discretionary_expenses_suggested_percentage && revenue) {
            const suggestedAmount =
              (revenue * response.discretionary_expenses_suggested_percentage) / 100
            suggestions.push({
              category: NormalizationCategory.DISCRETIONARY_EXPENSES,
              suggested_amount: Math.round(suggestedAmount),
              suggested_percentage: response.discretionary_expenses_suggested_percentage,
              rationale: `Typical discretionary expenses: ${response.discretionary_expenses_suggested_percentage}% of revenue`,
              confidence: response.confidence,
              source: response.source,
            })
          }

          set({
            marketRateSuggestions: {
              ...get().marketRateSuggestions,
              [year]: suggestions,
            },
          })

          console.log('Market rates fetched successfully', { year, count: suggestions.length })
        } catch (error) {
          console.error('Error fetching market rates', error)
          // Don't fail - market rates are suggestions, not required
          set({
            marketRateSuggestions: {
              ...get().marketRateSuggestions,
              [year]: [],
            },
          })
        }
      },

      // Clear error
      clearError: (context) => {
        const { errors } = get()
        const { [context]: removed, ...remaining } = errors
        set({ errors: remaining })
      },

      // Computed: Get total adjustments for year
      getTotalAdjustments: (year) => {
        const normalization = get().normalizations[year]
        return normalization?.total_adjustments || 0
      },

      // Computed: Get normalized EBITDA for year
      getNormalizedEbitda: (year) => {
        const normalization = get().normalizations[year]
        return normalization?.normalized_ebitda || 0
      },

      // Computed: Check if normalization exists for year
      hasNormalization: (year) => {
        const normalization = get().normalizations[year]
        return !!normalization && (normalization.adjustments.length > 0 || !!normalization.id)
      },

      // Computed: Get adjustment percentage
      getAdjustmentPercentage: (year) => {
        const normalization = get().normalizations[year]
        if (!normalization || normalization.reported_ebitda === 0) {
          return 0
        }
        return (normalization.total_adjustments / normalization.reported_ebitda) * 100
      },

      // Computed: Get count of active adjustments
      getAdjustmentCount: (year) => {
        const normalization = get().normalizations[year]
        if (!normalization) return 0
        const standardCount = normalization.adjustments.filter((a) => a.amount !== 0).length
        const customCount = normalization.custom_adjustments?.length || 0
        return standardCount + customCount
      },

      // Computed: Get last updated timestamp
      getLastUpdated: (year) => {
        const normalization = get().normalizations[year]
        const timestamp = normalization?.updated_at || normalization?.created_at
        return timestamp ? new Date(timestamp) : new Date()
      },
    }),
    {
      name: 'ebitda-normalization-store',
    }
  )
)
