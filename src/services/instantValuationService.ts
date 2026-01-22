/**
 * @deprecated Use ValuationService from services/valuation/ValuationService instead
 * 
 * This service is deprecated in favor of the unified ValuationService.
 * It will be removed in a future version.
 * 
 * Migration:
 * ```typescript
 * // Before
 * import { instantValuationService } from './instantValuationService'
 * const result = await instantValuationService.processInstantValuation(data)
 * 
 * // After
 * import { valuationService } from './valuation/ValuationService'
 * const result = await valuationService.calculate(data, { flowType: 'instant' })
 * ```
 */

import { backendAPI } from '../services/backendApi'
import type { ValuationRequest, ValuationResponse } from '../types/valuation'
import { serviceLogger } from '../utils/logger'

/**
 * @deprecated Use ValuationService instead
 */
class InstantValuationService {
  /**
   * Process instant valuation through backend (with credit checks)
   * This replaces the direct valuation engine call for the instant flow
   */
  async processInstantValuation(data: ValuationRequest): Promise<ValuationResponse> {
    try {
      serviceLogger.info('Processing instant valuation through backend', {
        companyName: data.company_name,
        flowType: 'instant',
      })

      // Use backend API which handles credit checks
      const response = await backendAPI.calculateInstantValuation(data)

      serviceLogger.info('Instant valuation completed', {
        valuationId: response.valuation_id,
        flowType: 'instant',
      })

      return response
    } catch (error) {
      serviceLogger.error('Instant valuation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        flowType: 'instant',
      })
      throw error
    }
  }

  /**
   * Process manual valuation through backend (no credit checks)
   * This is used by the manual flow
   */
  async processManualValuation(data: ValuationRequest): Promise<ValuationResponse> {
    try {
      serviceLogger.info('Processing manual valuation through backend', {
        companyName: data.company_name,
        flowType: 'manual',
      })

      // Use backend API which doesn't require credits
      const response = await backendAPI.calculateManualValuation(data)

      serviceLogger.info('Manual valuation completed', {
        valuationId: response.valuation_id,
        flowType: 'manual',
      })

      return response
    } catch (error) {
      serviceLogger.error('Manual valuation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        flowType: 'manual',
      })
      throw error
    }
  }

  /**
   * Legacy method for backward compatibility
   * Routes to appropriate flow based on context
   */
  async calculateValuation(
    data: ValuationRequest,
    flowType: 'manual' | 'instant' = 'instant'
  ): Promise<ValuationResponse> {
    if (flowType === 'manual') {
      return this.processManualValuation(data)
    } else {
      return this.processInstantValuation(data)
    }
  }
}

export const instantValuationService = new InstantValuationService()
