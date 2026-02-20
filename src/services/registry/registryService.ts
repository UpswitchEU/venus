/**
 * Unified Registry Service
 *
 * Consolidated registry service that replaces multiple fragmented services
 * with a single, well-architected solution.
 */

import {
  ErrorHandler,
  NetworkError,
  RegistryError,
  TimeoutError,
  ValidationError,
} from '../../utils/errors'
import { serviceLogger } from '../../utils/logger'
import { RegistryCache } from './cache'
import type {
  CompanyFinancialData,
  CompanySearchResponse,
  RegistryServiceConfig,
  SearchSuggestion,
} from './types'

export class RegistryService {
  private cache: RegistryCache
  private baseURL: string
  private timeout: number
  private pendingRequests: Map<string, Promise<any>>

  constructor(config?: Partial<RegistryServiceConfig>) {
    // Use local Next.js API proxy route to avoid CORS issues
    // This proxies to Titan backend API (similar to Mercury pattern)
    this.baseURL = config?.baseURL || ''
    this.timeout = config?.timeout || 6000
    this.cache = new RegistryCache(config?.maxCacheSize, config?.cacheTTL)
    this.pendingRequests = new Map()

    serviceLogger.info('RegistryService initialized', {
      baseURL: this.baseURL || '(relative paths)',
      timeout: this.timeout,
      cacheConfig: this.cache.getStats(),
    })
  }

  /**
   * Search for companies by name.
   * Accepts optional AbortSignal to cancel in-flight requests (e.g. on rapid typing).
   */
  async searchCompanies(
    query: string,
    country: string = 'BE',
    limit: number = 10,
    signal?: AbortSignal
  ): Promise<CompanySearchResponse> {
    // Validate input
    if (!query || query.trim().length < 3) {
      throw new ValidationError('Query must be at least 3 characters long', { query, country })
    }

    if (limit < 1 || limit > 200) {
      throw new ValidationError('Limit must be between 1 and 200', { limit })
    }

    const cacheKey = `search:${country}:${query}:${limit}`

    // Check cache first
    const cached = this.cache.get(cacheKey)
    if (cached) {
      serviceLogger.debug('Using cached search results', { query, country })
      return cached
    }

    // Check for pending request
    if (this.pendingRequests.has(cacheKey)) {
      serviceLogger.debug('Request already pending, waiting for result', { query, country })
      return this.pendingRequests.get(cacheKey)!
    }

    // Create new request
    const requestPromise = this._searchCompanies(query, country, limit, signal)
    this.pendingRequests.set(cacheKey, requestPromise)

    try {
      const result = await requestPromise
      this.cache.set(cacheKey, result)
      return result
    } catch (error) {
      // Handle error with recovery
      const handled = ErrorHandler.handle(error as Error, { query, country, limit })
      if (handled.canRetry) {
        serviceLogger.warn('Retrying search after error', {
          query,
          country,
          error: handled.message,
        })
        // Could implement retry logic here
      }
      throw error
    } finally {
      this.pendingRequests.delete(cacheKey)
    }
  }

