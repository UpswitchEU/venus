/**
 * Valuation API Store
 *
 * Manages API call state for valuation calculations.
 * Used by ConversationalLayout and manual flows.
 */

import { create } from 'zustand'
import { backendAPI } from '../services/backendApi'
import type { ValuationRequest, ValuationResponse } from '../types/valuation'
import { convertToApplicationError, getErrorMessage } from '../utils/errors/errorConverter'
import {
  isNetworkError,
  isRetryable as isRetryableError,
  isValidationError,
} from '../utils/errors/errorGuards'
import { storeLogger } from '../utils/logger'

interface ValuationApiStore {
  // Calculation state
  isCalculating: boolean
  error: string | null

  // Actions
  calculateValuation: (request: ValuationRequest) => Promise<ValuationResponse | null>
  setCalculating: (isCalculating: boolean) => void
  // Atomic check-and-set: returns true if state was set, false if already calculating
  trySetCalculating: () => boolean
  clearError: () => void
}

export const useValuationApiStore = create<ValuationApiStore>((set, get) => ({
  // Initial state
  isCalculating: false,
  error: null,

  // Calculate valuation
  calculateValuation: async (request: ValuationRequest): Promise<ValuationResponse | null> => {
    // CRITICAL: Use functional update to atomically check and set isCalculating
    // This prevents race conditions if multiple calculations are triggered simultaneously
    // NOTE: If isCalculating is already true (set by trySetCalculating), we still proceed
    // because the caller has already ensured atomicity. We just ensure it stays true.
    let shouldProceed = false
    set((state) => {
      if (state.isCalculating) {
        // If already calculating, check if this is from a previous call or current call
        // Since trySetCalculating is called before calculateValuation, if isCalculating is true,
        // it's likely from the current call. We proceed to allow the calculation to run.
        // However, if calculateValuation is called again while already calculating from a different
        // source, we should still prevent it. The trySetCalculating check in the caller prevents this.
        shouldProceed = true // Proceed - likely from current call via trySetCalculating
        return state // No change needed - already set
      }
      shouldProceed = true
      return { ...state, isCalculating: true, error: null }
    })

    // This should never be false, but check anyway for safety
    if (!shouldProceed) {
      storeLogger.warn('Unexpected state: shouldProceed is false', {
        companyName: request.company_name,
      })
      return null
    }

    try {
      storeLogger.info('Calculating valuation', {
        companyName: request.company_name,
        industry: request.industry,
      })

      const response = await backendAPI.calculateValuation(request)

      set({ isCalculating: false })

      storeLogger.info('Valuation calculated successfully', {
        valuationId: response?.valuation_id,
      })

      return response
    } catch (error) {
      const appError = convertToApplicationError(error, {
        companyName: request.company_name,
        industry: request.industry,
      })

      // Log with specific error type
      if (isValidationError(appError)) {
        storeLogger.error('Valuation calculation failed - validation error', {
          error: (appError as any).message,
          code: (appError as any).code,
          context: (appError as any).context,
        })
      } else if (isNetworkError(appError)) {
        storeLogger.error('Valuation calculation failed - network error', {
          error: (appError as any).message,
          code: (appError as any).code,
          context: (appError as any).context,
        })
      } else if (isRetryableError(appError)) {
        storeLogger.warn('Valuation calculation failed - retryable error', {
          error: (appError as any).message,
          code: (appError as any).code,
          context: (appError as any).context,
        })
      } else {
        storeLogger.error('Valuation calculation failed', {
          error: (appError as any).message,
          code: (appError as any).code,
          context: (appError as any).context,
        })
      }

      const errorMessage = getErrorMessage(appError)

      set({
        isCalculating: false,
        error: errorMessage,
      })

      return null
    }
  },

  // Set calculating state (for immediate UI feedback)
  // Uses functional update to ensure atomic state changes
  setCalculating: (isCalculating: boolean) => {
    set((state) => {
      // If trying to set to true but already calculating, don't change state
      if (isCalculating && state.isCalculating) {
        storeLogger.debug('Already calculating, skipping duplicate setCalculating(true)')
        return state
      }
      return { ...state, isCalculating }
    })
  },

  // Atomic check-and-set: returns true if state was set, false if already calculating
  // Use this before calling calculateValuation to ensure immediate UI feedback
  trySetCalculating: () => {
    let wasSet = false
    set((state) => {
      if (state.isCalculating) {
        return state // Already calculating, don't change
      }
      wasSet = true
      return { ...state, isCalculating: true, error: null }
    })
    return wasSet
  },

  // Clear error
  clearError: () => {
    set({ error: null })
  },
}))
