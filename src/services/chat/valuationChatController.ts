/**
 * ValuationChatController
 *
 * Adapted from Ilara AI ChatController for company valuation workflow.
 * Handles API orchestration for company lookup and financial data fetching.
 *
 * Features:
 * - Comprehensive error handling
 * - Health monitoring
 * - Request/response logging
 * - Graceful fallbacks
 */

import { registryService } from '../../services/registry/registryService'
import type { CompanyFinancialData, CompanySearchResponse } from '../../services/registry/types'
import { apiLogger } from '../../utils/logger'

export interface CompanySearchResult {
  company_id: string
  company_name: string
  result_type: string
  [key: string]: any
}

// Re-export types for backward compatibility
export type { CompanySearchResponse } from '../../services/registry/types'

export interface HealthStatus {
  available: boolean
  status: 'healthy' | 'degraded' | 'error' | 'unknown'
  message?: string
  timestamp: string
  requestId: string
}

export class ValuationChatController {
  constructor() {
    apiLogger.info('ValuationChatController initialized - using unified registry service')
  }

  /**
   * Search for companies by name
   * Delegates to unified registry service
   */
  async searchCompany(query: string, country: string = 'BE'): Promise<CompanySearchResponse> {
    const requestId = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    apiLogger.debug('Searching for company', { requestId, query, country })

    try {
      const response = await registryService.searchCompanies(query, country, 10)
      apiLogger.info('Search successful', {
        requestId,
        resultsCount: response.results.length,
        timestamp: new Date().toISOString(),
      })
      return response
    } catch (error) {
      apiLogger.error('Search error', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      })

      // Graceful fallback - return empty results instead of throwing
      return {
        success: false,
        results: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId,
      }
    }
  }

  /**
   * Fetch company financials by ID
   * Delegates to unified registry service
   */
  async getCompanyFinancials(
    companyId: string,
    country: string = 'BE'
  ): Promise<CompanyFinancialData> {
    const requestId = `financials_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    apiLogger.debug('Fetching financials', { requestId, companyId, country })

    try {
      const data = await registryService.getCompanyFinancials(companyId, country)
      apiLogger.info('Financials received', {
        requestId,
        companyName: data.company_name,
        yearsOfData: data.filing_history?.length || 0,
        timestamp: new Date().toISOString(),
      })
      return data
    } catch (error) {
      apiLogger.error('Financials error', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      })
      throw error
    }
  }

  /**
   * Check backend health
   * Delegates to unified registry service
   */
  async checkHealth(): Promise<HealthStatus> {
    const requestId = `health_${Date.now()}`

    try {
      const healthStatus = await registryService.checkHealth()

      const result: HealthStatus = {
        available: healthStatus.available,
        status: healthStatus.status as 'healthy' | 'degraded' | 'error' | 'unknown',
        message: healthStatus.message,
        timestamp: new Date().toISOString(),
        requestId,
      }

      apiLogger.info('Health check', { requestId, healthStatus: result })
      return result
    } catch (error) {
      apiLogger.warn('Health check failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      return {
        available: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Backend unreachable',
        timestamp: new Date().toISOString(),
        requestId,
      }
    }
  }

  /**
   * Validate company ID format
   * Helper method for pre-flight validation
   */
  isValidCompanyId(companyId: string, country: string = 'BE'): boolean {
    // Check for mock/suggestion IDs first (backend fallback when data unavailable)
    if (
      !companyId ||
      companyId.length < 3 ||
      companyId.startsWith('suggestion_') ||
      companyId.startsWith('mock_')
    ) {
      return false
    }

    // Belgian company numbers are 10 digits with dots: 0123.456.789
    if (country === 'BE') {
      const cleaned = companyId.replace(/\./g, '')
      return /^\d{10}$/.test(cleaned)
    }

    // Default: any non-empty string (for other countries)
    return companyId.length > 0
  }
}
