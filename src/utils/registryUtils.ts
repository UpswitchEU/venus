/**
 * Registry Utility Functions
 *
 * Type-safe utilities for working with registry search results
 */

import type { CompanySearchResult } from '../types/registry'

/**
 * Resolve legal form / rechtsvorm from a registry hit.
 * Titan v2 and KVK may use `legal_form`, camelCase, or Dutch (`rechtsvorm`, `rechtsvormOmschrijving`).
 */
export function pickLegalFormFromRegistryHit(r: Record<string, unknown>): string {
  const candidates = [
    r.legal_form,
    r.legalForm,
    r.rechtsvorm,
    r.rechtsvormOmschrijving,
    r.juridical_form,
    r.juridicalForm,
  ]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return ''
}

/**
 * Type-safe detection of whether a search result is a real company or a suggestion
 *
 * @param result - Search result to check
 * @returns true if this is a real company, false if it's a suggestion or error
 */
export const isRealCompany = (result: CompanySearchResult): boolean => {
  // Primary check: explicit result_type field (most reliable)
  if (result.result_type === 'COMPANY') return true
  if (result.result_type === 'SUGGESTION' || result.result_type === 'ERROR') return false

  // Fallback checks for backwards compatibility
  if (result.company_id?.startsWith('suggestion')) return false
  if (result.status === 'suggestion') return false
  if (result.legal_form === 'Search Suggestion' || result.legal_form === 'Search Help') return false

  // Validate company ID format (country-specific)
  if (result.country_code === 'BE') {
    // Belgian company numbers are 10 digits
    return /^\d{10}$/.test(result.company_id)
  }

  if (result.country_code === 'GB') {
    // UK company numbers are 8 characters (letters and numbers)
    return /^[A-Z0-9]{8}$/.test(result.company_id)
  }

  // Default: assume it's a company if we got here
  return true
}

/**
 * Validate that a company ID has the correct format for its country
 *
 * @param companyId - Company ID to validate
 * @param countryCode - 2-letter country code
 * @returns true if the ID format is valid for the country
 */
export const isValidCompanyId = (companyId: string, countryCode: string): boolean => {
  if (!companyId || !countryCode) return false

  switch (countryCode) {
    case 'BE':
      // Belgian company numbers: 10 digits (e.g., 0403170701)
      return /^\d{10}$/.test(companyId)

    case 'GB':
      // UK company numbers: 8 characters (e.g., 01234567 or SC123456)
      return /^[A-Z0-9]{8}$/.test(companyId)

    case 'NL':
      // Dutch KvK numbers: 8 digits
      return /^\d{8}$/.test(companyId)

    case 'DE':
      // German HRB numbers: varies, but typically HRB followed by numbers
      return /^[A-Z]{2,3}\s?\d+$/.test(companyId) || /^\d{5,}$/.test(companyId)

    case 'FR':
      // French SIREN: 9 digits
      return /^\d{9}$/.test(companyId)

    default:
      // For unknown countries, just check it's not a suggestion ID
      return !companyId.startsWith('suggestion')
  }
}

/**
 * Get a user-friendly error message based on why a company wasn't found
 *
 * @param companyName - The company name that was searched
 * @param countryCode - The country that was searched
 * @returns A helpful error message with suggestions
 */
export const getNotFoundMessage = (companyName: string, countryCode: string): string => {
  const countryName = getCountryName(countryCode)

  return `⚠️ I couldn't find "${companyName}" in the ${countryName} registry.

**This could mean:**
• The company name spelling is slightly different
• It's a very new company (hasn't filed accounts yet)
• It's not a registered limited company (e.g., sole trader)
• The registry is temporarily unavailable

**What would you like to do?**
1. Try with the exact company name or registration number
2. Try a different country
3. Enter your financials manually instead`
}

/**
 * Get country name from country code
 */
export const getCountryName = (countryCode: string): string => {
  const countryNames: Record<string, string> = {
    BE: 'Belgium',
    GB: 'United Kingdom',
    NL: 'Netherlands',
    DE: 'Germany',
    FR: 'France',
    ES: 'Spain',
    IT: 'Italy',
  }

  return countryNames[countryCode] || countryCode
}

/**
 * Get country flag emoji from country code
 */
export const getCountryFlag = (countryCode: string): string => {
  const flags: Record<string, string> = {
    BE: '🇧🇪',
    GB: '🇬🇧',
    NL: '🇳🇱',
    DE: '🇩🇪',
    FR: '🇫🇷',
    ES: '🇪🇸',
    IT: '🇮🇹',
  }

  return flags[countryCode] || '🌍'
}

/**
 * Categorize error types for better error handling
 */
export enum RegistryErrorType {
  NOT_FOUND = 'NOT_FOUND',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  RATE_LIMITED = 'RATE_LIMITED',
  SERVER_ERROR = 'SERVER_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  UNSUPPORTED_COUNTRY = 'UNSUPPORTED_COUNTRY',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Categorize an error for better user messaging
 */
export const categorizeError = (error: any): RegistryErrorType => {
  if (!error) return RegistryErrorType.UNKNOWN_ERROR

  // Check HTTP status codes
  if (error.response?.status === 404) return RegistryErrorType.NOT_FOUND
  if (error.response?.status === 429) return RegistryErrorType.RATE_LIMITED
  if (error.response?.status >= 500) return RegistryErrorType.SERVER_ERROR
  if (error.response?.status === 400) return RegistryErrorType.INVALID_INPUT

  // Check error codes
  if (error.code === 'ECONNABORTED') return RegistryErrorType.TIMEOUT
  if (error.code === 'ERR_NETWORK') return RegistryErrorType.NETWORK_ERROR

  // Check error messages
  if (error.message?.includes('Unsupported country')) return RegistryErrorType.UNSUPPORTED_COUNTRY
  if (error.message?.includes('timeout')) return RegistryErrorType.TIMEOUT
  if (error.message?.includes('network')) return RegistryErrorType.NETWORK_ERROR

  return RegistryErrorType.UNKNOWN_ERROR
}

/**
 * Get user-friendly error message based on error type
 */
export const getErrorMessage = (errorType: RegistryErrorType, context?: string): string => {
  switch (errorType) {
    case RegistryErrorType.NOT_FOUND:
      return `Company not found in the registry. ${context || 'Please check the company name and try again.'}`

    case RegistryErrorType.NETWORK_ERROR:
      return 'Network connection error. Please check your internet connection and try again.'

    case RegistryErrorType.TIMEOUT:
      return 'Request timed out. The registry might be slow or unavailable. Please try again.'

    case RegistryErrorType.RATE_LIMITED:
      return 'Too many requests. Please wait a moment and try again.'

    case RegistryErrorType.SERVER_ERROR:
      return 'Registry server error. The service might be temporarily unavailable. Please try again later.'

    case RegistryErrorType.INVALID_INPUT:
      return `Invalid input. ${context || 'Please check your company name or registration number.'}`

    case RegistryErrorType.UNSUPPORTED_COUNTRY:
      return `This country is not yet supported. ${context || 'Currently only Belgium (BE) is supported.'}`

    case RegistryErrorType.UNKNOWN_ERROR:
    default:
      return `An unexpected error occurred. ${context || 'Please try again or contact support.'}`
  }
}
