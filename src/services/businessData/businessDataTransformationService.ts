/**
 * Business Data Transformation Service
 *
 * Single Responsibility: Transform business data between different formats
 * SOLID Principles: SRP - Only handles data transformation operations
 *
 * @module services/businessData/businessDataTransformationService
 */

import type {
  BusinessModel,
  ConversationStartRequest,
  ValuationRequest,
} from '../../types/valuation'
import {
  inferBusinessModelFromIndustry,
  inferBusinessModelFromType,
  isValidYear,
  mapToBusinessModel,
} from '../../utils/businessExtractionUtils'
import { serviceLogger } from '../../utils/logger'
import type { BusinessProfileData } from './businessDataTypes'

export class BusinessDataTransformationService {
  /**
   * Transform business profile data to valuation request format
   */
  transformToValuationRequest(businessData: BusinessProfileData): Partial<ValuationRequest> {
    const valuationRequest: Partial<ValuationRequest> = {}

    // Map basic company information
    if (businessData.company_name) {
      valuationRequest.company_name = businessData.company_name
    }

    if (businessData.industry) {
      valuationRequest.industry = businessData.industry
    }

    if (businessData.business_type) {
      valuationRequest.business_type = businessData.business_type
    }

    if (businessData.country) {
      valuationRequest.country_code = businessData.country
    }

    if (businessData.founded_year) {
      valuationRequest.founding_year = businessData.founded_year
    }

    // Map revenue range to numeric value (if available)
    if (businessData.revenue_range) {
      const revenueValue = this.parseRevenueRange(businessData.revenue_range)
      if (revenueValue) {
        valuationRequest.revenue = revenueValue
      }
    }

    // Map employee count range
    if (businessData.employee_count_range) {
      const employeeCount = this.parseEmployeeRange(businessData.employee_count_range)
      if (employeeCount) {
        valuationRequest.employee_count = employeeCount
      }
    }

    // Add business context
    if (businessData.company_description) {
      valuationRequest.business_description = businessData.company_description
    }

    if (businessData.business_highlights) {
      valuationRequest.business_highlights = businessData.business_highlights
    }

    if (businessData.reason_for_selling) {
      valuationRequest.reason_for_selling = businessData.reason_for_selling
    }

    if (businessData.city) {
      valuationRequest.city = businessData.city
    }

    return valuationRequest
  }

  /**
   * Transform business profile data to conversation start request
   */
  transformToConversationStartRequest(
    businessData: BusinessProfileData,
    userPreferences?: {
      preferred_methodology?: string
      time_commitment?: 'quick' | 'detailed' | 'comprehensive'
      focus_area?: 'valuation' | 'growth' | 'risk' | 'all'
    }
  ): ConversationStartRequest {
    const conversationRequest: ConversationStartRequest = {
      business_context: {
        company_name: businessData.company_name,
        industry: businessData.industry,
        business_model: businessData.business_type,
        country_code: businessData.country || '',
        founding_year: businessData.founded_year,
        business_type_id: businessData.business_type_id,
      },
      user_preferences: userPreferences,
    }

    // Add pre-filled data for fields we already know
    const preFilledData: Record<string, any> = {}

    if (businessData.company_name) {
      preFilledData.company_name = businessData.company_name
    }

    if (businessData.industry) {
      preFilledData.industry = businessData.industry
    }

    if (businessData.business_type) {
      preFilledData.business_type = businessData.business_type
    }

    if (businessData.country) {
      preFilledData.country_code = businessData.country
    }

    if (businessData.founded_year) {
      preFilledData.founding_year = businessData.founded_year
    }

    if (businessData.business_type_id) {
      preFilledData.business_type_id = businessData.business_type_id
      serviceLogger.info('AI Flow: business_type_id included in pre-filled data', {
        business_type_id: businessData.business_type_id,
      })
    }

    if (businessData.years_in_operation) {
      preFilledData.years_in_operation = businessData.years_in_operation
    }

    if (businessData.revenue_range) {
      const revenueValue = this.parseRevenueRange(businessData.revenue_range)
      if (revenueValue) {
        preFilledData.revenue = revenueValue
      }
    }

    if (businessData.employee_count_range) {
      const employeeCount = this.parseEmployeeRange(businessData.employee_count_range)
      if (employeeCount) {
        preFilledData.employee_count = employeeCount
      }
    }

    if (businessData.company_description) {
      preFilledData.business_description = businessData.company_description
    }

    if (businessData.business_highlights) {
      preFilledData.business_highlights = businessData.business_highlights
    }

    if (businessData.city) {
      preFilledData.city = businessData.city
    }

    conversationRequest.pre_filled_data = preFilledData

    return conversationRequest
  }

