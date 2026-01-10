/**
 * Credit API Service
 *
 * Single Responsibility: Handle credit status, usage, and account management
 * Extracted from BackendAPI to follow SRP
 *
 * @module services/api/credit/CreditAPI
 */

import { SaveValuationRequest } from '../../../types/api'
import type { SaveValuationResponse } from '../../../types/api-responses'
import { APIError, AuthenticationError, CreditError } from '../../../types/errors'
import { apiLogger } from '../../../utils/logger'
import { APIRequestConfig, HttpClient } from '../HttpClient'

export class CreditAPI extends HttpClient {
  /**
   * Get current credit status
   */
  async getCreditStatus(
    options?: APIRequestConfig
  ): Promise<{ creditsRemaining: number; isPremium: boolean }> {
    try {
      return await this.executeRequest<{ creditsRemaining: number; isPremium: boolean }>(
        {
          method: 'GET',
          url: '/api/v2/credits/status',
          headers: {},
        } as any,
        options
      )
    } catch (error) {
      this.handleCreditError(error, 'get credit status')
    }
  }

  /**
   * Get user's plan and credit information
   */
  async getUserPlan(options?: APIRequestConfig): Promise<{
    id: string
    user_id: string
    plan_type: 'free' | 'premium'
    credits_per_period: number
    credits_used: number
    credits_remaining: number
    created_at: string
  }> {
    try {
      const response = await this.executeRequest<{
        success: boolean
        data: {
          id: string
          user_id: string
          plan_type: 'free' | 'premium'
          credits_per_period: number
          credits_used: number
          credits_remaining: number
          created_at: string
        }
      }>(
        {
          method: 'GET',
          url: '/api/v2/credits/plan',
          headers: {},
        } as any,
        options
      )
      return response.data
    } catch (error) {
      this.handleCreditError(error, 'get user plan')
    }
  }

  /**
   * Save valuation (deducts credits)
   */
  async saveValuation(
    data: SaveValuationRequest,
    options?: APIRequestConfig
  ): Promise<SaveValuationResponse> {
    try {
      return await this.executeRequest<SaveValuationResponse>(
        {
          method: 'POST',
          url: '/api/v2/valuations/save',
          data,
          headers: {},
        } as any,
        options
      )
    } catch (error) {
      this.handleCreditError(error, 'save valuation')
    }
  }

  /**
   * Handle credit-specific errors
   */
  private handleCreditError(error: unknown, operation: string): never {
    apiLogger.error(`Credit ${operation} failed`, { error })

    const axiosError = error as any
    const status = axiosError?.response?.status

    if (status === 401 || status === 403) {
      throw new AuthenticationError('Authentication required for credit operations')
    }

    if (status === 402) {
      throw new CreditError('Insufficient credits for this operation')
    }

    if (status === 429) {
      throw new CreditError('Too many credit operations. Please wait before trying again.')
    }

    const statusCode = axiosError?.response?.status
    throw new APIError(`Failed to ${operation}`, statusCode, undefined, true, {
      originalError: error,
    })
  }
}
