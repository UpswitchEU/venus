import { createContext } from 'react'
import { CookieHealthStatus } from '../utils/auth/cookieHealth'

// =============================================================================
// TYPES
// =============================================================================

export interface BusinessCard {
  company_name: string
  industry: string
  business_model: string
  founding_year: number
  employee_count: number
  country_code: string
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
}

export interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  refreshAuth: () => Promise<void>
  businessCard: {
    company_name: string
    industry: string
    business_model: string
    founding_year: number
    country_code: string
    employee_count?: number
    // Phase 1.1: Enhanced KBO registry fields
    kbo_number?: string
    vat_number?: string
    city?: string
    postal_code?: string
    legal_form?: string
    nace_code?: string
    nace_description?: string
  } | null
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)
