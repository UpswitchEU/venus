// =============================================================================
// DECIMAL PRECISION TYPES
// =============================================================================

/**
 * Numeric value from API - may be string (new bank-grade format) or number (legacy format).
 *
 * The Python backend now serializes Decimal values as strings to preserve full precision.
 * Use parseDecimal() from utils/decimal to convert to Decimal for calculations.
 * Use formatCurrency() or formatNumber() from utils/formatters for display.
 *
 * @example
 * // New format (string): "1234567.89"
 * // Legacy format (number): 1234567.89
 */
export type ApiNumeric = string | number

// Enums matching backend
export enum IndustryCode {
  TECHNOLOGY = 'technology',
  MANUFACTURING = 'manufacturing',
  RETAIL = 'retail',
  SERVICES = 'services',
  HEALTHCARE = 'healthcare',
  FINANCE = 'finance',
  REAL_ESTATE = 'real_estate',
  HOSPITALITY = 'hospitality',
  CONSTRUCTION = 'construction',
  OTHER = 'other',
}

export enum BusinessModel {
  B2B_SAAS = 'b2b_saas',
  B2C = 'b2c',
  MARKETPLACE = 'marketplace',
  ECOMMERCE = 'ecommerce',
  MANUFACTURING = 'manufacturing',
  SERVICES = 'services',
  OTHER = 'other',
}

export interface YearDataInput {
  year: number
  revenue: number
  ebitda: number
  ebitda_normalized?: boolean
  ebitda_normalization_metadata?: {
    reported_ebitda?: number
    normalized_ebitda?: number
    total_adjustments?: number
    adjustment_count?: number
    confidence_score?: string
    has_custom_adjustments?: boolean
    adjustments?: Array<{
      category: string
      amount: number
      label?: string
      note?: string
      source: string
      confidence: string
      ledger_code?: string
    }>
  }

  // Optional detailed financials
  cogs?: number
  gross_profit?: number
  operating_expenses?: number
  ebit?: number
  depreciation?: number
  amortization?: number
  interest_expense?: number
  tax_expense?: number
  net_income?: number
  capex?: number

  // Balance sheet
  total_assets?: number
  current_assets?: number
  cash?: number
  accounts_receivable?: number
  accounts_payable?: number
  inventory?: number
  total_liabilities?: number
  current_liabilities?: number
  short_term_debt?: number
  total_debt?: number
  total_equity?: number

  // Cash flow
  nwc_change?: number
  /** Explicit FCFF for forecast years (DCF “zonder EBITDA” mode). */
  free_cash_flow?: number

  /** Annual rent expense — Hermes provider mappers populate this from
   * MAR class 61x / RGS huurkosten ledger codes. Surfaced on Venus
   * formData so the Liquidation form can prefill `liq_monthly_rent`
   * as `rent_expense / 12`. The engine ignores this field on its own
   * (rent feeds the wind-down build-up only via `liquidation_inputs`). */
  rent_expense?: number

  /** Paid-up capital — the share-capital contribution that has been
   * paid in by shareholders (BE: "Geplaatst kapitaal" / NL:
   * "Geplaatst en gestort kapitaal").  Distinct from `total_equity`
   * (which also includes retained earnings + reserves).  Drives the
   * Liquidation form's `liq_paid_up_capital` prefill — base for the
   * BE liquidatiebonus exemption + NL box-2 acquisition cost.
   *
   * Hermes mapping: not yet populated (audit 2026-05-10 C1).  Field
   * declared on the type so the Liquidation form's prefill chain is
   * type-safe today; Hermes provider mappers extend later to extract
   * NBB code 1100 ("Geplaatst kapitaal") / RGS BlnPasEigVerVlk on
   * provider connectors that expose it.  Until then the prefill falls
   * through to `total_equity` as a noisier proxy. */
  paid_up_capital?: number

  /** Deferred tax liabilities (DTL) — long-term tax obligations
   * recognised on the balance sheet under IAS 12.  Drives the
   * Liquidation form's `liq_deferred_tax` prefill — 100% reversal at
   * liquidation per IAS 12 §15 + §35.
   *
   * Hermes mapping: not yet populated (audit 2026-05-10 C2).  Field
   * declared on the type so the Liquidation form's prefill chain is
   * type-safe today; Hermes provider mappers extend later to extract
   * NBB code 168 ("Uitgestelde belastingen") / RGS BlnSch.LtgVoz on
   * provider connectors that expose it.  Until then the field stays
   * blank and the engine's cohort default fires. */
  deferred_tax_liabilities?: number

