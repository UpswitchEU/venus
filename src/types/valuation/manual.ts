import type { BusinessModel, ValuationFormData, YearDataInput } from './request'
import type { ValuationResponse } from './response'

// -----------------------------------------------------------------------------
// Manual calculator (`ManualInputPanel`) — do not duplicate engine fields
// -----------------------------------------------------------------------------

/**
 * One row in the manual multi-year financial grid (KBO, CSV, import). Year labels
 * are strings; the shape is not sent as-is to the engine — it becomes `YearDataInput`.
 */
export interface YearlyFinancials {
  year: string
  revenue: number
  ebitda: number
  source_provider?: string
  source_kind?: string
  source_synced_at?: string | null
  quality_state?: 'ready' | 'needs_review' | 'blocked' | 'attested_review'
  source_digest?: string
  attestation_id?: string
  eligibility_reason?: string
  capex?: number
  depreciation?: number
  tax_expense?: number
  cash?: number
  total_debt?: number
  lease_liabilities?: number
  current_assets?: number
  current_liabilities?: number
  accounts_receivable?: number
  accounts_payable?: number
  inventory?: number
  short_term_debt?: number
  nwc_change?: number
  /** Optional balance sheet strip (import / advanced row) — fiscal / NAV context. */
  total_equity?: number
  total_assets?: number
  total_liabilities?: number
  normalizedEbitda?: number
  /** Explicit FCFF per forecast year (“zonder EBITDA”). */
  free_cash_flow?: number
  /** Annual rent expense — used to prefill `liq_monthly_rent` in the Liquidation form. */
  rent_expense?: number
  /** Paid-up capital — used to prefill `liq_paid_up_capital` in the Liquidation form. */
  paid_up_capital?: number
  /** Deferred tax liabilities — used to prefill `liq_deferred_tax` in the Liquidation form. */
  deferred_tax_liabilities?: number
  isForecast?: boolean
}

/**
 * UI-only and camelCase state for the manual panel (not the API request body).
 * All valuation-engine inputs (NAV, DCF knobs, deal structure, etc.) must be defined on
 * {@link ValuationFormData} only; they are merged in via `Partial<ValuationFormData>` in
 * {@link ManualValuationFormData} so the panel cannot drift on the next new API key.
 */
export interface ManualValuationFormUiBase {
  companyName: string
  kboNumber?: string
  legalForm?: string
  address?: string
  naceCode?: string
  naceDescription?: string
  /** Canonical NACE for Titan when `naceCode` is a market alias (e.g. SBI). */
  canonicalNaceCode?: string
  businessType: string
  businessTypeCode?: string
  /** Back-compat camelCase alias emitted by the manual panel; API field is `business_model`. */
  businessModel?: string
  industry: string
  country: string
  country_code?: string
  yearFounded: string
  businessStructure: string
  ownerManagers: number
  fteEmployees: number | undefined
  yearlyFinancials: YearlyFinancials[]
  averageNormalizedEbitda?: number
  /** Local UX; API field is `filing_year_confirmed` on `ValuationRequest` / `ValuationFormData`. */
  filingYearConfirmed?: boolean
}

/**
 * Manual `ManualInputPanel` state: full optional API surface of {@link ValuationFormData}
 * plus the UI base. Add new server/engine form keys to `ValuationFormData` only.
 */
export type ManualValuationFormData = Partial<ValuationFormData> & ManualValuationFormUiBase

export interface QuickValuationRequest {
  revenue: number
  ebitda: number
  industry: string
  country_code: string
}

// Quick valuation uses same response format as full valuation
export type QuickValuationResponse = ValuationResponse
