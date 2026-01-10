/**
 * Valuation API Service
 *
 * Single Responsibility: Handle all valuation calculation operations
 * Extracted from BackendAPI to follow SRP
 *
 * @module services/api/valuation/ValuationAPI
 */

import {
  APIError,
  AuthenticationError,
  CreditError,
  NetworkError,
  RateLimitError,
  ValidationError,
} from '../../../types/errors'
import { ValuationRequest, ValuationResponse } from '../../../types/valuation'
import { apiLogger } from '../../../utils/logger'
import { APIRequestConfig, HttpClient } from '../HttpClient'

export class ValuationAPI extends HttpClient {
  /**
   * Calculate manual valuation (traditional form-based)
   * Uses unified /api/valuations/calculate endpoint with dataSource='manual'
   */
  async calculateManualValuation(
    data: ValuationRequest,
    options?: APIRequestConfig
  ): Promise<ValuationResponse> {
    try {
      return await this.executeRequest<ValuationResponse>(
        {
          method: 'POST',
          url: '/api/v2/valuations/calculate',
          data: {
            ...data,
            dataSource: 'manual',
          },
          headers: {},
        } as any,
        {
          ...options,
          retry: {
            maxRetries: 2,
            initialDelay: 1000,
            ...options?.retry,
          },
        }
      )
    } catch (error) {
      this.handleValuationError(error, 'manual valuation')
    }
  }

  /**
   * Calculate AI-guided valuation (conversational flow)
   * Uses unified /api/valuations/calculate endpoint with dataSource='ai-guided'
   */
  async calculateAIGuidedValuation(
    data: ValuationRequest,
    options?: APIRequestConfig
  ): Promise<ValuationResponse> {
    try {
      return await this.executeRequest<ValuationResponse>(
        {
          method: 'POST',
          url: '/api/v2/valuations/calculate',
          data: {
            ...data,
            dataSource: 'ai-guided',
          },
          headers: {},
        } as any,
        options
      )
    } catch (error) {
      this.handleValuationError(error, 'AI-guided valuation')
    }
  }

  /**
   * Calculate instant valuation (quick preview)
   * Uses unified /api/valuations/calculate endpoint with dataSource='instant'
   */
  async calculateInstantValuation(
    data: ValuationRequest,
    options?: APIRequestConfig
  ): Promise<ValuationResponse> {
    try {
      return await this.executeRequest<ValuationResponse>(
        {
          method: 'POST',
          url: '/api/v2/valuations/calculate',
          data: {
            ...data,
            dataSource: 'instant',
          },
          headers: {},
        } as any,
        options
      )
    } catch (error) {
      this.handleValuationError(error, 'instant valuation')
    }
  }

  /**
   * Unified valuation calculation (determines type automatically)
   */
  async calculateValuationUnified(
    data: ValuationRequest,
    options?: APIRequestConfig
  ): Promise<ValuationResponse> {
    try {
      // Map frontend 'conversational' to backend 'ai-guided'
      // Note: dataSource is not part of ValuationRequest type, so we add it to the request data
      const dataSource =
        (data as any).dataSource === 'conversational'
          ? 'ai-guided'
          : (data as any).dataSource || 'manual'
      const backendData = {
        ...data,
        dataSource,
      } as any

      // Use unified endpoint - backend determines credit cost based on dataSource
      return await this.executeRequest<ValuationResponse>(
        {
          method: 'POST',
          url: '/api/v2/valuations/calculate',
          data: backendData,
          headers: {},
        } as any,
        {
          ...options,
          retry: {
            maxRetries: 3,
            initialDelay: 1000,
            ...options?.retry,
          },
        }
      )
    } catch (error) {
      this.handleValuationError(error, 'unified valuation')
    }
  }

  /**
   * Generate HTML preview for valuation
   */
  async generatePreviewHtml(
    data: ValuationRequest,
    options?: APIRequestConfig
  ): Promise<{ html: string; completeness_percent: number }> {
    try {
      return await this.executeRequest<{ html: string; completeness_percent: number }>(
        {
          method: 'POST',
          url: '/api/valuation/preview-html',
          data,
          headers: {},
        } as any,
        options
      )
    } catch (error) {
      apiLogger.error('Failed to generate preview HTML', { error })
      const axiosError = error as any
      const statusCode = axiosError?.response?.status
      throw new APIError('Failed to generate valuation preview', statusCode, undefined, true, {
        originalError: error,
      })
    }
  }

  /**
   * Handle valuation-specific errors with appropriate error types
   */
  private handleValuationError(error: unknown, operation: string): never {
    apiLogger.error(`Valuation ${operation} failed`, { error })

    const axiosError = error as any
    const status = axiosError?.response?.status

    if (status === 429) {
      throw new RateLimitError('Too many valuation requests. Please wait before trying again.')
    }

    if (status === 401 || status === 403) {
      throw new AuthenticationError('Authentication required for valuation calculation.')
    }

    if (status === 402) {
      throw new CreditError('Insufficient credits for valuation calculation.')
    }

    if (status === 400) {
      const message = axiosError?.response?.data?.message || 'Invalid valuation data provided.'
      throw new ValidationError(message)
    }

    if (axiosError?.code === 'ECONNABORTED' || axiosError?.code === 'ENOTFOUND') {
      throw new NetworkError(
        'Network error during valuation calculation. Please check your connection.'
      )
    }

    throw new APIError(`Failed to complete ${operation}`, status, undefined, true, {
      originalError: error,
    })
  }
}