  // Forecast flag — distinguishes user-provided projections from historical actuals
  is_forecast?: boolean
}

export interface OfficialVerificationBadge {
  state: 'verified' | 'partial' | 'unavailable'
  label: string
}

export interface OfficialVarianceAnalysis {
  state: 'not_started' | 'pending' | 'explained' | 'not_required'
  explanationRequired: boolean
  explanation?: string
  /** Absolute % difference vs official filing (revenue). */
  revenueVariancePercent?: number
  /** Absolute % difference vs official filing (EBITDA). */
  ebitdaVariancePercent?: number
  /** Max of revenue/ebitda variance % when both exist. */
  maxVariancePercent?: number
  /** `soft` = at/above soft threshold (default 10%); `hard` = at/above hard threshold (default 25%). */
  severity?: 'none' | 'soft' | 'hard'
}

export interface OfficialFinancialsYearPayload {
  fiscalYear: number
  revenue?: number
  revenueSource?: 'turnover' | 'gross_margin'
  operatingProfit?: number
  depreciation?: number
  writeOffs?: number
  ebitda?: number
  totalAssets?: number
  equity?: number
  schemaType?: 'full' | 'abbreviated'
  rubricsUsed?: Record<string, string>
}

export interface OfficialFinancialsPayload {
  source?: string
  sourceLabel?: string
  filingYear?: number
  revenue?: number
  ebitda?: number
  totalAssets?: number
  equity?: number
  pdfUrl?: string
  sourceLinks?: string[]
  cache?: Record<string, unknown>
  quota?: Record<string, unknown>
  dataHealth?: {
    state?: string
    message?: string
  }
  variancePolicy?: {
    softThresholdPercent: number
    hardThresholdPercent: number
  }
  varianceAnalysis?: OfficialVarianceAnalysis
  verificationBadge?: OfficialVerificationBadge
  historicalYears?: OfficialFinancialsYearPayload[]
}

export interface ValuationRequest {
  // Company information (all required)
  company_name: string
  country_code: string // 2-letter ISO code (e.g., "BE", "DE", "US")
  industry: IndustryCode | string // Backend expects IndustryCode enum
  business_model: BusinessModel | string // Backend expects BusinessModel enum
  founding_year: number // Required by backend

  // Financial data (required)
  current_year_data: YearDataInput
  /** User confirmed filing year alignment (manual flow; used for normalization / version snapshots). */
  filing_year_confirmed?: boolean
  historical_years_data?: YearDataInput[]
  forecast_years_data?: YearDataInput[]
  official_financials?: OfficialFinancialsPayload
  official_variance_analysis?: OfficialVarianceAnalysis
  official_verification_badge?: OfficialVerificationBadge

  // Optional company details
  number_of_employees?: number
  number_of_owners?: number // Number of operational owners (C-level + working shareholders)
  recurring_revenue_percentage?: number // 0.0 to 1.0
  shares_for_sale?: number // Percentage of shares for sale (0-100), used for ownership adjustment
  owner_salary_addback?: number // Annual owner compensation (€) for SDE calculation
  owner_role?: 'working' | 'passive' // SDE owner compensation treatment

  // Additional business context
  business_type?: string
  revenue?: number
  ebitda?: number
  employee_count?: number
  business_description?: string
  business_highlights?: string
  reason_for_selling?: string
  city?: string

  // Phase 1.1: Enhanced KBO registry fields
  registration_number?: string
  kbo_number?: string
  kvk_number?: string
  vat_number?: string
  postal_code?: string
  legal_form?: string
  nace_code?: string
  nace_description?: string
  /** Market-facing activity code (e.g. NL SBI when it differs from canonical NACE). */
  activity_code?: string
  activity_label?: string
  taxonomy?: string
  /** Stable canonical NACE key for mappings (mirrors nace_code when known). */
  canonical_nace_code?: string

