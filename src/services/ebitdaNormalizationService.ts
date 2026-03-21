/**
 * EBITDA Normalization API Service
 *
 * Handles all API interactions for EBITDA normalization feature
 * Supports the first primitive: the normalization bridge (economic truth)
 *
 * CRITICAL: Adds client context headers (X-Client-User-Id, X-Accountant-User-Id,
 * X-Relationship-Id) when in accountant-client flow. Without these, Titan cannot
 * resolve sessions and normalization save fails with "Normalisatie niet opgeslagen".
 */

import {
  CreateNormalizationRequest,
  GetNormalizationResponse,
  MarketRatesResponse,
} from '../types/ebitdaNormalization'
import { useClientContext } from '../stores/clientContext'

// Use Next.js API proxy routes (same-origin) to avoid CORS issues.
// These proxy to Titan's /api/normalization/* endpoints.
const API_BASE_URL = ''

/** Get headers for normalization requests, including client context when in accountant flow */
function getNormalizationHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  try {
    const contextHeaders = useClientContext.getState().getContextHeaders()
    if (contextHeaders && Object.keys(contextHeaders).length > 0) {
      Object.assign(headers, contextHeaders)
    }
  } catch {
    // Non-fatal: client context may not be available (e.g. direct user flow)
  }
  return headers
}

/**
 * API Error with structured response
 */
export class NormalizationAPIError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: any
  ) {
    super(message)
    this.name = 'NormalizationAPIError'
  }
}

/** Nest can return `message` as string or string[]; normalize for toasts and logs. */
function normalizeNestMessage(raw: unknown, depth = 0): string {
  if (depth > 4) return 'API request failed'
  if (raw == null) return 'API request failed'
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x)).filter(Boolean).join('; ')
  }
  if (typeof raw === 'object' && raw !== null && 'message' in raw) {
    return normalizeNestMessage((raw as { message: unknown }).message, depth + 1)
  }
  return String(raw)
}

/**
 * Handle API response and errors
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = 'API request failed'
    let errorDetails: Record<string, unknown> | undefined

    try {
      const errorData = (await response.json()) as Record<string, unknown>
      errorDetails = errorData
      const raw =
        errorData.message ??
        (typeof errorData.error === 'string' ? errorData.error : undefined) ??
        errorData.error
      errorMessage = normalizeNestMessage(raw)
    } catch {
      // Response not JSON
      errorMessage = `HTTP ${response.status}: ${response.statusText}`
    }

    if (response.status === 404) {
      console.info('[Normalization] No data found for request', { status: 404, url: response.url })
    }

    throw new NormalizationAPIError(response.status, errorMessage, errorDetails)
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null as T
  }

  return response.json()
}

/**
 * EBITDA Normalization Service
 */
export class EbitdaNormalizationService {
  private baseURL: string

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL
  }

  /**
   * Get normalization for specific session and year.
   * Calls via Next.js proxy → Titan VenusNormalizationController.
   */
  async getNormalization(sessionId: string, year: number): Promise<GetNormalizationResponse> {
    try {
      const response = await fetch(`${this.baseURL}/api/normalization/${sessionId}/${year}`, {
        method: 'GET',
        credentials: 'include',
        headers: getNormalizationHeaders(),
      })

      return handleResponse<GetNormalizationResponse>(response)
    } catch (error) {
      // Handle 404 gracefully - session may not have normalizations yet
      if (error instanceof NormalizationAPIError && error.status === 404) {
        throw error // Re-throw so the store can handle it
      }
      throw error
    }
  }

  /**
   * Get all normalizations for a session.
   * Calls via Next.js proxy → Titan VenusNormalizationController.
   */
  async getAllNormalizations(sessionId: string): Promise<GetNormalizationResponse[]> {
    try {
      const response = await fetch(`${this.baseURL}/api/normalization/${sessionId}`, {
        method: 'GET',
        credentials: 'include',
        headers: getNormalizationHeaders(),
      })

      return handleResponse<GetNormalizationResponse[]>(response)
    } catch (error) {
      // Handle 404 gracefully - session may not have normalizations yet
      if (error instanceof NormalizationAPIError && error.status === 404) {
        return []
      }
      throw error
    }
  }

  /**
   * Create or update normalization
   */
  async saveNormalization(request: CreateNormalizationRequest): Promise<GetNormalizationResponse> {
    const response = await fetch(`${this.baseURL}/api/normalization`, {
      method: 'POST',
      credentials: 'include',
      headers: getNormalizationHeaders(),
      body: JSON.stringify(request),
    })

    return handleResponse<GetNormalizationResponse>(response)
  }

  /**
   * Delete normalization (revert to reported EBITDA)
   */
  async deleteNormalization(sessionId: string, year: number): Promise<void> {
    const response = await fetch(`${this.baseURL}/api/normalization/${sessionId}/${year}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: getNormalizationHeaders(),
    })

    return handleResponse<void>(response)
  }

  /**
   * Get market rate suggestions for normalization
   */
  async getMarketRates(
    industry: string,
    revenue?: number,
    location?: string,
    year?: number
  ): Promise<MarketRatesResponse> {
    const params = new URLSearchParams()
    if (revenue !== undefined) params.append('revenue', revenue.toString())
    if (location) params.append('location', location)
    if (year) params.append('year', year.toString())

    const queryString = params.toString()
    const url = `${this.baseURL}/api/normalization/market-rates/${industry}${queryString ? `?${queryString}` : ''}`

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: getNormalizationHeaders(),
    })

    return handleResponse<MarketRatesResponse>(response)
  }
}

// Export singleton instance
export const normalizationService = new EbitdaNormalizationService()
