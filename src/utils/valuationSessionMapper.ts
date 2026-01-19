/**
 * Valuation Session Mapper Utilities
 *
 * Maps ValuationSession data to BusinessInfo format for BusinessProfileCardV4
 */

import type { ValuationResponse, ValuationSession } from '../types/valuation'
import { toNumber } from './decimal'

export interface BusinessInfo {
  name: string
  industry: string
  description: string
  foundedYear: number
  teamSize: string
  revenue: number
  location: string
  isRemote: boolean
  status?: 'active' | 'inactive' | 'draft'
}

/**
 * Helper function to safely get nested value from multiple sources
 */
function getValueFromSources<T>(
  sources: Array<Record<string, any>>,
  paths: string[],
  defaultValue: T
): T {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue

    for (const path of paths) {
      const keys = path.split('.')
      let value: any = source

      for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
          value = value[key]
        } else {
          value = undefined
          break
        }
      }

      if (value !== undefined && value !== null && value !== '') {
        return value as T
      }
    }
  }

  return defaultValue
}

/**
 * Map ValuationSession to BusinessInfo
 *
 * Comprehensive mapping that extracts all business card fields from:
 * - sessionData (complete ValuationRequest)
 * - partialData (incremental updates)
 * - valuationResult (completed valuation)
 * - Top-level fields from backend response
 */
export function mapValuationSessionToBusinessInfo(session: ValuationSession): BusinessInfo {
  // Get all data sources (handle both object and nested structures)
  // CRITICAL: Cast to any to allow access to all fields that may exist in session data
  const sessionData = (session.sessionData || {}) as any
  const partialData = (session.partialData || {}) as any
  const valuationResult = (session as any).valuationResult as ValuationResponse | undefined

  // Also check if data is nested in sessionData/partialData (backend may nest it)
  const nestedSessionData = sessionData?.sessionData || sessionData
  const nestedPartialData = partialData?.partialData || partialData

  // Create array of all data sources to search (priority order matters)
  const allSources = [
    valuationResult,
    nestedSessionData,
    nestedPartialData,
    sessionData,
    partialData,
    session as any,
  ].filter(Boolean) as Array<Record<string, any>>

  // Extract company name (priority: valuationResult > sessionData > partialData > top-level)
  const name = getValueFromSources(allSources, ['company_name'], 'Untitled Business')

  // Extract business type ID (industry) - check multiple possible field names
  // Priority: business_type_id > industry > business_type > business_model
  const industry =
    getValueFromSources(
      allSources,
      ['business_type_id', 'industry', 'business_type', 'business_model'],
      ''
    ) || 'other' // Default to 'other' if not found

  // Extract description (check multiple field names)
  // NOTE: business_context is an object (not a string), so check for description property within it
  const descriptionValue = getValueFromSources(
    allSources,
    [
      'business_description',
      'description',
      'company_description',
      'business_context.description', // Check nested property
    ],
    ''
  )
  const description = typeof descriptionValue === 'string' ? descriptionValue : ''

  // Extract founding year
  const foundedYearRaw = getValueFromSources(
    allSources,
    ['founding_year', 'founded_year'],
    new Date().getFullYear()
  )
  const foundedYear =
    typeof foundedYearRaw === 'number' &&
    foundedYearRaw > 1900 &&
    foundedYearRaw <= new Date().getFullYear()
      ? foundedYearRaw
      : new Date().getFullYear()

  // Extract team size (check multiple field names)
  // Check for employees first, then owners, then combine if both exist
  // Also check nested structures and alternative field names
  const employees: number | string | null = getValueFromSources<number | string | null>(
    allSources,
    [
      'number_of_employees',
      'employee_count',
      'employees',
      'fullData.number_of_employees', // Check nested fullData
      'fullData.employee_count',
    ],
    null
  )

  const owners: number | string | null = getValueFromSources<number | string | null>(
    allSources,
    [
      'number_of_owners',
      'owners',
      'fullData.number_of_owners', // Check nested fullData
    ],
    null
  )

  // Format team size: show employees, or employees + owners if both exist
  let teamSize = 'N/A'
  if (employees !== null && employees !== undefined && employees !== '') {
    const empCount = typeof employees === 'number' ? employees : parseInt(String(employees), 10)
    if (!isNaN(empCount) && empCount >= 0) {
      if (owners !== null && owners !== undefined && owners !== '') {
        const ownerCount = typeof owners === 'number' ? owners : parseInt(String(owners), 10)
        if (!isNaN(ownerCount) && ownerCount > 0) {
          // Show "employees (owners)" format
          teamSize = `${empCount} (${ownerCount} owner${ownerCount !== 1 ? 's' : ''})`
        } else {
          teamSize = empCount.toString()
        }
      } else {
        teamSize = empCount.toString()
      }
    }
  } else if (owners !== null && owners !== undefined && owners !== '') {
    // Only owners available
    const ownerCount = typeof owners === 'number' ? owners : parseInt(String(owners), 10)
    if (!isNaN(ownerCount) && ownerCount > 0) {
      teamSize = `${ownerCount} owner${ownerCount !== 1 ? 's' : ''}`
    }
  }

  // Extract revenue (check nested current_year_data structure)
  const revenueRaw = getValueFromSources(allSources, ['current_year_data.revenue', 'revenue'], 0)
  const revenue = typeof revenueRaw === 'number' && revenueRaw >= 0 ? revenueRaw : 0

  // Extract location (city preferred, fallback to country_code)
  const city = getValueFromSources(allSources, ['city'], '')

  const countryCode = getValueFromSources(allSources, ['country_code', 'country'], '')

  // Combine city and country for location display
  const location = city
    ? countryCode
      ? `${city}, ${countryCode}`
      : city
    : countryCode || 'Unknown'

  // Determine if remote (check is_remote field)
  const isRemoteRaw = getValueFromSources(allSources, ['is_remote', 'isRemote'], false)
  const isRemote = Boolean(isRemoteRaw)

  // Determine status based on completion and data presence
  const status: 'active' | 'inactive' | 'draft' =
    session.completedAt || session.calculatedAt
      ? 'active'
      : (session.partialData && Object.keys(session.partialData).length > 0) ||
          (session.sessionData && Object.keys(session.sessionData).length > 0)
        ? 'active'
        : 'draft'

  // Ensure all required fields have valid values
  const result: BusinessInfo = {
    name: name || 'Untitled Business',
    industry: industry || 'other', // Default to 'other' if no industry found
    description: description || '',
    foundedYear, // Already validated above
    teamSize: teamSize || 'N/A',
    revenue, // Already validated above
    location: location || 'Unknown',
    isRemote, // Already converted to boolean above
    status: status || 'draft',
  }

  return result
}