  // NEW: PostgreSQL business type integration
  business_type_id?: string // PostgreSQL business type ID
  business_context?: {
    dcfPreference?: number // 0-1: Weight for DCF methodology
    multiplesPreference?: number // 0-1: Weight for Multiples methodology
    ownerDependencyImpact?: number // 0-1: Key person risk impact
    keyMetrics?: string[] // Industry-specific metrics
    typicalEmployeeRange?: { min: number; max: number }
    typicalRevenueRange?: { min: number; max: number }
    [key: string]: unknown
  }

  // Optional market context overrides
  government_bond_yield?: number
  long_term_gdp_growth?: number

  // Localization
  locale?: 'nl' | 'en'

  // Valuation preferences
  use_dcf?: boolean
  use_multiples?: boolean
  user_configured_dcf?: boolean
  projection_years?: number // 5-15 years
  /** Manual DCF: `ebitda` (default) or `fcff_only` (explicit yearly FCFF). */
  dcf_input_mode?: 'ebitda' | 'fcff_only'
  /** DCF cash-flow timing convention. Defaults to `mid_year`; accountant templates may use `year_end`. */
  dcf_discounting_convention?: 'mid_year' | 'year_end'
  /** Explicit nominal APV debt tax-shield cash flows by forecast year. */
  dcf_tax_shield_projections?: number[]

  /** Pre-selected valuation method key (single-method mode). */
  selected_method?: string
  /** Method-key → weight (0.0–1.0) map for blended valuation. Weights must sum to 1.0. */
  user_weights?: Record<string, number>
  /** Accountant's textual rationale for the chosen weighting (printed in PDF synthesis page). */
  user_weight_justification?: string

  /**
   * Startup Valuation Engine inputs (only set when `selected_method === 'startup_valuation'`).
   * Mirrors `apps/titan-api/src/valuations/dto/valuation-request.dto.ts` (`startupInputsSchema`).
   */
  startup_inputs?: Record<string, unknown>

  /**
   * Liquidation Phase 2-4 advisor inputs — bundled by
   * `buildValuationRequest` from the `LiquidationInputsSection` form
   * fields (`liq_*`).  Keys map 1:1 to the engine's
   * `calculate_liquidation_method` kwargs.
   *
   * Mirrors:
   *   - Titan Zod (`valuation-request.dto.ts:liquidation_inputs`)
   *   - Pydantic legacy (`legacy_schemas.ValuationRequest.liquidation_inputs`)
   *   - Pydantic stateless (`stateless_api.CalculateRequest.liquidation_inputs`)
   *
   * Open-shaped on purpose: only the 4 + 1 fields below are wired
   * from the UI today, but the engine accepts 14 more reserved kwargs
   * (per-tier liability_buckets, runway_months_*, distress_wacc_*,
   * multiples_value_override, identifiable_intangibles_uplift_pct,
   * etc.).  Keeping the type open keeps the contract migration-free.
   */
  liquidation_inputs?: {
    headcount?: number
    monthly_rent?: number
    paid_up_capital?: number
    deferred_tax_liabilities?: number
    owner_premise_override?: 'orderly_liquidation' | 'forced_liquidation'
    [key: string]: unknown
  }

  /** Flat UI form fields for `LiquidationInputsSection` — bundled into
   * `liquidation_inputs` by `buildValuationRequest` before dispatch. */
  liq_headcount?: number
  liq_monthly_rent?: number
  liq_paid_up_capital?: number
  liq_deferred_tax?: number
  liq_premise_override?: 'orderly_liquidation' | 'forced_liquidation'
  liq_realised_capital_gains?: number
  liq_taxable_reserves?: number
  liq_runway_months_orderly?: number
  liq_runway_months_forced?: number
  liq_distress_wacc_orderly?: number
  liq_distress_wacc_forced?: number
  liq_intangibles_uplift_pct?: number
  liq_multiples_value_override?: number
  liq_lb_super_preferent_employees?: number
  liq_lb_preferent_tax?: number
  liq_lb_preferent_other?: number
  liq_lb_secured?: number
  liq_lb_unsecured?: number
  liq_lb_subordinated?: number
  liq_lb_estate_costs?: number
  liq_ao_land?: number
  liq_ao_buildings?: number
  liq_ao_machinery_equipment?: number
  liq_ao_vehicles?: number
  liq_ao_it_equipment?: number
  liq_ao_intangibles?: number
  liq_ao_inventory_raw?: number
  liq_ao_inventory_wip?: number
  liq_ao_inventory_finished?: number
  liq_ao_trade_receivables?: number
  liq_ao_other_receivables?: number
  liq_ao_cash?: number