  /**
   * Extract business model from business profile data
   */
  extractBusinessModel(businessData: BusinessProfileData): BusinessModel | string {
    // Priority 1: Explicit business model from data
    if (businessData.business_model) {
      return mapToBusinessModel(businessData.business_model)
    }

    // Priority 2: Infer from industry
    if (businessData.industry) {
      return inferBusinessModelFromIndustry(businessData.industry)
    }

    // Priority 3: Infer from business type
    if (businessData.business_type) {
      return inferBusinessModelFromType(businessData.business_type)
    }

    // Fallback
    return 'services'
  }

  /**
   * Extract founding year from business profile data
   */
  extractFoundingYear(businessData: BusinessProfileData): number {
    // Priority 1: Explicit founding year
    if (businessData.founded_year && isValidYear(businessData.founded_year)) {
      return businessData.founded_year
    }

    // Priority 2: Calculate from years in operation
    if (businessData.years_in_operation) {
      return new Date().getFullYear() - businessData.years_in_operation
    }

    // Priority 3: Extract from company age
    if (businessData.company_age) {
      return new Date().getFullYear() - businessData.company_age
    }

    // Fallback: 5 years ago
    return new Date().getFullYear() - 5
  }

  /**
   * Parse revenue range string to numeric value
   */
  parseRevenueRange(revenueRange: string): number | null {
    const range = revenueRange.toLowerCase()

    if (range.includes('<€100k') || range.includes('<100k')) {
      return 50000 // Mid-point of <€100K
    } else if (range.includes('€100k-€500k') || range.includes('100k-500k')) {
      return 300000 // Mid-point of €100K-€500K
    } else if (range.includes('€500k-€1m') || range.includes('500k-1m')) {
      return 750000 // Mid-point of €500K-€1M
    } else if (range.includes('€1m-€5m') || range.includes('1m-5m')) {
      return 3000000 // Mid-point of €1M-€5M
    } else if (range.includes('€5m+') || range.includes('5m+')) {
      return 7500000 // Representative value for €5M+
    }

    return null
  }

  /**
   * Parse employee count range to numeric value
   */
  parseEmployeeRange(employeeRange: string): number | null {
    const range = employeeRange.toLowerCase()

    if (range.includes('1-5')) {
      return 3 // Mid-point of 1-5
    } else if (range.includes('6-10')) {
      return 8 // Mid-point of 6-10
    } else if (range.includes('11-25')) {
      return 18 // Mid-point of 11-25
    } else if (range.includes('6-20')) {
      return 13 // Mid-point of 6-20 (legacy range)
    } else if (range.includes('21-50')) {
      return 35 // Mid-point of 21-50
    } else if (range.includes('51-100')) {
      return 75 // Mid-point of 51-100
    } else if (range.includes('100+')) {
      return 150 // Representative value for 100+
    }

    // Fallback: parse min-max pattern and compute midpoint
    const match = range.match(/(\d+)-(\d+)/)
    if (match) {
      const min = parseInt(match[1])
      const max = parseInt(match[2])
      return Math.floor((min + max) / 2)
    }

    return null
  }
}

export const businessDataTransformationService = new BusinessDataTransformationService()