/**
 * Extract valuation amount from ValuationSession
 */
export function extractValuationAmount(session: ValuationSession): number | null {
  const valuationResult = (session as any).valuationResult as ValuationResponse | undefined

  if (!valuationResult) {
    return null
  }

  // Try equity_value_mid first (most common)
  // BANK-GRADE: Use toNumber to handle string decimals from API
  if (valuationResult.equity_value_mid !== null && valuationResult.equity_value_mid !== undefined) {
    return toNumber(valuationResult.equity_value_mid)
  }

  // Fallback to recommended_asking_price
  if (valuationResult.recommended_asking_price !== null && valuationResult.recommended_asking_price !== undefined) {
    return toNumber(valuationResult.recommended_asking_price)
  }

  // Fallback to equity_value_high
  if (valuationResult.equity_value_high !== null && valuationResult.equity_value_high !== undefined) {
    return toNumber(valuationResult.equity_value_high)
  }

  return null
}

/**
 * Format valuation amount for display (e.g., "€500K")
 */
export function formatValuationAmount(amount: number): string {
  if (amount >= 1000000) {
    // Millions
    const millions = amount / 1000000
    return `€${millions.toFixed(millions >= 10 ? 0 : 1)}M`
  } else if (amount >= 1000) {
    // Thousands
    const thousands = amount / 1000
    return `€${thousands.toFixed(thousands >= 10 ? 0 : 1)}K`
  } else {
    return `€${Math.round(amount)}`
  }
}

/**
 * Extract profile data from session and user context
 * Returns null if no profile data available (will show profile prompt badge)
 */
export function extractProfileData(
  session: ValuationSession,
  user?: { id?: string; name?: string; email?: string; avatar?: string; profileImage?: string }
): { profileImage?: string; fullName?: string; location?: string } | null {
  if (!user) {
    return null
  }

  // Only return profile data if we have at least an image or name
  const profileImage = user.avatar || user.profileImage
  const fullName = user.name || user.email?.split('@')[0]

  if (!profileImage && !fullName) {
    return null
  }

  return {
    profileImage: profileImage || undefined,
    fullName: fullName || undefined,
    location: undefined, // Can be enhanced if user has location data
  }
}