  /**
   * Free-form caller metadata forwarded to ValuationIQ's `request.metadata`.
   *
   * Currently consumed keys:
   *   - `startup_advisor_cta_url` — overrides the "Invite my Accountant"
   *     CTA URL on the startup report (set automatically by
   *     `buildStartupValuationRequest`).
   */
  metadata?: Record<string, unknown>

  /**
   * Optional capital history forwarded to the SaaS / non-startup methods'
   * cap-table simulator.  Mirrors the Pydantic ``CapTableSummary`` on the
   * Python side and the Zod ``capTableSummarySchema`` on the Titan side
   * (`apps/titan-api/src/valuations/dto/valuation-request.dto.ts`).
   * Untouched by the startup flow — the startup wizard writes its copy
   * into ``startup_inputs.cap_table``.
   */
  cap_table?: CapTableSummaryInput

  /**
   * Round size the founder is currently raising (EUR).  Drives the
   * cap-table simulator on the SaaS / non-startup result.  Mirrors
   * ``startup_inputs.investment_amount_sought`` for the venture path.
   */
  investment_amount_sought?: number

  // Optional comparable companies
  comparables?: Array<{
    name: string
    ev_ebitda_multiple?: number
    ev_revenue_multiple?: number
    pe_ratio?: number
  }>

  // Tax latencies (belastinglatenties) — legacy equity bridge adjustments
  tax_latencies?: TaxLatencyInput[]
  balance_sheet_adjustments?: BalanceSheetAdjustmentInput[]

  // Advanced advisor controls (UPS-ADV-300)
  real_estate_treatment?: 'none' | 'carve_out' | 'included'
  exclude_real_estate?: boolean
  real_estate_market_value?: number
  real_estate_book_value?: number
  estimated_market_rent?: number
  multiple_calibration_adjustment?: number
  multiple_calibration_note?: string
  historical_ebitda_weighting_mode?: 'standard' | 'weighted'
  historical_ebitda_weights?: Record<number, number>
  show_enterprise_to_equity_bridge?: boolean

  /** Accountant-tier: override EV/EBITDA median vs Upswitch benchmark (see preparer_ev_ebitda_override) */
  preparer_ev_ebitda_median?: number
  preparer_ev_ebitda_override?: {
    reason_key: string
    note?: string
    acknowledged_extreme?: boolean
  }
}

export interface TaxLatencyInput {
  type: 'active' | 'passive'
  description: string
  temporary_difference: number
  tax_rate: number
  account_code?: string
}

/**
 * Single SAFE / convertible note on the founder's cap table.  Shape
 * mirrors the Pydantic ``SafeNote`` model.  ``id`` is a frontend-only
 * stable handle so the React editor can key list rows; the engine
 * ignores it (and Zod strips it at the boundary).
 */
export interface SafeNoteInput {
  id: string
  amount: number | null
  valuation_cap?: number | null
  discount_pct?: number | null
  holder_label?: string
}

/**
 * Cap-table summary forwarded to the engine alongside the SaaS / non-startup
 * methods.  Field shape mirrors the Pydantic ``CapTableSummary`` model and
 * the Titan Zod ``capTableSummarySchema`` exactly so the payload crosses
 * Venus → Titan → ValuationIQ unchanged.
 */
export interface CapTableSummaryInput {
  pre_money_target?: number
  option_pool_pct?: number
  safe_notes?: Array<Omit<SafeNoteInput, 'id'>>
  last_round_amount?: number
  last_round_post_money?: number
  last_round_date?: string
}

export interface BalanceSheetAdjustmentInput {
  id: string
  label: string
  amount: number
  type: 'add' | 'subtract'
  category: 'tax_latency' | 'excess_cash' | 'non_operating' | 'provision' | 'other'
  description?: string
  account_code?: string
  /** Bruto meerwaarde / tijdelijk verschil — when category is tax_latency */
  temporary_difference?: number
  /** Latentie % — when category is tax_latency */
  tax_rate?: number
  /** active | passive — when category is tax_latency */
  tax_latency_type?: 'active' | 'passive'
}

