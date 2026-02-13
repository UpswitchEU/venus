/**
 * CompanyLookupService
 *
 * Adapted from Ilara AI MCPChatService for company lookup workflow.
 * Provides simplified API for frontend consumption with business logic layer.
 *
 * Features:
 * - Clean API abstraction
 * - Error recovery
 * - Conversation context management
 */

import { serviceLogger } from '../../utils/logger'
import { registryService } from '../registry/registryService'
import type { CompanyFinancialData, CompanySearchResponse } from '../registry/types'

export interface ChatMessage {
  id: string
  type: 'user' | 'ai' | 'system'
  content: string
  timestamp: Date
  isLoading?: boolean
  companyData?: CompanyFinancialData
  searchResults?: CompanySearchResponse
}

export interface LookupResult {
  success: boolean
  message: string
  companyData?: CompanyFinancialData
  searchResults?: CompanySearchResponse
  needsFinancialInput?: boolean
  error?: string
}

export class CompanyLookupService {
  private conversationId: string | null = null

  constructor() {
    serviceLogger.info('CompanyLookupService initialized')
  }

  /**
   * Process a user message (company name query)
   * Main entry point for company lookup
   */
  async processMessage(message: string, country: string = 'BE'): Promise<LookupResult> {
    const requestId = `lookup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    serviceLogger.debug('Processing message', {
      requestId,
      messagePreview: message.substring(0, 100),
      country,
      timestamp: new Date().toISOString(),
    })

    try {
      // Step 1: Search for company
      const searchResponse = await registryService.searchCompanies(message, country)

      if (!searchResponse.success || searchResponse.results.length === 0) {
        serviceLogger.warn('No companies found', { requestId, message, country })
        return {
          success: false,
          message: `No companies found matching "${message}". Please try:\n• Exact company name\n• Registration number\n• Manual data entry`,
          searchResults: searchResponse,
        }
      }

      // Step 2: Get best match
      const bestMatch = searchResponse.results[0]
      serviceLogger.info('Best match found', {
        requestId,
        companyName: bestMatch.company_name,
        companyId: bestMatch.company_id,
      })

      // Step 3: Validate company ID
      if (!this.isValidCompanyId(bestMatch.company_id, country)) {
        serviceLogger.warn('Mock/suggestion result detected - data sources unavailable', {
          requestId,
        })

        // Filter out invalid suggestions (search strategy suggestions, not real companies)
        const realCompanies = searchResponse.results.filter((result) => {
          // Filter out suggestions that are search instructions
          const isSearchSuggestion =
            result.company_name.toLowerCase().includes('search for') ||
            result.company_name.toLowerCase().includes('try with') ||
            result.company_name.toLowerCase().includes('french') ||
            result.company_name.toLowerCase().includes('dutch') ||
            result.company_name.toLowerCase().includes('english') ||
            result.company_id.startsWith('suggestion_') ||
            result.company_id.startsWith('mock_')

          return !isSearchSuggestion
        })

        // Check if we have real company suggestions to show
        if (realCompanies.length > 0) {
          const suggestionsList = realCompanies
            .slice(0, 5) // Show max 5 suggestions
            .map(
              (result, index) =>
                `${index + 1}. **${result.company_name}**${result.registration_number ? ` (${result.registration_number})` : ''}`
            )
            .join('\n')

          const header =
            realCompanies.length === 1
              ? `I found a possible match for "${message}":`
              : `I found ${realCompanies.length} possible matches for "${message}":`

          return {
            success: false,
            message: `${header}

${suggestionsList}

**Did you mean ${realCompanies.length === 1 ? 'this' : 'one of these'}?**
Please type the exact name or try:
• Use the full legal company name
• Enter the KBO/VAT number
• Switch to **Manual Input** to enter data yourself

💡 **Tip:** Find official names at [kbopub.economie.fgov.be](https://kbopub.economie.fgov.be)`,
            searchResults: { ...searchResponse, results: realCompanies },
          }
        }

        // No suggestions available, show not found message
        return {
          success: false,
          message: `Sorry, I couldn't find **"${message}"** in the official Belgian company registry.

**This might be because:**
• The company name is spelled differently in official records
• It's registered under a different legal name
• It's a subsidiary or trading name (not the parent company)
• The company hasn't filed recent accounts with KBO/BCE
• Data sources are temporarily unavailable

**What you can do:**
1. **Try the full legal name** (e.g., "Delhaize Group SA" not just "Delhaize")
2. **Use the company's VAT or KBO number** if you have it
3. **Switch to Manual Input** and enter the financials yourself

💡 **Tip:** You can find a company's official name at [kbopub.economie.fgov.be](https://kbopub.economie.fgov.be)`,
        }
      }

      // Step 4: Fetch financial data
      try {
        const financialData = await registryService.getCompanyFinancials(
          bestMatch.company_id,
          country
        )

        serviceLogger.info('Company lookup complete', {
          requestId,
          companyName: financialData.company_name,
          yearsOfData: financialData.filing_history?.length || 0,
        })

        return {
          success: true,
          message: `Found ${financialData.company_name} with ${financialData.filing_history?.length || 0} years of financial data`,
          companyData: financialData,
          searchResults: searchResponse,
        }
      } catch (financialError) {
        serviceLogger.error('Financial data fetch failed', { requestId, error: financialError })

        // Financial data fetch failed, but we still have the company info
        // Create a basic company data object with the search result
        const basicCompanyData: any = {
          company_id: bestMatch.company_id,
          company_name: bestMatch.company_name,
          registration_number: bestMatch.registration_number,
          country_code: bestMatch.country_code,
          legal_form: bestMatch.legal_form,
          address: bestMatch.address,
          website: bestMatch.website,
          status: bestMatch.status,
          filing_history: [], // Empty - no financial data available
          data_source: 'KBO Registry (no financial data)',
          completeness_score: 0.3, // Low score since no financials
        }

        serviceLogger.warn(
          'Returning company with no financial data - will trigger conversational input',
          { requestId }
        )

        return {
          success: true, // Mark as success so frontend transitions to financial input
          message: `Found ${bestMatch.company_name}. Let's collect the financial data.`,
          companyData: basicCompanyData,
          searchResults: searchResponse,
          needsFinancialInput: true, // Flag to indicate financial input needed
        }
      }
    } catch (error) {
      serviceLogger.error('Lookup error', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      })

      return {
        success: false,
        message: `Failed to search for company. Please check your connection and try again.`,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Check if the service is available
   * Adapted from Ilara's health monitoring
   */
  async checkHealth(): Promise<{ available: boolean; status: string; message?: string }> {
    return registryService.checkHealth()
  }

  /**
   * Generate a conversation ID for tracking
   */
  generateConversationId(): string {
    this.conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    return this.conversationId
  }

  /**
   * Get current conversation ID
   */
  getConversationId(): string | null {
    return this.conversationId
  }

  /**
   * Validate company ID format
   * Helper method for pre-flight validation
   */
  private isValidCompanyId(companyId: string, country: string = 'BE'): boolean {
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