  /**
   * Internal search implementation.
   * Uses caller's AbortSignal when provided; applies timeout as safety net.
   */
  private async _searchCompanies(
    query: string,
    country: string,
    limit: number,
    externalSignal?: AbortSignal
  ): Promise<CompanySearchResponse> {
    const requestId = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    try {
      serviceLogger.info('Searching companies', { requestId, query, country, limit })

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)
      if (externalSignal) {
        externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
      }

      // Use local Next.js proxy route (proxies to Titan /api/v1/registry/search)
      const response = await fetch(`${this.baseURL}/api/registry/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          company_name: query,
          country_code: country,
          limit,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        serviceLogger.error('Search request failed', {
          requestId,
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        })

        throw new RegistryError(
          `Search failed: ${response.statusText} - ${errorText}`,
          response.status,
          { query, country, requestId }
        )
      }

      const data = await response.json()
      serviceLogger.info('Search successful', {
        requestId,
        resultsCount: data.results?.length || data.length || 0,
        timestamp: new Date().toISOString(),
      })

      // Handle both array response and object with results property
      const results = Array.isArray(data) ? data : data.results || []

      return {
        success: true,
        results,
        requestId,
        total_results: data.total_results || results.length,
        search_time_ms: data.search_time_ms || 0,
        registry_name: data.registry_name || 'Unknown Registry',
      }
    } catch (error) {
      serviceLogger.error('Search error', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        query,
        country,
      })

      // Handle error and determine if it should be thrown or returned
      if (
        error instanceof RegistryError ||
        error instanceof NetworkError ||
        error instanceof TimeoutError
      ) {
        throw error
      }

      // For unknown errors, return failure response
      return {
        success: false,
        results: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId,
      }
    }
  }

  /**
   * Fetch company financial data
   */
  async getCompanyFinancials(
    companyId: string,
    country: string = 'BE'
  ): Promise<CompanyFinancialData> {
    // Validate input
    if (!companyId || companyId.trim().length === 0) {
      throw new ValidationError('Company ID is required', { companyId, country })
    }

    const cacheKey = `financials:${country}:${companyId}`

    // Check cache first
    const cached = this.cache.get(cacheKey)
    if (cached) {
      serviceLogger.debug('Using cached financial data', { companyId, country })
      return cached
    }

    // Check for pending request
    if (this.pendingRequests.has(cacheKey)) {
      serviceLogger.debug('Financial request already pending', { companyId, country })
      return this.pendingRequests.get(cacheKey)!
    }

    // Create new request
    const requestPromise = this._getCompanyFinancials(companyId, country)
    this.pendingRequests.set(cacheKey, requestPromise)

    try {
      const result = await requestPromise
      this.cache.set(cacheKey, result)
      return result
    } catch (error) {
      // Handle error with recovery
      const handled = ErrorHandler.handle(error as Error, { companyId, country })
      if (handled.canRetry) {
        serviceLogger.warn('Retrying financial fetch after error', {
          companyId,
          country,
          error: handled.message,
        })
        // Could implement retry logic here
      }
      throw error
    } finally {
      this.pendingRequests.delete(cacheKey)
    }
  }

  /**
   * Internal financial data fetch implementation
   */
  private async _getCompanyFinancials(
    companyId: string,
    country: string
  ): Promise<CompanyFinancialData> {
    const requestId = `financials_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    try {
      serviceLogger.info('Fetching company financials', { requestId, companyId, country })

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      // Use GET endpoint: /api/v1/registry/company/{company_id}/financials?country_code={country}&years=3
      const url = new URL(
        `${this.baseURL}/api/v1/registry/company/${encodeURIComponent(companyId)}/financials`
      )
      url.searchParams.set('country_code', country)
      url.searchParams.set('years', '3')

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorText = await response.text()
        serviceLogger.error('Financials request failed', {
          requestId,
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        })

        throw new RegistryError(
          `Financials fetch failed: ${response.statusText} - ${errorText}`,
          response.status,
          { companyId, country, requestId }
        )
      }

      const data = await response.json()
      serviceLogger.info('Financials received', {
        requestId,
        companyName: data.company_name,
        yearsOfData: data.filing_history?.length || 0,
        timestamp: new Date().toISOString(),
      })

      return data
    } catch (error) {
      serviceLogger.error('Financials error', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        companyId,
        country,
      })

      // Handle error and determine if it should be thrown or returned
      if (
        error instanceof RegistryError ||
        error instanceof NetworkError ||
        error instanceof TimeoutError
      ) {
        throw error
      }

      // For unknown errors, throw a generic error
      throw new RegistryError(error instanceof Error ? error.message : 'Unknown error', 500, {
        companyId,
        country,
        requestId,
      })
    }
  }

  /**
   * Get search suggestions
   *
   * Note: Backend doesn't currently provide a dedicated suggestions endpoint.
   * This returns empty array - suggestions can be generated client-side from
   * search results if needed in the future.
   */
  async getSearchSuggestions(
    query: string,
    country?: string
  ): Promise<{ suggestions: SearchSuggestion[] }> {
    serviceLogger.debug('Getting search suggestions', { query, country })

    // No backend endpoint available - return empty array
    // Future: Could use searchCompanies() results to generate suggestions
    return {
      suggestions: [],
    }
  }

  /**
   * Check service health
   */
  async checkHealth(): Promise<{ available: boolean; status: string; message?: string }> {
    const requestId = `health_${Date.now()}`

    try {
      serviceLogger.debug('Checking service health', { requestId })

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${this.baseURL}/api/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      const data = await response.json()

      const healthStatus = {
        available: response.ok && data.status === 'healthy',
        status: response.ok ? data.status || 'healthy' : 'error',
        message: data.message,
      }

      serviceLogger.info('Health check completed', { requestId, healthStatus })
      return healthStatus
    } catch (error) {
      serviceLogger.warn('Health check failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      return {
        available: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Service unreachable',
      }
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear()
    serviceLogger.info('Cache cleared')
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats()
  }
}

// Singleton instance
export const registryService = new RegistryService()