// Extended request type for frontend form state
export interface ValuationFormData extends Partial<ValuationRequest> {
  // Required fields that must be present in form data
  business_model: BusinessModel | string
  founding_year: number

  // NEW: Primary business type ID from PostgreSQL
  business_type_id?: string
  /** Display label for sector mismatch validation (not sent to Titan). */
  business_type_title?: string

  // Phase 2: Sub-industry granularity
  subIndustry?: string
  employees?: number
  owners?: number // Alias for number_of_owners

  // Internal preferences (stored locally, sent in business_context)
  _internal_dcf_preference?: number
  _internal_multiples_preference?: number
  _internal_owner_dependency_impact?: number
  _internal_key_metrics?: string[]
  _internal_typical_employee_range?: { min: number; max: number }
  _internal_typical_revenue_range?: { min: number; max: number }

  // Legacy fields for backward compatibility
  revenue?: number
  ebitda?: number
  business_type?: 'sole-trader' | 'company'
  shares_for_sale?: number
  employee_count?: number
  business_description?: string
  business_highlights?: string
  reason_for_selling?: string
  city?: string

  // Phase 1.1: Enhanced KBO registry fields (inherited from ValuationRequest)
  registration_number?: string
  kbo_number?: string
  kvk_number?: string
  vat_number?: string
  postal_code?: string
  legal_form?: string
  nace_code?: string
  nace_description?: string

  /** Manual-flow forecast years used as explicit DCF projection inputs. */
  forecast_years_data?: YearDataInput[]

  // Adaptive Input Studio: method-specific bonus fields
  // DCF projections
  dcf_revenue_growth_pct?: number
  dcf_ebitda_margin_pct?: number
  dcf_capex_pct?: number
  dcf_da_pct?: number
  dcf_nwc_pct?: number
  dcf_tax_rate_pct?: number
  dcf_wacc_pct?: number
  dcf_terminal_growth_pct?: number
  dcf_exit_multiple?: number
  dcf_risk_free_rate_pct?: number
  dcf_equity_risk_premium_pct?: number
  dcf_beta?: number
  dcf_cost_of_debt_pct?: number
  dcf_debt_equity_pct?: number
  dcf_tax_shield_pct?: number
  dcf_discounting_convention?: 'mid_year' | 'year_end'
  /** Explicit nominal APV debt tax-shield cash flows by forecast year. */
  dcf_tax_shield_projections?: number[]
  /** DCF terminal value: growth vs multiple (manual calculator). */
  dcf_terminal_value_method?: 'perpetual_growth' | 'exit_multiple'
  // Adjusted NAV
  nav_real_estate_adjustment?: number
  nav_inventory_adjustment?: number
  nav_hidden_reserves?: number
  nav_goodwill_writeoff?: number
  nav_receivables_adjustment?: number
  nav_other_revaluations?: number
  nav_tax_latency_pct?: number
  nav_off_balance_items?: number
  /**
   * Real-estate book→appraisal swap. When both fields are supplied, the
   * engine derives the meerwaarde as (appraisal - book) and ignores
   * `nav_real_estate_adjustment`. Provides a defensible audit trail.
   */
  nav_real_estate_book_value?: number
  nav_real_estate_appraisal_value?: number
  /**
   * Per-asset deferred-tax rates (% of meerwaarde). Keys: real_estate,
   * inventory, receivables, hidden_reserves, other_revaluations.
   * When omitted, the engine falls back to `nav_tax_latency_pct` or to
   * the SME-rate-resolved default.
   */
  nav_per_asset_tax_rates?: {
    real_estate?: number
    inventory?: number
    receivables?: number
    hidden_reserves?: number
    other_revaluations?: number
  }
  /**
   * Equipment economic-lifespan revaluation. Reconstructs the economic
   * book value from original cost + age + useful life and surfaces the
   * meerwaarde vs. the (often near-zero) tax book value.
   */
  nav_equipment_revaluation?: {
    original_cost?: number
    acquisition_year?: number
    tax_book_value?: number
    economic_useful_life_years?: number
    /** Override: skip the formula and use a user-supplied economic book. */
    economic_book_value?: number
  }
  // SME rate resolution inputs (Art. 215 WIB 92)
  taxable_profit?: number
  director_remuneration?: number
  is_financial_company?: boolean
  is_holding_more_than_50pct_shares?: boolean
  sme_rate_override?: boolean
  // M&A transaction structure
  real_estate_treatment?: 'none' | 'carve_out' | 'included'
  exclude_real_estate?: boolean
  real_estate_market_value?: number
  real_estate_book_value?: number
  estimated_market_rent?: number
  multiple_calibration_adjustment?: number
  multiple_calibration_note?: string
  historical_ebitda_weighting_mode?: 'standard' | 'weighted'
  historical_ebitda_weights?: Record<number, number>
  show_enterprise_to_equity_bridge?: boolean
  /**
   * Asset-vs-share deal selector. 'compare' returns both scenarios.
   * Triggers `deal_structure_comparison` in the engine response.
   */
  deal_type?: 'share' | 'asset' | 'compare'
  deal_goodwill_amount?: number
  deal_seller_share_basis?: number
  deal_seller_is_individual?: boolean
  deal_buyer_discount_rate_pct?: number
  deal_registration_duty_pct?: number
  // SaaS metrics
  saas_arr?: number
  saas_mrr?: number
  saas_arr_growth_pct?: number
  saas_churn_pct?: number
  saas_customer_churn_pct?: number
  saas_nrr_pct?: number
  saas_gross_margin_pct?: number
  saas_cac?: number
  saas_customer_concentration_pct?: number
  saas_expansion_revenue_pct?: number
  saas_sm_spend?: number
  // Revenue quality
  rev_recurring_pct?: number
  rev_recurring_amount?: number
  rev_top_client_concentration_pct?: number
  rev_top_client_amount?: number
  rev_contract_backlog?: number
  rev_gross_churn_pct?: number
  rev_capitalized_rd_amount?: number

