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
    plan_type: string
    credits_per_period: number
    credits_used: number
    credits_remaining: number
    created_at: string
    /** From Titan plan config; null = all valuation methods allowed */
    allowed_methods?: string[] | null
    /** From Titan `PRICING_CONFIG` — yearly vs monthly discount % */
    yearly_discount_percent?: number
    /** Feature gates — same source as Titan plan enforcement */
    plan_features?: {
      ebitda_normalization: boolean
      version_control: boolean
      integrations_enabled: boolean
    }
  }> {
    try {
      const raw = await this.executeRequest<Record<string, unknown>>(
        {
          method: 'GET',
          url: '/api/v2/credits/plan',
          headers: {},
        } as any,
        options
      )
      const p = (raw as { data?: Record<string, unknown> })?.data ?? raw
      const planType =
        (p.plan_type as string) || (p.planType as string) || 'free'
      const rawFeatures = p.plan_features as
        | {
            ebitda_normalization?: boolean
            version_control?: boolean
            integrations_enabled?: boolean
          }
        | undefined
      return {
        id: (p.id as string) || 'plan',
        user_id: (p.user_id as string) || (p.userId as string) || '',
        plan_type: planType,
        credits_per_period: Number(p.credits_per_period ?? p.creditsLimit ?? 0),
        credits_used: Number(p.credits_used ?? 0),
        credits_remaining: Number(p.credits_remaining ?? p.creditsRemaining ?? 0),
        created_at: (p.created_at as string) || new Date().toISOString(),
        allowed_methods: (p.allowed_methods as string[] | null | undefined) ?? undefined,
        yearly_discount_percent:
          typeof p.yearly_discount_percent === 'number'
            ? p.yearly_discount_percent
            : typeof p.yearlyDiscountPercent === 'number'
              ? p.yearlyDiscountPercent
              : undefined,
        plan_features:
          rawFeatures &&
          typeof rawFeatures.ebitda_normalization === 'boolean' &&
          typeof rawFeatures.version_control === 'boolean' &&
          typeof rawFeatures.integrations_enabled === 'boolean'
            ? {
                ebitda_normalization: rawFeatures.ebitda_normalization,
                version_control: rawFeatures.version_control,
                integrations_enabled: rawFeatures.integrations_enabled,
              }
            : undefined,
      }
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
