/**
 * EBITDA Normalization API Service
 *
 * Handles all API interactions for EBITDA normalization feature
 * Supports the first primitive: the normalization bridge (economic truth)
 */

import {
  CreateNormalizationRequest,
  GetNormalizationResponse,
  MarketRatesResponse,
} from '../types/ebitdaNormalization'

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://api.upswitch.app'

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

/**
 * Handle API response and errors
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = 'API request failed'
    let errorDetails

    try {
      const errorData = await response.json()
      errorMessage = errorData.error || errorData.message || errorMessage
      errorDetails = errorData
    } catch {
      // Response not JSON
      errorMessage = `HTTP ${response.status}: ${response.statusText}`
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
   * Get normalization for specific session and year
   */
  async getNormalization(sessionId: string, year: number): Promise<GetNormalizationResponse> {
    const response = await fetch(`${this.baseURL}/api/normalization/${sessionId}/${year}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    return handleResponse<GetNormalizationResponse>(response)
  }

  /**
   * Get all normalizations for a session
   */
  async getAllNormalizations(sessionId: string): Promise<GetNormalizationResponse[]> {
    const response = await fetch(`${this.baseURL}/api/normalization/${sessionId}`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    return handleResponse<GetNormalizationResponse[]>(response)
  }

  /**
   * Create or update normalization
   */
  async saveNormalization(request: CreateNormalizationRequest): Promise<GetNormalizationResponse> {
    const response = await fetch(`${this.baseURL}/api/normalization`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
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
      headers: {
        'Content-Type': 'application/json',
      },
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
      headers: {
        'Content-Type': 'application/json',
      },
    })

    return handleResponse<MarketRatesResponse>(response)
  }
}

// Export singleton instance
export const normalizationService = new EbitdaNormalizationService()