  /**
   * Capital history — drives the cap-table simulator on the SaaS / non-startup
   * methods.  Persisted on the form-store as an opt-in collapsible block; the
   * builder maps these into top-level ``cap_table`` + ``investment_amount_sought``
   * fields on the canonical request.  Empty / absent ⇒ no simulator on the report
   * (backwards-compat preserved).
   */
  capital_history_enabled?: boolean
  capital_round_amount?: number
  capital_option_pool_pct?: number
  capital_safe_notes?: SafeNoteInput[]
  capital_last_round_amount?: number
  capital_last_round_post_money?: number
  capital_last_round_date?: string

  // ---------------------------------------------------------------------
  // Meerwaarde-tax (fiscal_4x) data inputs — the four amount values
  // captured by Venus FiscalInputsSection for the cedent's 31/12/2025
  // cost-basis filing under Art. 90 WIB 92. Bundled by
  // `buildValuationRequest` into a `fiscal_inputs: dict` on the request,
  // forwarded through Titan and ValuationIQ's stateless_router into the
  // metadata consumed by `fiscal_section.py`. None of these change the
  // engine's forfait formula — they populate the four-anchor "hoogste
  // van" worksheet on the report.
  //
  // Advisory metadata (peildatum, company role, EBITDA basis,
  // internal-transfer flag, anchors-acknowledged attestation) is NOT
  // declared here — the data rail collects only what the advisor
  // brings; everything else is auto-derived by the report builder
  // (peildatum from closed_fiscal_year_data.year, company role from
  // KBO NACE, EBITDA basis from `fiscal_uses_normalized_ebitda`) or
  // set on `request.metadata` via firm/transaction settings.
  // ---------------------------------------------------------------------
  /** Aanschaffingswaarde 31/12/2025 (advisor pin). When omitted the
   *  report derives it from the max-of-four anchors. */
  fiscal_acquisition_cost?: number
  /** Anchor 2 — contractuele formule (aandeelhoudersovereenkomst). */
  fiscal_anchor_2_value?: number
  /** Anchor 3 — objectieve markttransactie 2025. */
  fiscal_anchor_3_value?: number
  /** Anchor 4 — onafhankelijk waarderingsverslag (deadline 31/12/2027). */
  fiscal_anchor_4_value?: number
}
