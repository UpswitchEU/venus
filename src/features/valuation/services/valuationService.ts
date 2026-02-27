/**
 * @deprecated Use ValuationService from services/valuation/ValuationService instead
 *
 * This service is deprecated in favor of the unified ValuationService.
 * It will be removed in a future version.
 *
 * Migration:
 * ```typescript
 * // Before
 * import { valuationService } from './features/valuation/services/valuationService'
 * const result = await valuationService.calculateValuation(data)
 *
 * // After
 * import { valuationService } from './services/valuation/ValuationService'
 * const result = await valuationService.calculate(data)
 * ```
 */

import { manualValuationStreamService } from '../../../services/manualValuationStreamService'
import { ValuationRequest, ValuationResponse } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { IValuationService } from './interfaces'

/**
 * @deprecated Use services/valuation/ValuationService instead
 */
export class ValuationService implements IValuationService {
  /**
   * Calculate valuation synchronously
   */
  async calculateValuation(request: ValuationRequest): Promise<ValuationResponse> {
    try {
      generalLogger.info('Starting valuation calculation', {
        companyName: request.company_name,
        industry: request.industry,
      })

      // Use existing manual valuation stream service
      // This is a temporary adapter - should be refactored to not use streaming
      const result = await new Promise<ValuationResponse>(async (resolve, reject) => {
        let finalResult: ValuationResponse | null = null

        const stream = await manualValuationStreamService.streamManualValuation(request, {
          onComplete: (htmlReport: string, valuationId: string, fullResponse?: any) => {
            finalResult = {
              ...fullResponse,
              html_report: htmlReport,
              valuation_id: valuationId,
            } as ValuationResponse
            resolve(finalResult)
          },
          onError: (error: string) => {
            reject(new Error(error))
          },
        })

        // Wait a bit for completion (this is a temporary solution)
        setTimeout(() => {
          if (finalResult) {
            resolve(finalResult)
          } else {
            reject(new Error('Valuation calculation timed out'))
            stream.close()
          }
        }, 30000) // 30 second timeout
      })

      generalLogger.info('Valuation calculation completed', {
        valuationId: result.valuation_id,
        hasHtmlReport: !!result.html_report,
      })

      return result
    } catch (error) {
      generalLogger.error('Valuation calculation failed', { error })
      throw error instanceof Error ? error : new Error('Valuation calculation failed')
    }
  }

  /**
   * Start streaming valuation calculation
   */
  async startStreamingValuation(
    request: ValuationRequest,
    onProgress?: (progress: number, message: string) => void,
    onComplete?: (result: ValuationResponse) => void,
    onError?: (error: string) => void
  ): Promise<{ stop: () => void }> {
    try {
      generalLogger.info('Starting streaming valuation', {
        companyName: request.company_name,
      })

      const stream = await manualValuationStreamService.streamManualValuation(request, {
        onProgress,
        onComplete: (htmlReport: string, valuationId: string, fullResponse?: any) => {
          const result: ValuationResponse = {
            ...fullResponse,
            html_report: htmlReport,
            valuation_id: valuationId,
          } as ValuationResponse
          onComplete?.(result)
        },
        onError,
      })

      return {
        stop: () => stream.close(),
      }
    } catch (error) {
      generalLogger.error('Failed to start streaming valuation', { error })
      onError?.(error instanceof Error ? error.message : 'Failed to start valuation')
      throw error
    }
  }
}

// Export singleton instance
export const valuationService = new ValuationService()
