import { createContext } from 'react'
import { CookieHealthStatus } from '../utils/auth/cookieHealth'

// =============================================================================
// TYPES
// =============================================================================

export interface BusinessCard {
  company_name: string
  industry: string
  business_model: string
  business_type_id?: string
  founding_year: number
  employee_count?: number
  country_code: string
  kbo_number?: string
  vat_number?: string
  city?: string
  postal_code?: string
  legal_form?: string
  nace_code?: string
  nace_description?: string
  website?: string
  description?: string
}

export interface User {
  id: string
  email: string
  name: string
  role: string
  email_verified?: boolean
  firm_country_code?: string

  // Profile fields
  avatar_url?: string
  avatar?: string
  profile_picture?: string
  /** OIDC / some providers expose photo as `picture` */
  picture?: string

  // Business card fields
  company_name?: string
  business_type?: string
  business_type_id?: string
  industry?: string
  founded_year?: number
  years_in_operation?: number
  employee_count_range?: string
  city?: string
  country?: string
  company_description?: string

  // Phase 1.1: Enhanced KBO registry fields
  kbo_number?: string
  vat_number?: string
  postal_code?: string
  legal_form?: string
  nace_code?: string
  nace_description?: string

  // Language preference (synced from Titan)
  language_preference?: string

  /**
   * Titan-resolved plan tier from the `/api/auth/me` payload (extracted from
   * `user_plans[0].plan_type`). Used as a synchronous seed for `useCredits`
   * on the standalone Venus path so paid advisors do not see the
   * Free-tier locked-method flash while `/credits/plan` is in flight.
   *
   * Authoritative billing decisions still go through `/credits/plan`; this
   * field is a UI-only optimization for the first paint. Possible values
   * mirror Titan `PlanType`: `free | starter | pro | expert | enterprise |
   * premium`. Always trim/lowercase before comparing.
   */
  plan_type?: string
}

export interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  refreshAuth: () => Promise<void>
  businessCard: BusinessCard | null
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)
