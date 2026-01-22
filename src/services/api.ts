import axios, { AxiosInstance } from 'axios'
import type {
  BusinessTypeAnalysis,
  CompanyLookupResult,
  ConversationContext,
  ConversationStartRequest,
  ConversationStartResponse,
  ConversationStepRequest,
  ConversationStepResponse,
  MethodologyRecommendation,
  OwnerProfileRequest,
  OwnerProfileResponse,
  QuickValuationRequest,
  ValuationRequest,
  ValuationResponse,
} from '../types/valuation'
import { apiLogger } from '../utils/logger'

class ValuationAPI {
  private client: AxiosInstance

  constructor() {
    // CRITICAL FIX: Use backend URL (Node.js backend) not Python engine directly
    // Bank-Grade Principle: Reliability - All requests go through backend for proper CORS and auth handling
    // WHAT: Uses backend URL which proxies to Python engine
    // WHY: Backend handles CORS, authentication, rate limiting, and error handling
    // HOW: Uses VITE_BACKEND_URL or VITE_API_BASE_URL environment variables, falls back to Railway backend URL
    // WHEN: When creating API client for all valuation and conversation endpoints
    this.client = axios.create({
      baseURL:
        process.env.NEXT_PUBLIC_BACKEND_URL ||
        process.env.NEXT_PUBLIC_API_BASE_URL ||
        'https://api.upswitch.app',
      // BANK-GRADE: Cascading Timeout Chain
      // Venus (85s) > Titan (80s) > ValuationIQ (70s)
      // This ensures proper error propagation - ValuationIQ times out first,
      // Titan catches and logs it, Venus receives structured error before its timeout
      timeout: 85000, // 85 seconds - part of cascading timeout chain
      headers: {
        'Content-Type': 'application/json',
      },
    })

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        apiLogger.error('API Error', {
          error: error.response?.data || error.message,
          status: error.response?.status,
        })
        throw error
      }
    )
  }

  // Health check
  async health(): Promise<{ status: string }> {
    const response = await this.client.get('/health')
    return response.data
  }

  // Quick valuation (fast multiples-only calculation for live preview)
  async quickValuation(data: QuickValuationRequest): Promise<ValuationResponse> {
    const response = await this.client.post('/api/valuations/quick', data)
    return response.data
  }

  // Comprehensive valuation
  async calculateValuation(data: ValuationRequest): Promise<ValuationResponse> {
    const response = await this.client.post('/api/v1/valuation/calculate', data)
    return response.data
  }

  /**
   * Lookup company by name using registry service
   *
   * This uses the registry service to search for companies and optionally
   * fetch financial data. Connects to Node.js backend which proxies to Python registry.
   *
   * KBO (Belgian Company Registry) check is performed automatically for BE companies.
   *
   * @param name - Company name to lookup
   * @param country - Country code (default: 'BE' for KBO)
   * @returns CompanyLookupResult with company information
   */
  async lookupCompany(name: string, country: string = 'BE'): Promise<CompanyLookupResult> {
    try {
      // Import registry service dynamically to avoid circular dependencies
      const { registryService } = await import('./registry/registryService')

      // Search for companies using registry service (KBO for Belgium)
      const searchResponse = await registryService.searchCompanies(name, country, 1)

      if (!searchResponse.success || searchResponse.results.length === 0) {
        // Return basic result even if not found
        return {
          name,
          industry: '',
          country,
        }
      }

      // Get best match
      const bestMatch = searchResponse.results[0]

      // Optionally fetch financial data if company ID is available
      let financialData = null
      if (bestMatch.company_id && bestMatch.company_id.length > 3) {
        try {
          financialData = await registryService.getCompanyFinancials(bestMatch.company_id, country)
        } catch (error) {
          apiLogger.debug('Financial data not available for company', {
            companyId: bestMatch.company_id,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
          // Continue without financial data
        }
      }

      // Map registry data to CompanyLookupResult format
      const latestFinancials = financialData?.filing_history?.[0]

      return {
        name: bestMatch.company_name,
        industry: financialData?.industry_description || bestMatch.legal_form || '',
        country: bestMatch.country_code || country,
        founding_year: financialData?.founding_year,
        employees: financialData?.employees,
        business_model: undefined, // Not available from registry
        revenue: latestFinancials?.revenue,
        description: financialData?.industry_description,
      }
    } catch (error) {
      apiLogger.error('Company lookup failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        name,
        country,
      })

      // Return basic result on error
      return {
        name,
        industry: '',
        country,
      }
    }
  }

  // =============================================================================
  // INTELLIGENT CONVERSATION API
  // =============================================================================

  // Start intelligent conversation
  // NOW USES: Intelligent Triage System with structured flow (matches manual form)
  async startConversation(data: ConversationStartRequest): Promise<ConversationStartResponse> {
    // Use intelligent conversation endpoint with structured flow
    const response = await this.client.post('/api/v1/intelligent-conversation/start', data)
    return response.data
  }

  // Process conversation step
  async conversationStep(data: ConversationStepRequest): Promise<ConversationStepResponse> {
    // Continue using streaming endpoint for conversation steps
    const response = await this.client.post('/api/v1/intelligent-conversation/step', data)
    return response.data
  }

  // Get conversation context
  async getConversationContext(sessionId: string): Promise<ConversationContext> {
    const response = await this.client.get(`/api/v1/intelligent-conversation/context/${sessionId}`)
    return response.data
  }

  // Submit owner profile
  async submitOwnerProfile(data: OwnerProfileRequest): Promise<OwnerProfileResponse> {
    const response = await this.client.post('/api/v1/intelligent-conversation/owner-profile', data)
    return response.data
  }

  // =============================================================================
  // BUSINESS TYPE ANALYSIS API
  // =============================================================================

  // Get business types
  async getBusinessTypes(): Promise<BusinessTypeAnalysis[]> {
    const response = await this.client.get('/api/v1/business-types')
    return response.data
  }

  // Get methodology recommendation
  async getMethodologyRecommendation(
    businessContext: Partial<ValuationRequest>
  ): Promise<MethodologyRecommendation> {
    const response = await this.client.post('/api/v1/methodology-recommendation', businessContext)
    return response.data
  }

  // Analyze business type
  async analyzeBusinessType(
    businessContext: Partial<ValuationRequest>
  ): Promise<BusinessTypeAnalysis> {
    const response = await this.client.post('/api/v1/analyze', businessContext)
    return response.data
  }
}

export const valuationAPI = new ValuationAPI()
export const api = valuationAPI
