/**
 * Accountant Settings API Service
 *
 * Reads the advisor-level defaults that Mercury stores in
 * `accountant_settings` (Titan `/api/v2/accountants/settings`). Venus uses
 * only the *defaults* fields — country/timezone/currency etc. are Mercury's
 * concern. Returning `null` is a non-error: an advisor without saved
 * defaults simply gets the wizard's built-in starting values.
 *
 * @module services/api/profile/AccountantSettingsAPI
 */

import { APIError, AuthenticationError } from '../../../types/errors'
import { apiLogger } from '../../../utils/logger'
import { APIRequestConfig, HttpClient } from '../HttpClient'

export type HistoricalEbitdaWeightingMode = 'standard' | 'weighted'

export interface AccountantValuationDefaults {
  /** Absolute multiple-point premium added on top of the sector average. */
  default_multiple_calibration_adjustment: number | null
  default_historical_ebitda_weighting_mode: HistoricalEbitdaWeightingMode | null
  default_show_enterprise_to_equity_bridge: boolean | null
}

interface RawAccountantSettings {
  default_multiple_calibration_adjustment?: number | string | null
  default_historical_ebitda_weighting_mode?: string | null
  default_show_enterprise_to_equity_bridge?: boolean | null
  [key: string]: unknown
}

function coerceNumber(value: unknown): number | null {
  if (value == null) return null
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num : null
}

function coerceMode(value: unknown): HistoricalEbitdaWeightingMode | null {
  return value === 'standard' || value === 'weighted' ? value : null
}

function getHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || Array.isArray(error)) return undefined
  const response = (error as { response?: unknown }).response
  if (!response || typeof response !== 'object' || Array.isArray(response)) return undefined
  const status = (response as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

export class AccountantSettingsAPI extends HttpClient {
  /**
   * Get the calling advisor's saved valuation defaults. Returns all-nulls
   * when the row is missing — sole-trader / first-login advisors land
   * here.
   */
  async getValuationDefaults(
    options?: APIRequestConfig
  ): Promise<AccountantValuationDefaults> {
    try {
      const response = await this.executeRequest<{
        success: boolean
        data: RawAccountantSettings | null
      }>(
        {
          method: 'GET',
          url: '/api/v2/accountants/settings',
          headers: {},
        },
        options
      )
      const data = response.data ?? null
      return {
        default_multiple_calibration_adjustment: coerceNumber(
          data?.default_multiple_calibration_adjustment
        ),
        default_historical_ebitda_weighting_mode: coerceMode(
          data?.default_historical_ebitda_weighting_mode
        ),
        default_show_enterprise_to_equity_bridge:
          typeof data?.default_show_enterprise_to_equity_bridge === 'boolean'
            ? data.default_show_enterprise_to_equity_bridge
            : null,
      }
    } catch (error) {
      apiLogger.error('Accountant settings fetch failed', { error })
      const status = getHttpStatus(error)
      if (status === 401 || status === 403) {
        throw new AuthenticationError('Authentication required for accountant settings')
      }
      if (status === 404) {
        return {
          default_multiple_calibration_adjustment: null,
          default_historical_ebitda_weighting_mode: null,
          default_show_enterprise_to_equity_bridge: null,
        }
      }
      throw new APIError('Failed to fetch accountant settings', status, undefined, true, {
        originalError: error,
      })
    }
  }
}
