/**
 * Business Card Service
 *
 * Single Responsibility: Transform business card data from main frontend into ValuationRequest format
 * Open/Closed: Extensible via field mapping configuration
 * Dependency Inversion: Depends on API abstraction
 */

import type { IndustryCode, ValuationRequest, YearDataInput } from '../../types/valuation'
import { getCurrentFilingYear } from '../../utils/fiscalYear'
import { getApiUrl } from '../../utils/getMercuryUrl'
import { createContextLogger } from '../../utils/logger'

const businessCardLogger = createContextLogger('BusinessCardService')

export interface BusinessCardData {
  company_name?: string
  industry?: string
  business_type_id?: string
  revenue?: number
  employee_count?: number
  country_code?: string
  founding_year?: number
  description?: string
  city?: string
  business_highlights?: string
  reason_for_selling?: string
}

export interface BusinessCardService {
  fetchBusinessCard(token: string): Promise<BusinessCardData>
  transformToValuationRequest(businessCard: BusinessCardData): Partial<ValuationRequest>
}

class BusinessCardServiceImpl implements BusinessCardService {
  /**
   * Fetch business card data from backend using token
   * Calls GET /api/business-cards?token=... endpoint
   */
  async fetchBusinessCard(token: string): Promise<BusinessCardData> {
    try {
      businessCardLogger.info('Fetching business card', {
        token: token.substring(0, 8) + '...',
      })

      // Call backend endpoint: GET /api/business-cards?token=...
      const url = `${getApiUrl()}/api/business-cards?token=${token}`

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for auth
      })

      if (!response.ok) {
        if (response.status === 404) {
          businessCardLogger.warn('Business card not found', {
            token: token.substring(0, 8) + '...',
          })
          return {} // Return empty - graceful degradation
        }
        throw new Error(`Failed to fetch business card: ${response.statusText}`)
      }

      const businessCard = await response.json()

      businessCardLogger.info('Business card fetched successfully', {
        hasData: !!businessCard,
        hasCompanyName: !!businessCard.company_name,
      })

      return businessCard
    } catch (error) {
      businessCardLogger.error('Failed to fetch business card', {
        error: error instanceof Error ? error.message : 'Unknown error',
        token: token.substring(0, 8) + '...',
      })
      // Return empty instead of throwing - graceful degradation
      return {}
    }
  }

  /**
   * Transform business card data to ValuationRequest format
   * Field mapping configuration allows extensibility without modification (OCP)
   */
  transformToValuationRequest(businessCard: BusinessCardData): Partial<ValuationRequest> {
    businessCardLogger.info('Transforming business card to valuation request', {
      hasCompanyName: !!businessCard.company_name,
      hasIndustry: !!businessCard.industry,
      hasRevenue: businessCard.revenue != null && Number.isFinite(businessCard.revenue),
    })

    const valuationRequest: Partial<ValuationRequest> = {}

    // Map simple fields
    if (businessCard.company_name) {
      valuationRequest.company_name = businessCard.company_name
    }

    if (businessCard.industry) {
      valuationRequest.industry = businessCard.industry as IndustryCode
    }

    if (businessCard.business_type_id) {
      valuationRequest.business_type_id = businessCard.business_type_id
    }

    if (businessCard.country_code) {
      valuationRequest.country_code = businessCard.country_code
    } else {
      // Default to Belgium if not provided
      valuationRequest.country_code = 'BE'
    }

    if (businessCard.employee_count !== undefined) {
      valuationRequest.number_of_employees = businessCard.employee_count
    }

    if (businessCard.founding_year) {
      valuationRequest.founding_year = businessCard.founding_year
    }

    if (businessCard.description) {
      valuationRequest.business_description = businessCard.description
    }

    if (businessCard.city) {
      valuationRequest.city = businessCard.city
    }

    if (businessCard.business_highlights) {
      valuationRequest.business_highlights = businessCard.business_highlights
    }

    if (businessCard.reason_for_selling) {
      valuationRequest.reason_for_selling = businessCard.reason_for_selling
    }

    // Revenue goes into current_year_data (including 0 — pre-revenue / explicit zero).
    const rev = businessCard.revenue
    if (rev != null && Number.isFinite(rev)) {
      const currentYear = getCurrentFilingYear()

      valuationRequest.current_year_data = {
        year: currentYear,
        revenue: rev,
        ebitda: 0, // Will be filled by user unless card gains EBITDA later
      } as YearDataInput
    }

    const fieldCount = Object.keys(valuationRequest).length
    businessCardLogger.info('Business card transformed', {
      fieldCount,
      hasCurrentYearData: !!valuationRequest.current_year_data,
    })

    return valuationRequest
  }
}

// Export singleton instance
export const businessCardService = new BusinessCardServiceImpl()
