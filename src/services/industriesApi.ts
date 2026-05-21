/**
 * Industries API Service
 *
 * Service for fetching and caching valid industry classifications
 * from the valuation engine API.
 */

import { getApiUrl } from '../utils/getMercuryUrl'
import { generalLogger } from '../utils/logger'

export interface IndustryListResponse {
  industries: string[]
  count: number
  last_updated: string
  description: string
}

export interface IndustryStatsResponse {
  most_common: Array<{ industry: string; count: number }>
  unknown_values: Array<{ industry: string; count: number }>
  total_requests: number
  total_unknown: number
  unknown_rate: number
  last_updated: string
}

// Cache configuration
const CACHE_CONFIG = {
  VERSION: '1.0.0',
  TTL: 5 * 60 * 1000, // 5 minutes
  KEY: 'industries_cache',
}

interface CacheEntry {
  data: IndustryListResponse
  timestamp: number
  version: string
}

// Fallback industry list (core industries if API fails)
const FALLBACK_INDUSTRIES = [
  'technology',
  'manufacturing',
  'retail',
  'services',
  'healthcare',
  'finance',
  'real_estate',
  'hospitality',
  'construction',
  'food-production',
  'food-services',
  'professional-services',
  'other',
]

/**
 * Normalize API response to expected format
 * Handles both array response (Python backend) and object response (structured)
 */
function normalizeIndustriesResponse(data: unknown): IndustryListResponse {
  // If already in correct format, return as-is
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (!Array.isArray(record.industries)) {
      // Fall through to the array/fallback handling below.
    } else {
      return {
        industries: record.industries.filter(
          (industry): industry is string => typeof industry === 'string'
        ),
        count: typeof record.count === 'number' ? record.count : record.industries.length,
        last_updated:
          typeof record.last_updated === 'string' ? record.last_updated : new Date().toISOString(),
        description:
          typeof record.description === 'string'
            ? record.description
            : 'Valid industry classifications',
      }
    }
  }

  // If it's an array (Python backend format), wrap it
  if (Array.isArray(data)) {
    const industries = data.filter((industry): industry is string => typeof industry === 'string')
    return {
      industries,
      count: industries.length,
      last_updated: new Date().toISOString(),
      description: 'Valid industry classifications from database',
    }
  }

  // Invalid format - use fallback
  generalLogger.warn('Invalid industries response format, using fallback', { data })
  return {
    industries: FALLBACK_INDUSTRIES,
    count: FALLBACK_INDUSTRIES.length,
    last_updated: new Date().toISOString(),
    description: 'Fallback industry list (API returned invalid format)',
  }
}

class IndustriesApiService {
  private cache: CacheEntry | null = null
  private pendingRequest: Promise<IndustryListResponse> | null = null

  /**
   * Get valid industries with caching
   */
  async getIndustries(): Promise<IndustryListResponse> {
    // Check cache first
    if (this.cache && this.isCacheValid()) {
      return this.cache.data
    }

    // If there's already a pending request, wait for it
    if (this.pendingRequest) {
      return this.pendingRequest
    }

    // Make new request
    this.pendingRequest = this.fetchIndustries()

    try {
      const result = await this.pendingRequest
      this.cache = {
        data: result,
        timestamp: Date.now(),
        version: CACHE_CONFIG.VERSION,
      }
      return result
    } finally {
      this.pendingRequest = null
    }
  }

  /**
   * Get industry usage statistics
   */
  async getIndustryStats(): Promise<IndustryStatsResponse> {
    try {
      const response = await fetch(`${getApiUrl()}/api/v1/industries/stats`)

      if (!response.ok) {
        throw new Error(`Failed to fetch industry stats: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      generalLogger.error('Error fetching industry stats', { error })
      throw error
    }
  }

  /**
   * Check if industry is valid
   */
  async isValidIndustry(industry: string): Promise<boolean> {
    if (!industry || typeof industry !== 'string') {
      return false
    }

    try {
      const industriesData = await this.getIndustries()

      // Validate response structure
      if (
        !industriesData ||
        !industriesData.industries ||
        !Array.isArray(industriesData.industries)
      ) {
        generalLogger.warn('Invalid industries data structure, using fallback for validation')
        return FALLBACK_INDUSTRIES.includes(industry.toLowerCase())
      }

      return industriesData.industries.includes(industry.toLowerCase())
    } catch (error) {
      generalLogger.error('Error validating industry', { error, industry })
      // Use fallback list for validation on error
      return FALLBACK_INDUSTRIES.includes(industry.toLowerCase())
    }
  }

  /**
   * Get industry suggestions based on partial input
   */
  async getIndustrySuggestions(partial: string): Promise<string[]> {
    if (!partial || typeof partial !== 'string') {
      return []
    }

    try {
      const industriesData = await this.getIndustries()

      // Validate response structure
      if (
        !industriesData ||
        !industriesData.industries ||
        !Array.isArray(industriesData.industries)
      ) {
        generalLogger.warn('Invalid industries data structure, using fallback for suggestions')
        const lowerPartial = partial.toLowerCase()
        return FALLBACK_INDUSTRIES.filter((industry) => industry.includes(lowerPartial)).slice(
          0,
          10
        )
      }

      const lowerPartial = partial.toLowerCase()
      return industriesData.industries
        .filter((industry) => industry.includes(lowerPartial))
        .slice(0, 10) // Limit to 10 suggestions
    } catch (error) {
      generalLogger.error('Error getting industry suggestions', { error, query: partial })
      // Return fallback suggestions on error
      const lowerPartial = partial.toLowerCase()
      return FALLBACK_INDUSTRIES.filter((industry) => industry.includes(lowerPartial)).slice(0, 10)
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache = null
    this.pendingRequest = null
  }

  /**
   * Check if cache is valid
   */
  private isCacheValid(): boolean {
    if (!this.cache) return false

    const now = Date.now()
    const age = now - this.cache.timestamp

    return age < CACHE_CONFIG.TTL && this.cache.version === CACHE_CONFIG.VERSION
  }

  /**
   * Fetch industries from API
   */
  private async fetchIndustries(): Promise<IndustryListResponse> {
    try {
      const response = await fetch(`${getApiUrl()}/api/v1/industries`)

      if (!response.ok) {
        throw new Error(`Failed to fetch industries: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      // Normalize response (handle both array and object formats)
      const normalized = normalizeIndustriesResponse(data)

      // Validate normalized response
      if (
        !normalized.industries ||
        !Array.isArray(normalized.industries) ||
        normalized.industries.length === 0
      ) {
        generalLogger.warn('API returned empty or invalid industries list, using fallback')
        return normalizeIndustriesResponse(FALLBACK_INDUSTRIES)
      }

      return normalized
    } catch (error) {
      generalLogger.error('Error fetching industries', {
        message: error instanceof Error ? error.message : 'Unknown error',
        status:
          error && typeof error === 'object' && 'response' in error
            ? (error as { response?: { status?: number } }).response?.status
            : undefined,
        url: `${getApiUrl()}/api/v1/industries`,
      })

      // Return fallback on error to prevent complete failure
      generalLogger.info('Using fallback industry list due to API error')
      return normalizeIndustriesResponse(FALLBACK_INDUSTRIES)
    }
  }
}

// Export singleton instance
export const industriesApi = new IndustriesApiService()
