/**
 * Unified Valuation Service
 *
 * Bank-grade, single source of truth for all valuation operations.
 * Consolidates manual, instant, and streaming valuation flows.
 *
 * Key Features:
 * - Single API for all valuation types
 * - Optional streaming support
 * - Progress callbacks
 * - Unified error handling
 *
 * @module services/valuation/ValuationService
 */

import {
  ApplicationError,
  CalculationError,
  NetworkError,
  NotFoundError,
  ValidationError,
} from '../../types/errors'
import type { ValuationRequest, ValuationResponse } from '../../types/valuation'
import { getErrorMessage } from '../../utils/errors/errorConverter'
import { createContextLogger } from '../../utils/logger'
import { backendAPI } from '../backendApi'

const logger = createContextLogger('ValuationService')

/**
 * Valuation options for different flow types
 */
export interface ValuationOptions {
  /** Flow type (defaults to manual) */
  flowType?: 'manual' | 'instant' | 'conversational'
  /** Enable streaming mode for real-time progress */
  streaming?: boolean
  /** Progress callback for streaming mode */
  onProgress?: (progress: number, message: string) => void
  /** Complete callback for streaming mode */
  onComplete?: (result: ValuationResponse) => void
  /** Error callback for streaming mode */
  onError?: (error: Error) => void
}

/**
 * ValuationService - Shared valuation calculation
 *
 * Singleton service for consistent valuation operations across all flows.
 */
export class ValuationService {
  private static instance: ValuationService

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ValuationService {
    if (!ValuationService.instance) {
      ValuationService.instance = new ValuationService()
    }
    return ValuationService.instance
  }

  /**
   * Calculate valuation
   *
   * Calls backend API to calculate valuation based on provided data.
   * Handles errors and provides detailed logging.
   *
   * @param request - Valuation request data
   * @param progressCallback - Optional callback for progress updates (0-100)
   * @returns Valuation response with results and HTML reports
   * @throws ApplicationError on failure
   */
  async calculateValuation(
    request: ValuationRequest,
    progressCallback?: (progress: number, message?: string) => void
  ): Promise<ValuationResponse> {
    const startTime = performance.now()

    try {
      logger.info('Calculating valuation', {
        companyName: request.company_name,
        industry: request.industry,
        businessModel: request.business_model,
      })

      // Progress: Starting calculation
      progressCallback?.(10, 'Starting calculation...')

      // Call backend API
      const response = await backendAPI.calculateValuation(request)

      // Progress: Calculation complete
      progressCallback?.(90, 'Processing results...')

      const duration = performance.now() - startTime

      logger.info('Valuation calculated successfully', {
        valuationId: response.valuation_id,
        duration_ms: duration.toFixed(2),
        hasHtmlReport: !!response.html_report,
        hasPdfUrl: !!(response as unknown as Record<string, unknown>).pdf_url,
      })

      // Validate response has required fields
      if (!response.html_report) {
        logger.warn('Valuation response missing html_report', {
          valuationId: response.valuation_id,
          responseKeys: Object.keys(response),
        })
      }

      return response
    } catch (error) {
      this.handleError(error, request, startTime)
    }
  }

  /**
   * Calculate valuation with flow-specific routing
   * 
   * Unified method that routes to the appropriate backend endpoint based on flow type.
   */
  async calculate(
    request: ValuationRequest,
    options: ValuationOptions = {}
  ): Promise<ValuationResponse> {
    const flowType = options.flowType || 'manual'
    
    logger.info('Calculating valuation', {
      companyName: request.company_name,
      flowType,
    })

    options.onProgress?.(10, 'Starting calculation...')

    try {
      let response: ValuationResponse

      switch (flowType) {
        case 'instant':
          response = await backendAPI.calculateInstantValuation(request)
          break
        case 'conversational':
        case 'manual':
        default:
          response = await backendAPI.calculateValuation(request)
          break
      }

      options.onProgress?.(90, 'Processing results...')
      options.onComplete?.(response)
      
      logger.info('Valuation completed', {
        valuationId: response.valuation_id,
        flowType,
      })

      return response
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      options.onError?.(err)
      throw err
    }
  }

  /**
   * Handle errors with proper classification
   */
  private handleError(error: unknown, request: ValuationRequest, startTime: number): never {
    const duration = performance.now() - startTime

    if (error instanceof ValidationError) {
      logger.warn('Validation error', { error: error.message, duration_ms: duration })
      throw error
    } else if (error instanceof NetworkError) {
      logger.warn('Network error', { error: error.message, duration_ms: duration })
      throw error
    } else if (error instanceof CalculationError) {
      logger.error('Calculation error', { error: error.message, duration_ms: duration })
      throw error
    } else if (error instanceof NotFoundError) {
      logger.error('Not found error', { error: error.message, duration_ms: duration })
      throw error
    } else {
      logger.error('Unknown error', { error: getErrorMessage(error), duration_ms: duration })
      throw new ApplicationError(
        `Valuation calculation failed: ${getErrorMessage(error)}`,
        'VALUATION_CALCULATION_FAILED',
        { originalError: error, companyName: request.company_name }
      )
    }
  }
}

// Export singleton instance
export const valuationService = ValuationService.getInstance()
