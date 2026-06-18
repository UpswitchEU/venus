/**
 * Registry Service Types
 *
 * Centralized type definitions for the unified registry service
 */

export interface CompanySearchResult {
  company_id: string
  company_name: string
  result_type: string
  registration_number: string
  country_code: string
  legal_form: string
  address: string
  status: string
  confidence_score: number
  registry_name: string
  registry_url: string
  website?: string
  /** KBO number (Titan registry returns this) */
  kbo_number?: string
  /** Dutch KVK: may appear without `legal_form` (see pickLegalFormFromRegistryHit) */
  rechtsvorm?: string
  rechtsvormOmschrijving?: string
  /** NACE industry code (Titan KBO returns this) */
  nace_code?: string
  /** NACE activity description (Titan KBO returns this) */
  nace_description?: string
  activity_code?: string
  activity_label?: string
  taxonomy?: string
  canonical_nace_code?: string
  nace_codes?: string[]
  postal_code?: string
  city?: string
  /** Server-resolved business type ID from sector DB (Titan enrichment). */
  business_type_id?: string
  /** Server-resolved sector title (e.g. "Logistics"). */
  business_type_title?: string
  /** Server-resolved business type IDs when multiple registry activities match. */
  business_type_ids?: string[]
  /** Server-resolved business type candidates with optional NACE provenance. */
  business_type_candidates?: Array<{
    id?: string
    business_type_id?: string
    title?: string
    business_type_title?: string
    nace_code?: string
    primary_multiple?: {
      metric?: string | null
      label?: string | null
      median?: number | string | null
      p25?: number | string | null
      p75?: number | string | null
      basis?: string | null
      lowSampleSuppressed?: boolean | null
      low_sample_suppressed?: boolean | null
    }
    primaryMultiple?: {
      metric?: string | null
      label?: string | null
      median?: number | string | null
      p25?: number | string | null
      p75?: number | string | null
      basis?: string | null
      lowSampleSuppressed?: boolean | null
      low_sample_suppressed?: boolean | null
    }
  }>
}

export interface CompanyFinancialData {
  company_id: string
  company_name: string
  registration_number: string
  country_code: string
  legal_form: string
  industry_code?: string
  industry_description?: string
  founding_year?: number
  employees?: number
  filing_history: Array<{
    year: number
    revenue?: number
    ebitda?: number
    net_income?: number
    total_assets?: number
    total_debt?: number
    cash?: number
    filing_date: string
    source_url?: string
    cost_of_goods_sold?: number
    operating_expenses?: number
  }>
  data_source: string
  last_updated: string
  completeness_score: number
}

export interface SearchSuggestion {
  text: string
  type: string
  reason?: string
  confidence?: number
}

export interface CompanySearchResponse {
  success: boolean
  results: CompanySearchResult[]
  error?: string
  requestId: string
  total_results?: number
  search_time_ms?: number
  registry_name?: string
}

export interface CachedData {
  data: unknown
  timestamp: number
}

export interface RegistryServiceConfig {
  baseURL: string
  cacheTTL: number
  maxCacheSize: number
  timeout: number
}

/**
 * Browser-side max wait for `/api/registry/search` (Venus BFF → Titan).
 * Align with Mercury (`REGISTRY_SEARCH_CLIENT_TIMEOUT_MS`): Titan KBO cold DB
 * paths can approach ~12s; aborting at 6–8s surfaces false failures.
 */
export const REGISTRY_SEARCH_CLIENT_TIMEOUT_MS = 15_000

/**
 * Server-side Titan fetch budget in `app/api/registry/search/route.ts`.
 * **Keep equal to** Mercury `REGISTRY_PROXY_TOTAL_BUDGET_MS` (14.5s). Must stay
 * strictly **below** `REGISTRY_SEARCH_CLIENT_TIMEOUT_MS` so the BFF returns JSON
 * before the browser aborts.
 */
export const REGISTRY_SEARCH_PROXY_TIMEOUT_MS = 14_500
