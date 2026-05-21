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
import { pickLegalFormFromRegistryHit } from '../../utils/registryUtils'
import { RegistryCache } from './cache'
import {
  type CompanyFinancialData,
  type CompanySearchResponse,
  REGISTRY_SEARCH_CLIENT_TIMEOUT_MS,
  type RegistryServiceConfig,
  type SearchSuggestion,
} from './types'

export class RegistryService {
  private cache: RegistryCache
  private baseURL: string
  private timeout: number
  private pendingRequests: Map<string, Promise<CompanySearchResponse | CompanyFinancialData>>

  constructor(config?: Partial<RegistryServiceConfig>) {
    // Use local Next.js API proxy route to avoid CORS issues
    // This proxies to Titan backend API (similar to Mercury pattern)
    this.baseURL = config?.baseURL || ''
    this.timeout = config?.timeout || REGISTRY_SEARCH_CLIENT_TIMEOUT_MS
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
    // Validate input (min 2 chars to support short names e.g. AX, AB, and KBO prefix)
    if (!query || query.trim().length < 2) {
      throw new ValidationError('Query must be at least 2 characters long', { query, country })
    }

    if (limit < 1 || limit > 200) {
      throw new ValidationError('Limit must be between 1 and 200', { limit })
    }

    const displayQuery = this.normalizeDisplayQuery(query)
    const normalizedQuery = this.normalizeSearchKey(displayQuery)

    const cacheKey = `search:${country}:${normalizedQuery}:${limit}`

    // Check cache first
    const cached = this.cache.get<CompanySearchResponse>(cacheKey)
    if (cached) {
      serviceLogger.debug('Using cached search results', { query, country })
      return cached
    }

    // Check for pending request
    const existingSearch = this.pendingRequests.get(cacheKey)
    if (existingSearch) {
      serviceLogger.debug('Request already pending, waiting for result', { query, country })
      return existingSearch as Promise<CompanySearchResponse>
    }

    // Create new request
    const requestPromise = this._searchCompanies(displayQuery, country, limit, signal)
    this.pendingRequests.set(cacheKey, requestPromise)

    try {
      const result = await requestPromise
      if (result.success) {
        this.cache.set(cacheKey, result)
      }
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

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let safetyNetTimedOut = false
    let onExternalAbort: (() => void) | undefined

    const clearSafetyTimeout = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
        timeoutId = undefined
      }
    }

    const detachExternalListener = () => {
      if (onExternalAbort && externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort)
        onExternalAbort = undefined
      }
    }

    try {
      serviceLogger.info('Searching companies', { requestId, query, country, limit })

      const controller = new AbortController()
      timeoutId = setTimeout(() => {
        safetyNetTimedOut = true
        controller.abort()
      }, this.timeout)

      if (externalSignal) {
        if (externalSignal.aborted) {
          clearSafetyTimeout()
          return { success: false, results: [], error: 'Aborted', requestId }
        }
        onExternalAbort = () => controller.abort()
        externalSignal.addEventListener('abort', onExternalAbort, { once: true })
      }

      // Use local Next.js proxy route (proxies to Titan /api/v2/registry/search via Venus BFF)
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

      clearSafetyTimeout()
      detachExternalListener()

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

      // Proxy may return 200 with success:false (e.g. JSON parse error fallback)
      if (data && data.success === false) {
        return {
          success: false,
          results: [],
          error: data.error || 'Search failed',
          requestId,
        }
      }

      serviceLogger.info('Search successful', {
        requestId,
        resultsCount: data.results?.length || data.length || 0,
        timestamp: new Date().toISOString(),
      })

      // Handle both array response and object with results property
      const rawResults = Array.isArray(data) ? data : data.results || []
      // Normalize: Titan returns kbo_number; Venus expects registration_number.
      // Legal form: BE uses legal_form; NL/KVK may only send rechtsvorm / rechtsvormOmschrijving.
      const results = rawResults.map((r: Record<string, unknown>) => {
        const spread = { ...r }
        const registration_number = String(spread.registration_number ?? spread.kbo_number ?? '')
        const legal_form =
          pickLegalFormFromRegistryHit(spread) ||
          (typeof spread.legal_form === 'string' ? spread.legal_form : '')
        return {
          ...spread,
          registration_number,
          legal_form,
        }
      })

      return {
        success: true,
        results,
        requestId,
        total_results: data.total_results || results.length,
        search_time_ms: data.search_time_ms || 0,
        registry_name: data.registry_name || 'Unknown Registry',
      }
    } catch (error) {
      clearSafetyTimeout()
      detachExternalListener()

      if (error instanceof DOMException && error.name === 'AbortError') {
        if (externalSignal?.aborted) {
          throw error
        }
        if (safetyNetTimedOut) {
          return {
            success: false,
            results: [],
            error: 'Search timed out. Please try again.',
            requestId,
          }
        }
        return {
          success: false,
          results: [],
          error: 'Search was interrupted. Please try again.',
          requestId,
        }
      }

      serviceLogger.error('Search error', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        query,
        country,
      })

      if (
        error instanceof RegistryError ||
        error instanceof NetworkError ||
        error instanceof TimeoutError
      ) {
        throw error
      }

      return {
        success: false,
        results: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId,
      }
    }
  }

  private normalizeDisplayQuery(query: string): string {
    const trimmed = query.trim().replace(/\s+/g, ' ')
    return trimmed.length > 30 ? trimmed.slice(0, 30) : trimmed
  }

  private normalizeSearchKey(query: string): string {
    return query
      .normalize('NFKC')
      .toLocaleLowerCase('en')
      .replace(/[^\p{L}\p{N}]+/gu, '')
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
    const cached = this.cache.get<CompanyFinancialData>(cacheKey)
    if (cached) {
      serviceLogger.debug('Using cached financial data', { companyId, country })
      return cached
    }

    // Check for pending request
    const existingFinancials = this.pendingRequests.get(cacheKey)
    if (existingFinancials) {
      serviceLogger.debug('Financial request already pending', { companyId, country })
      return existingFinancials as Promise<CompanyFinancialData>
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

    const controller = new AbortController()
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    try {
      serviceLogger.info('Fetching company financials', { requestId, companyId, country })

      timeoutId = setTimeout(() => controller.abort(), this.timeout)

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

      if (
        error instanceof RegistryError ||
        error instanceof NetworkError ||
        error instanceof TimeoutError
      ) {
        throw error
      }

      throw new RegistryError(error instanceof Error ? error.message : 'Unknown error', 500, {
        companyId,
        country,
        requestId,
      })
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
      }
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

    const controller = new AbortController()
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    try {
      serviceLogger.debug('Checking service health', { requestId })

      timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${this.baseURL}/api/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })

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
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId)
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
