/**
 * Business Card Service
 *
 * Single Responsibility: Transform business card data from main frontend into ValuationRequest format
 * Open/Closed: Extensible via field mapping configuration
 * Dependency Inversion: Depends on API abstraction
 */

import type {
  BusinessTypeSegmentInput,
  IndustryCode,
  ValuationRequest,
  YearDataInput,
} from '../../types/valuation'
import { normalizeBusinessTypeId } from '../../utils/businessTypeIdAliases'
import { getCurrentFilingYear } from '../../utils/fiscalYear'
import { getApiUrl } from '../../utils/getMercuryUrl'
import { createContextLogger } from '../../utils/logger'
import {
  businessTypeWeightsFromSegments,
  resolveBusinessTypeSegments,
} from '../../utils/normalizeBusinessTypeSegments'

const businessCardLogger = createContextLogger('BusinessCardService')

export interface BusinessCardData {
  company_name?: string
  industry?: string
  business_type_id?: string
  business_type_mix?: BusinessTypeSegmentInput[]
  business_type_segments?: BusinessTypeSegmentInput[]
  business_type_weights?: Record<string, number | string | null | undefined>
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

const LEGACY_CARD_STRING_FIELDS = [
  'company_name',
  'industry',
  'business_type_id',
  'country_code',
  'description',
  'city',
  'business_highlights',
  'reason_for_selling',
] as const

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/**
 * Legacy token cards are presentation/prefill data, not graph-authority
 * artifacts. Keep an explicit allowlist so a syntactically valid forged
 * `company_graph_context` can never hitchhike through this channel.
 */
function sanitizeLegacyBusinessCard(value: unknown): BusinessCardData {
  const record = asRecord(value)
  if (!record) return {}

  const card: BusinessCardData = {}
  for (const key of LEGACY_CARD_STRING_FIELDS) {
    const field = record[key]
    if (typeof field === 'string' && field.trim()) {
      card[key] = field
    }
  }

  for (const key of ['revenue', 'employee_count', 'founding_year'] as const) {
    const field = record[key]
    if (typeof field === 'number' && Number.isFinite(field)) {
      card[key] = field
    }
  }

  if (Array.isArray(record.business_type_mix)) {
    card.business_type_mix = record.business_type_mix as BusinessTypeSegmentInput[]
  }
  if (Array.isArray(record.business_type_segments)) {
    card.business_type_segments = record.business_type_segments as BusinessTypeSegmentInput[]
  }
  const weights = asRecord(record.business_type_weights)
  if (weights) {
    card.business_type_weights = weights as Record<string, number | string | null | undefined>
  }

  return card
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
      const url = `${getApiUrl()}/api/business-cards?token=${encodeURIComponent(token)}`

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

      const businessCard = sanitizeLegacyBusinessCard(await response.json())

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

    const businessTypeSegments = resolveBusinessTypeSegments({
      business_type_segments: businessCard.business_type_segments,
      business_type_mix: businessCard.business_type_mix,
      business_type_weights: businessCard.business_type_weights,
    })
    const primaryBusinessTypeId = businessTypeSegments[0]?.business_type_id
    if (businessTypeSegments.length > 0) {
      valuationRequest.business_type_segments = businessTypeSegments
      valuationRequest.business_type_mix = businessTypeSegments
      valuationRequest.business_type_weights = businessTypeWeightsFromSegments(businessTypeSegments)
    }

    const businessTypeId = normalizeBusinessTypeId(
      businessCard.business_type_id ?? primaryBusinessTypeId
    )
    if (businessTypeId) {
      valuationRequest.business_type_id = businessTypeId
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
