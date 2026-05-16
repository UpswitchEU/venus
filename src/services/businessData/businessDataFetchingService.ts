/**
 * Business Data Fetching Service
 *
 * Single Responsibility: Fetch business data from backend APIs
 * SOLID Principles: SRP - Only handles data fetching operations
 *
 * @module services/businessData/businessDataFetchingService
 */

import type { BusinessTypeAnalysis } from '../../types/valuation'
import { getApiUrl } from '../../utils/getMercuryUrl'
import { serviceLogger } from '../../utils/logger'
import type { BusinessProfileData } from './businessDataTypes'

export class BusinessDataFetchingService {
  private backendUrl: string

  constructor() {
    this.backendUrl = getApiUrl()
  }

  /**
   * Fetch user's business profile data from backend
   */
  async fetchUserBusinessData(userId: string): Promise<BusinessProfileData | null> {
    try {
      serviceLogger.debug('Fetching business profile for user', { userId })

      const response = await fetch(`${this.backendUrl}/api/users/${userId}/business-profile`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Send authentication cookie
      })

      if (!response.ok) {
        if (response.status === 404) {
          serviceLogger.info('No business profile found for user', { userId })
          return null
        }
        throw new Error(`Failed to fetch business profile: ${response.statusText}`)
      }

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch business profile')
      }

      serviceLogger.info('Business profile fetched successfully', { data: result.data })
      return result.data
    } catch (error) {
      serviceLogger.error('Failed to fetch business data', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return null
    }
  }

  /**
   * Get business type analysis for methodology recommendation
   */
  async getBusinessTypeAnalysis(
    businessType: string,
    countryCode: string = 'BE'
  ): Promise<BusinessTypeAnalysis | null> {
    try {
      // Use Node.js backend instead of direct Python engine calls
      // FIX: Fallback should be Node.js backend (proxy), not Python engine directly
      const backendUrl = getApiUrl()

      const response = await fetch(`${backendUrl}/api/v1/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          business_type: businessType,
          country_code: countryCode,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to analyze business type: ${response.statusText}`)
      }

      const result = await response.json()
      return result
    } catch (error) {
      serviceLogger.error('Error analyzing business type', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return null
    }
  }
}

export const businessDataFetchingService = new BusinessDataFetchingService()
