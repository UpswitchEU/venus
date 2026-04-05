// Valuation Engine API Types

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

  // Additional business context
  business_type?: string
  revenue?: number
  employee_count?: number
  business_description?: string
  business_highlights?: string
  reason_for_selling?: string
  city?: string

  // Phase 1.1: Enhanced KBO registry fields
  kbo_number?: string
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

  /** Pre-selected valuation method key (single-method mode). */
  selected_method?: string
  /** Method-key → weight (0.0–1.0) map for blended valuation. Weights must sum to 1.0. */
  user_weights?: Record<string, number>
  /** Accountant's textual rationale for the chosen weighting (printed in PDF synthesis page). */
  user_weight_justification?: string

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

  // Real estate carve-out for share deals where the property remains with the seller
  exclude_real_estate?: boolean
  real_estate_book_value?: number
  estimated_market_rent?: number

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
  kbo_number?: string
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
  // Adjusted NAV
  nav_real_estate_adjustment?: number
  nav_inventory_adjustment?: number
  nav_hidden_reserves?: number
  nav_goodwill_writeoff?: number
  // M&A transaction structure
  exclude_real_estate?: boolean
  real_estate_book_value?: number
  estimated_market_rent?: number
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
  rev_top_client_concentration_pct?: number
  rev_contract_backlog?: number
}

export interface QuickValuationRequest {
  revenue: number
  ebitda: number
  industry: string
  country_code: string
}

// Quick valuation uses same response format as full valuation
export type QuickValuationResponse = ValuationResponse

// =============================================================================
// MODULAR SYSTEM INTERFACES (Phase 1: Backend Data Structure)
// =============================================================================

/**
 * Modular System metadata from backend
 * Contains information about the 12-step calculation system execution
 */
export interface ModularSystem {
  enabled: boolean
  total_steps: number
  steps_completed: number
  steps_skipped: number
  steps_failed?: number
  total_execution_time_ms: number
  step_details: StepDetail[]
}

/**
 * Individual step detail from modular system
 */
export interface StepDetail {
  step: number
  name: string
  status: 'completed' | 'skipped' | 'failed' | 'pending' | 'executing'
  execution_time_ms: number
  error?: string
  reason?: string // Reason for skip
}

/**
 * Step status enum matching backend StepStatus
 */
export enum StepStatus {
  PENDING = 'pending',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
  FAILED = 'failed',
}

// =============================================================================
// TRANSPARENCY & METHODOLOGY INTERFACES
// =============================================================================

/**
 * Academic source reference
 */
export interface AcademicSource {
  author: string
  year: number | string
  title: string
  relevance: string
  edition?: string
  publisher?: string
  journal?: string
  volume?: string
  pages?: string
}

/**
 * Professional review readiness assessment
 */
export interface ProfessionalReviewReady {
  ready: boolean
  status: 'PROFESSIONAL_REVIEW_READY' | 'NOT_READY' | 'REVIEW_RECOMMENDED'
  checks: string[]
  warnings: string[]
  notes: string[]
}

/**
 * Enhanced transparency data with full step information
 */
export interface TransparencyData {
  data_sources: DataSource[]
  calculation_steps?: EnhancedCalculationStep[]
  comparable_companies?: ComparableCompany[]
  confidence_breakdown: ConfidenceBreakdown
  range_methodology: RangeMethodology
  adjustments_applied?: AdjustmentDetail[]
  standards_compliance?: string[]
  methodology_statement?: string
  academic_sources?: AcademicSource[]
  professional_review_ready?: ProfessionalReviewReady
}

/**
 * Data source information
 */
export interface DataSource {
  name: string
  value: any
  source: string
  timestamp: string
  confidence: number
  api_url?: string
  cache_status?: string
  type?: string // e.g., 'Multiples', 'DCF', etc.
}

/**
 * Enhanced calculation step with status and metadata
 */
export interface EnhancedCalculationStep {
  step: number // Step number (0-11)
  step_number?: number // Alias for backward compatibility
  name: string // Step name
  description: string // Human-readable description
  status: 'completed' | 'skipped' | 'failed' | 'not_executed'
  execution_time_ms: number
  key_outputs?: Record<string, any> // Key outputs from step
  reason?: string // Reason for skip
  error?: string // Error message if failed
  methodology_note?: string // Methodology-specific note
  formula?: string // Calculation formula (legacy)
  inputs?: Record<string, any> // Input data (legacy)
  outputs?: Record<string, any> // Output data (legacy)
  explanation?: string // Explanation (legacy)
  sme_calibration?: {
    applied: boolean
    revenue: number
    ebitda_multiple?: {
      raw: number
      calibrated: number
      calibration_factor: number
      reduction_percentage: number
      explanation: string
    }
    revenue_multiple?: {
      raw: number
      calibrated: number
      calibration_factor: number
      reduction_percentage: number
      explanation: string
    }
    academic_reference?: string
    rationale?: string
  }
}

/**
 * Legacy calculation step interface for backward compatibility
 */
export interface CalculationStep {
  step_number: number
  description: string
  formula: string
  inputs: Record<string, any>
  outputs: Record<string, any>
  explanation: string
}

/**
 * Adjustment detail with comprehensive information
 */
export interface AdjustmentDetail {
  step: string // Step name
  step_number: number
  adjustment: number // Decimal format (e.g., -0.12 for -12%)
  adjustment_pct: number // Percentage format (e.g., -12)
  type: string // 'owner_concentration' | 'size_discount' | 'liquidity_discount' | 'control_premium' | 'minority_discount' | 'deadlock_discount'
  rationale: string
  tier?: string // Size tier, risk level, etc.
  ownership_percentage?: number // For ownership adjustments
}

export interface ComparableCompany {
  name: string
  country: string
  revenue: number
  ebitda_multiple?: number
  revenue_multiple?: number
  similarity_score: number
  source: string
}

export interface ConfidenceBreakdown {
  data_quality: number
  historical_data: number
  methodology_agreement: number
  industry_benchmarks: number
  company_profile: number
  market_conditions: number
  geographic_data: number
  business_model_clarity: number
  overall_score: number
  // Optional extended properties
  methodology_quality?: number
  market_data_quality?: number
}

export interface RangeMethodology {
  mid_point: number
  confidence_level: string
  base_spread: number
  asymmetric_adjustment: boolean
  downside_factor: number
  upside_factor: number
  low_value: number
  high_value: number
  academic_source: string
}

export interface ValidationWarning {
  type: 'wacc' | 'cagr' | 'growth_consistency' | 'methodology_variance' | 'data_quality'
  severity: 'critical' | 'high' | 'medium' | 'low'
  message: string
  details?: string
  recommended_action?: string
}

// ============================================================================
// Step Result Type Definitions (from Modular System)
// ============================================================================

/**
 * Step 4: Owner Concentration Adjustment Result
 * Matches backend StepOutput.result structure from step_4_owner_concentration.py
 */
export interface Step4OwnerConcentrationResult {
  enterprise_value_low: number
  enterprise_value_mid: number
  enterprise_value_high: number
  owner_employee_ratio?: number | null
  normalized_ratio?: number
  risk_level?: string
  adjustment_percentage: number
  ev_change?: number
  calibration_used?: boolean
  // Legacy compatibility fields (from metadata)
  ev_low_before?: number
  ev_mid_before?: number
  ev_high_before?: number
  ev_low_after?: number
  ev_mid_after?: number
  ev_high_after?: number
  calibration_type?: 'industry-specific' | 'universal' | 'standard'
  business_type_id?: string | null
  number_of_owners?: number
  number_of_employees?: number
  skipped?: boolean
  // McKinsey-level transparency (2025)
  pipeline_stage?: MultiplePipelineStage | null
}

/**
 * Step 5: Size Discount Result
 * Matches backend StepOutput.result structure from step_5_size_discount.py
 */
export interface Step5SizeDiscountResult {
  enterprise_value_low: number
  enterprise_value_mid: number
  enterprise_value_high: number
  size_tier?: string
  base_discount: number
  adjustment_multiplier?: number
  size_discount_percentage: number
  business_category?: string
  ev_change?: number
  // Legacy compatibility fields (from metadata)
  ev_low_before?: number
  ev_mid_before?: number
  ev_high_before?: number
  ev_low_after?: number
  ev_mid_after?: number
  ev_high_after?: number
  revenue_tier?: string
  sole_trader_adjustment?: number
  // McKinsey-level transparency (2025)
  pipeline_stage?: MultiplePipelineStage | null
}

/**
 * Step 6: Liquidity Discount Result
 * Matches backend StepOutput.result structure from step_6_liquidity_discount.py
 */
export interface Step6LiquidityDiscountResult {
  enterprise_value_low: number
  enterprise_value_mid: number
  enterprise_value_high: number
  base_discount: number
  margin_bonus?: number
  growth_bonus?: number
  recurring_revenue_bonus?: number
  size_bonus?: number
  total_discount_percentage: number
  ebitda_margin?: number
  growth_rate?: number
  recurring_revenue_pct?: number
  revenue?: number
  business_category?: string
  // Legacy compatibility fields (from metadata)
  ev_low_before?: number
  ev_mid_before?: number
  ev_high_before?: number
  ev_low_after?: number
  ev_mid_after?: number
  ev_high_after?: number
  base_step?: number
  adjustments?: {
    margin?: number
    growth?: number
    recurring_revenue?: number
    size?: number
  }
  sole_trader_adjustment?: number
  is_sole_trader?: boolean
  liquidity_discount_percentage?: number
  sme_calibration_interaction?: {
    sme_calibration_applied: boolean
    step6_skipped: boolean
    rationale: string
    academic_reference: string
  }
  // McKinsey-level transparency (2025)
  pipeline_stage?: MultiplePipelineStage | null
}

/**
 * Step 7: EV to Equity Conversion Result
 * Matches backend StepOutput.result structure from step_7_ev_to_equity.py
 */
export interface Step7EVToEquityResult {
  equity_value_low: number
  equity_value_mid: number
  equity_value_high: number
  total_debt?: number
  cash?: number
  operating_cash?: number
  excess_cash?: number
  operating_cash_pct?: number
  net_debt: number
  nwc_surplus_deficit?: number
  debt_to_ev_ratio?: number
  cash_to_ev_ratio?: number
  net_debt_to_ev_ratio?: number
  exemption_applied?: boolean
  exemption_rationale?: string
  size_tier?: string
  business_category?: string | null
  range_validated?: boolean
  range_corrected?: boolean
  balance_sheet_available?: boolean
  ev_source_step?: number
  calculated_equity_mid?: number
  // Legacy compatibility fields
  ev_low?: number
  ev_mid?: number
  ev_high?: number
  balance_sheet_validation?: {
    warnings?: string[]
    notes?: string[]
    negative_debt?: boolean
    negative_cash?: boolean
    high_debt_ratio?: boolean
    high_cash_ratio?: boolean
  }
  edge_case_notes?: string[]
}

/**
 * Step 8: Ownership Adjustment Result
 * Matches backend StepOutput.result structure from step_8_ownership_adjustment.py
 */
export interface Step8OwnershipAdjustmentResult {
  equity_value_low: number
  equity_value_mid: number
  equity_value_high: number
  ownership_percentage: number
  adjustment_type: string
  adjustment_percentage: number
  ownership_multiplier?: number
  // Legacy compatibility fields (from metadata)
  equity_low_before?: number
  equity_mid_before?: number
  equity_high_before?: number
  equity_low_after?: number
  equity_mid_after?: number
  equity_high_after?: number
  base_adjustment?: number
  base_adjustment_pct?: number
  business_type_multiplier?: number
  revenue_multiplier?: number
  rationale?: string
  tier_description?: string
  shares_for_sale?: number
  calibration_type?: string
}

// Small Firm Effect Transparency Types
// Updated to support both legacy (number) and modular (object) formats
export interface SmallFirmAdjustments {
  // Legacy format: numbers
  size_discount: number | Step5SizeDiscountResult
  size_discount_reason: string
  liquidity_discount: number | Step6LiquidityDiscountResult
  liquidity_discount_reason: string
  country_adjustment: number
  country_adjustment_reason: string
  growth_premium: number
  growth_premium_reason: string
  combined_effect: number
  base_value_before_adjustments: number
  adjusted_value_after_adjustments: number
}

export interface MethodologySelection {
  selected_methodology: string
  dcf_included: boolean
  dcf_weight: number
  dcf_exclusion_reason?: string
  methodology_downgrade_reason?: string
  multiples_included: boolean
  multiples_weight: number
  selection_rationale: string
}

// Multiple-First Discounting (NEW)
// Discount component breakdown (McKinsey-level transparency)
export interface DiscountComponent {
  name: string // e.g., "Owner Concentration Risk", "Management Absence"
  percentage: number // e.g., -15.0
  source: string // e.g., "Damodaran (2012)"
  description: string // Explanation of this component
}

// Complete discount breakdown with academic sources
export interface DiscountBreakdown {
  base_adjustment?: number // Base discount percentage
  risk_level?: string // e.g., "HIGH", "MEDIUM", "LOW"
  owner_employee_ratio?: number // For owner concentration
  revenue?: number // For size/liquidity context
  revenue_tier?: string // e.g., "Micro (<€1M)"
  sme_status?: string // e.g., "skipped", "applied"
  components: DiscountComponent[] // Component-level breakdown
  total: number // Total discount percentage
  academic_sources: string[] // Full academic citations
  rationale?: string // Overall rationale for discount
}

// Waterfall step for multiple progression visualization
export interface WaterfallStep {
  step: number | string // Step number or "Initial"
  step_name: string // e.g., "Owner Concentration", "Base Multiple (Step 3)"
  multiple_before_low?: number | null
  multiple_before_mid?: number | null
  multiple_before_high?: number | null
  multiple_after_low: number
  multiple_after_mid: number
  multiple_after_high: number
  discount_percentage: number // e.g., -20.0
  description: string // Explanation of this step
}

export interface MultiplePipelineStage {
  step_number: number
  step_name: string
  discount_type: string // 'owner_concentration', 'size', 'liquidity', 'ownership'
  discount_percentage: number // e.g., -20.0 for 20% discount
  multiple_before: number
  multiple_after: number
  // NEW: Enhanced multiple tracking (low/mid/high)
  multiple_before_low?: number
  multiple_before_mid?: number
  multiple_before_high?: number
  multiple_after_low?: number
  multiple_after_mid?: number
  multiple_after_high?: number
  metric_value: number
  ev_before: number
  ev_after: number
  explanation: string
  description?: string
  // NEW: Detailed discount breakdown with academic sources
  discount_breakdown?: DiscountBreakdown
}

export interface MultiplePipeline {
  initial_multiple: number // Starting multiple (e.g., 10x) - mid-point
  final_multiple: number // Final adjusted multiple (e.g., 6.48x) - mid-point
  // NEW: Enhanced multiple tracking (low/mid/high)
  initial_multiple_low?: number
  initial_multiple_mid?: number
  initial_multiple_high?: number
  final_multiple_low?: number
  final_multiple_mid?: number
  final_multiple_high?: number
  total_reduction_percentage: number // e.g., -35.2%
  metric_type: 'EBITDA' | 'Revenue'
  metric_value: number
  stages: MultiplePipelineStage[]
  // NEW: Complete discount waterfall for visualization
  discount_waterfall?: WaterfallStep[]
}

/** Omni-Calc: a single valuation method's result. */
export interface ValuationMethodResult {
  value: number | null
  label: string
  multiple_used?: number | null
  wacc?: number | null
  available: boolean
  unavailable_reason?: string | null
  /** Engine may include equity_range_low / equity_range_high (model band); UI falls back to ±20% if absent. */
  details?: Record<string, unknown> | null
  /** Plan-gated teaser row in Omni panorama (no figures; click opens upgrade). */
  plan_teaser?: boolean
}

export interface HistoricalFcfReadiness {
  status: 'imported_ready' | 'partial' | 'manual_fallback'
  historical_years_count: number
  actual_capex_years: number
  actual_tax_years: number
  actual_nwc_years: number
}

export interface DcfWaccBuildup {
  formula?: string
  cost_of_equity_formula?: string
  risk_free_rate?: number
  beta?: number
  equity_risk_premium?: number
  size_premium?: number
  company_specific_risk?: number
  cost_of_equity?: number
  cost_of_debt?: number
  equity_weight?: number
  debt_weight?: number
  tax_rate?: number
  debt_yield?: number
  tax_shield?: number
  wacc?: number
}

export interface ValuationResponse {
  valuation_id: string
  company_name: string
  /** Optional labels when API includes them (e.g. contribute-multiples, exports). */
  business_type?: string
  industry?: string
  timestamp?: string
  valuation_date?: string
  creditsRemaining?: number // Added for backend credit synchronization

  // Final results - API returns as string for bank-grade precision
  /** Equity value (low estimate) - API returns as string for precision */
  equity_value_low: ApiNumeric
  /** Equity value (mid estimate) - API returns as string for precision */
  equity_value_mid: ApiNumeric
  /** Equity value (high estimate) - API returns as string for precision */
  equity_value_high: ApiNumeric
  range_methodology?: 'multiple_dispersion' | 'confidence_spread' // Methodology used for range calculation
  /** Recommended asking price - API returns as string for precision */
  recommended_asking_price: ApiNumeric

  // Confidence (multiple formats for compatibility) - API returns as string for precision
  /** Confidence score (0-1) - API returns as string for precision */
  confidence_score: ApiNumeric
  overall_confidence: string
  /** Alias for confidence_score - API returns as string for precision */
  confidence?: ApiNumeric // Alias for confidence_score
  multiple_adjustment_summary?: {
    metric_key: 'ev_ebitda_median'
    business_type_id?: string | null
    benchmark_multiple: number | null
    selected_multiple: number | null
    delta_multiple: number | null
    benchmark_confidence_band?: string | null
    benchmark_source?: string | null
    reason_key?: string | null
    reason_tags?: string[]
    free_text_reason?: string | null
    generated_footnote_en?: string | null
    generated_footnote_nl?: string | null
    generated_footnote?: string | null
    acknowledged_extreme?: boolean
    created_at?: string | null
    updated_at?: string | null
  }

  // Validation warnings (from backend sanity checks)
  validation_warnings?: ValidationWarning[]

  // Transparency data
  transparency?: TransparencyData

  // NEW: Modular system metadata (Phase 1: Backend Integration)
  modular_system?: ModularSystem

  // NEW: Methodology statement and academic sources (from Step 11)
  methodology_statement?: string
  academic_sources?: AcademicSource[]
  professional_review_ready?: ProfessionalReviewReady

  // Owner Dependency Assessment (Phase 4: 12-factor analysis)
  owner_dependency_result?: {
    factors: {
      client_concentration: string
      operational_knowledge: string
      sales_relationship: string
      technical_expertise: string
      industry_network: string
      decision_making: string
      brand_reputation: string
      process_documentation: string
      team_capability: string
      succession_planning: string
      business_scalability: string
      contract_transferability: string
    }
    overall_score: number
    risk_level: string
    valuation_adjustment: number
    explanation: string
    key_risks: string[]
    recommendations: string[]
  }
  /** Owner dependency adjustment - API returns as string for precision */
  owner_dependency_adjustment?: ApiNumeric

  // Methodology
  primary_method?: string
  methodology?: string
  methodology_notes?: string
  valuation_summary?: string

  // Weights - API returns as string for precision
  /** DCF methodology weight - API returns as string for precision */
  dcf_weight: ApiNumeric
  /** Multiples methodology weight - API returns as string for precision */
  multiples_weight: ApiNumeric

  // DCF Valuation (detailed breakdown from API)
  dcf_valuation?: {
    enterprise_value: number
    equity_value: number
    wacc: number
    cost_of_equity: number
    cost_of_debt: number
    terminal_growth_rate: number
    terminal_value: number
    terminal_value_methodology?: 'gordon_growth' | 'exit_multiple' | string | null
    terminal_exit_multiple?: number | null
    pv_terminal_value: number
    /** Explicit mid-year convention for auditors (matches engine). */
    mid_year_discounting?: boolean
    discount_periods_note?: string | null
    /** CAPM + size (excludes CSR) for academic disclosure alongside full cost_of_equity. */
    academic_cost_of_equity_formula?: string | null
    wacc_buildup?: DcfWaccBuildup | null
    terminal_value_pct_of_total?: number | null
    explicit_forecast_pct_of_total?: number | null
    fcf_projections_5y: number[]
    pv_fcf_projections_5y: number[]
    sensitivity_wacc: Record<string, number>
    sensitivity_growth: Record<string, number>
    sensitivity_matrix_2d?: {
      wacc_values: number[]
      growth_values?: number[]
      secondary_values?: number[]
      secondary_axis_key?: 'terminal_growth' | 'exit_multiple' | string
      secondary_axis_format?: 'percent' | 'multiple' | string
      ev_matrix: number[][]
    }
    confidence: string
    confidence_score: number
    confidence_factors: Record<string, string>
    historical_fcf_readiness?: HistoricalFcfReadiness | null
  }

  // Market Multiples (detailed breakdown from API)
  multiples_valuation?: {
    ev_ebitda_valuation: number
    ev_revenue_valuation: number
    pe_valuation: number | null
    ebitda_multiple: number
    revenue_multiple: number
    pe_multiple: number | null
    enterprise_value?: number // Optional enterprise value if provided

    // Percentile multiples (P10–P90, P25/P50/P75) from Upswitch SME / business-type benchmarks
    p10_ebitda_multiple?: number
    p25_ebitda_multiple?: number
    p50_ebitda_multiple?: number
    p75_ebitda_multiple?: number
    p90_ebitda_multiple?: number
    p25_revenue_multiple?: number
    p50_revenue_multiple?: number
    p75_revenue_multiple?: number

    comparables_count: number
    comparables_quality: string
    size_discount: number
    liquidity_discount: number
    country_adjustment: number
    total_adjustment: number
    adjusted_equity_value: number
    confidence: string
    confidence_score: number

    // Owner concentration details
    // Supports both legacy format (from multiples_valuation) and modular system format (from step results)
    owner_concentration?: {
      ratio: number // 0.0 to 1.0
      adjustment_factor: number // e.g., -0.12 for -12%
      number_of_owners: number
      number_of_employees: number
      risk_level?: string // "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
      calibration?: {
        // Optional: if backend sends calibration details
        business_type_id?: string
        calibration_type?: 'industry-specific' | 'universal'
        owner_dependency_impact?: number
        tier_used?: string // "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
      }
      // Extended properties from modular system step results (optional for backward compatibility)
      enterprise_value_low?: number
      enterprise_value_mid?: number
      enterprise_value_high?: number
      owner_employee_ratio?: number | null
      normalized_ratio?: number
      adjustment_percentage?: number
      ev_change?: number
      calibration_used?: boolean
      ev_low_before?: number
      ev_mid_before?: number
      ev_high_before?: number
      ev_low_after?: number
      ev_mid_after?: number
      ev_high_after?: number
    }

    // Original (unadjusted) multiples for transparency
    unadjusted_ebitda_multiple?: number
    unadjusted_revenue_multiple?: number

    // Primary multiple method transparency (from backend)
    primary_multiple_method?: string // "ebitda_multiple" or "revenue_multiple"
    primary_multiple_reason?: string // Explanation of why this method was selected
    primary_method?: string // "EV/EBITDA" or "EV/Revenue" (from backend Step 2)
    primary_method_reason?: string // Explanation of why primary_method was selected (from backend Step 2)
  }

  // Financial Metrics (comprehensive)
  financial_metrics: {
    gross_margin: number
    ebitda_margin: number
    ebit_margin: number
    net_margin: number
    return_on_assets: number
    return_on_equity: number
    current_ratio: number
    quick_ratio: number
    cash_ratio: number
    debt_to_equity: number
    debt_to_assets: number
    interest_coverage: number
    /**
     * Year-over-year revenue growth in DECIMAL format (0.20 = 20%, -0.15 = -15%)
     * Frontend should multiply by 100 to display as percentage
     */
    revenue_growth: number
    /**
     * Compound Annual Growth Rate in DECIMAL format (0.0037 = 0.37%, 0.111 = 11.1%)
     * Calculated from first historical year to current year
     * Backend guarantees this is never null/undefined (defaults to 0.0)
     * Frontend should multiply by 100 to display as percentage
     */
    revenue_cagr_3y: number
    ebitda_growth: number
    altman_z_score: number
    financial_health_score: number
    financial_health_description: string
    /**
     * Optional list of calculation error messages.
     * Presence indicates partial results - some calculations may have failed.
     */
    calculation_errors?: string[]
  }

  // Legacy fields for backward compatibility
  dcf_result?: {
    enterprise_value: number
    equity_value: number
    wacc: number
    terminal_value: number
    pv_fcf: number
    pv_terminal_value: number
    fcf_projections: Array<{
      year: number
      revenue: number
      ebitda: number
      fcf: number
      discount_factor: number
      pv_fcf: number
    }>
  }

  multiples_result?: {
    ev_ebitda_valuation: number
    ev_revenue_valuation: number
    pe_valuation: number | null
    comparable_companies: Array<{
      name: string
      ev_ebitda: number
      ev_revenue: number
      pe_ratio?: number
    }>
  }

  // Ownership adjustment (optional)
  ownership_adjustment?: {
    shares_for_sale: number
    control_premium: number
    adjusted_value: number
  }

  // Insights (multiple formats for compatibility)
  key_value_drivers: string[]
  value_drivers?: string[] // Alias for key_value_drivers
  risk_factors: string[]

  // Small Firm Effect Transparency (Phase: Small Firm Transparency)
  methodology_selection?: MethodologySelection
  small_firm_adjustments?: SmallFirmAdjustments
  dcf_exclusion_reason?: string
  methodology_downgrade_reason?: string // Backward compatibility field

  // Multiple-First Discounting pipeline
  multiple_pipeline?: MultiplePipeline

  // Additional data
  revenue?: ApiNumeric
  ebitda?: ApiNumeric
  details?: Record<string, unknown>
  valuation_result?: Record<string, any>
  htmlReport?: string
  current_year_data?: YearDataInput // For accessing revenue, ebitda, etc.
  historical_years_data?: YearDataInput[] // Historical financial data for trend analysis
  filing_year_confirmed?: boolean

  // Omni-Calc: all methods calculated simultaneously
  valuation_results?: Record<string, ValuationMethodResult>
  selected_valuation_method?: string

  /** User-configured blended valuation (Waarderingssynthese). Present when user_weights were supplied. */
  weighted_valuation?: {
    blended_equity_value: number | string
    contributions: Array<{
      method_key: string
      label: string
      equity_value: number | string
      weight: number
      weighted_contribution: number | string
    }>
    user_justification?: string | null
  }
  fiscal_4x_anchor?: number | null
  /** Effective fiscal PDF flag (Titan: branding + per-report override) */
  show_fiscal_reference?: boolean
  fiscal_reference_pdf_mode?: 'inherit' | 'include' | 'exclude'

  /** Report row timestamps (Titan spreads `...report` on GET report) — PDF staleness UX */
  updated_at?: string | null
  pdf_generated_at?: string | null
  pdf_url?: string | null

  // HTML Reports (REQUIRED for display)
  /** Complete Accountant View HTML report (20-30 pages) */
  html_report?: string

  /** EV → equity bridge steps (aligned with report valuation_waterfall_steps) */
  ev_equity_waterfall_steps?: EvEquityWaterfallStep[]
  /** Titan may persist full Jinja context; waterfall steps may appear here if top-level omitted */
  report_context?: Record<string, unknown>
}

/** One bar/step in the enterprise-to-equity waterfall (ValuationIQ JSON). */
export interface EvEquityWaterfallStep {
  label: string
  short_label?: string
  kind?: string
  tone?: 'positive' | 'negative' | 'neutral' | 'bridge' | 'brand' | string
  start_value?: number
  end_value?: number
  delta_value?: number
  annotation?: string | null
}

export interface CompanyLookupResult {
  name: string
  industry: string
  country: string
  founding_year?: number
  employees?: number
  business_model?: string
  revenue?: number
  description?: string
}

export interface DocumentParseResult {
  extracted_data: Partial<ValuationRequest>
  confidence: number
  warnings: string[]
}

// =============================================================================
// INTELLIGENT CONVERSATION TYPES
// =============================================================================

export interface ConversationStartRequest {
  user_id?: string // Add user_id for intelligent triage
  business_context?: {
    company_name?: string
    industry?: string
    business_model?: string
    country_code?: string
    founding_year?: number
    business_type_id?: string // NEW: PostgreSQL business type ID
  }
  user_preferences?: {
    preferred_methodology?: string
    time_commitment?: 'quick' | 'detailed' | 'comprehensive'
    focus_area?: 'valuation' | 'growth' | 'risk' | 'all'
  }
  pre_filled_data?: Partial<ValuationRequest>
}

export interface ConversationStartResponse {
  session_id: string
  complete: boolean
  ai_message: string
  step: number
  field_name?: string
  input_type?: string
  validation_rules?: Record<string, any>
  help_text?: string
  context: Record<string, any>
  owner_profile_needed: boolean
  valuation_result?: any
}

export interface ConversationQuestion {
  id: string
  question: string
  question_type: 'multiple_choice' | 'text' | 'number' | 'yes_no' | 'rating'
  options?: string[]
  required: boolean
  context?: string
  help_text?: string
}

export interface ConversationStepRequest {
  session_id: string
  answer: string | number | boolean
  question_id: string
  additional_context?: string
}

export interface ConversationStepResponse {
  next_question?: ConversationQuestion
  is_complete: boolean
  progress_percentage: number
  current_valuation?: ValuationResponse
  insights?: string[]
  recommendations?: string[]
}

export interface ConversationContext {
  session_id: string
  business_context: Partial<ValuationRequest>
  owner_profile: OwnerProfile
  conversation_history: ConversationHistory[]
  current_step: number
  total_steps: number
  methodology_selected?: string
  collected_data?: Record<string, any>

  // ADD: Extracted business information
  extracted_business_model?: BusinessModel | string
  extracted_founding_year?: number
  extraction_confidence?: {
    business_model?: number // 0-1 confidence score
    founding_year?: number
  }
}

export interface ConversationHistory {
  question_id: string
  question: string
  answer: string | number | boolean
  timestamp: string
  context_added?: string
}

// =============================================================================
// BUSINESS TYPE ANALYSIS TYPES
// =============================================================================

export interface BusinessTypeAnalysis {
  business_type: string
  industry_code: string
  methodology_recommendation: string
  confidence_score: number
  reasoning: string
  key_factors: string[]
  risk_factors: string[]
  growth_potential: 'low' | 'medium' | 'high'
  market_maturity: 'emerging' | 'growing' | 'mature' | 'declining'
}

export interface MethodologyRecommendation {
  recommended_methodology: string
  alternative_methodologies: string[]
  confidence_score: number
  reasoning: string
  key_factors: string[]
  expected_accuracy: number
  time_estimate: string
}

// =============================================================================
// OWNER PROFILING TYPES
// =============================================================================

export interface OwnerProfile {
  involvement_level: 'hands_on' | 'strategic' | 'passive' | 'absentee'
  time_commitment: number // hours per week
  succession_plan: 'family' | 'management' | 'sale' | 'none' | 'uncertain'
  risk_tolerance: 'conservative' | 'moderate' | 'aggressive'
  growth_ambition: 'maintain' | 'moderate_growth' | 'aggressive_growth' | 'exit'
  industry_experience: number // years
  management_team_strength: 'weak' | 'adequate' | 'strong' | 'excellent'
  key_man_risk: boolean
  personal_guarantees: boolean
  additional_context?: string
}

export interface OwnerProfileRequest {
  session_id?: string
  profile: OwnerProfile
  business_context: Partial<ValuationRequest>
}

export interface OwnerProfileResponse {
  profile_analysis: {
    risk_assessment: string
    value_impact: string
    recommendations: string[]
    confidence_score: number
  }
  valuation_adjustments?: {
    risk_premium_adjustment: number
    growth_rate_adjustment: number
    multiple_adjustment: number
    reasoning: string
  }
}

// =============================================================================
// VALUATION TOOLBAR TYPES
// =============================================================================

export interface ValuationInputData {
  revenue: number
  ebitda: number
  industry: string
  country_code: string
  founding_year?: number
  employees?: number
  business_model?: string
  historical_years_data?: YearDataInput[]
  total_debt?: number
  cash?: number
  metrics?: {
    gross_margin: number
    ebitda_margin: number
    ebit_margin: number
    net_margin: number
    return_on_assets: number
    return_on_equity: number
    current_ratio: number
    quick_ratio: number
    cash_ratio: number
    debt_to_equity: number
    debt_to_assets: number
    interest_coverage: number
    asset_turnover: number
    inventory_turnover: number
    receivables_turnover: number
    payables_turnover: number
    revenue_growth: number
    financial_health_description: string
  }
}

export interface ValuationToolbarProps {
  onRefresh?: () => void
  onDownload?: () => void
  onFullScreen?: () => void
  isGenerating?: boolean
  user?: any
  valuationName?: string
  valuationId?: string
  activeTab?: 'preview' | 'history'
  onTabChange?: (tab: 'preview' | 'history') => void
  companyName?: string
  valuationMethod?: string
  // M&A Workflow: Version management
  versions?: import('./ValuationVersion').ValuationVersion[]
  activeVersion?: number
  onVersionSelect?: (versionNumber: number) => void
}

// NEW: Dual format display type
export interface ValuationAdjustmentDisplay {
  percentageFormat: string
  multipleFormat: string
  baseMultiple: number
  adjustedMultiple: number
  multipleImpact: number
  isApplicable: boolean
}

// =============================================================================
// UNIFIED VALUATION SESSION TYPES
// =============================================================================

/**
 * Unified ValuationSession that both manual and AI-guided flows populate
 * Extends ValuationRequest with session metadata for unified data management
 */
export interface ValuationSession {
  // Session metadata
  reportId: string // Links to report URL (val_timestamp_random format) - single ID for everything
  currentView: 'manual' | 'conversational' // Current UI view
  dataSource: 'manual' | 'conversational' | 'mixed' // Tracks which flow provided data
  status?: 'active' | 'completed' | 'expired' | string
  reportReady?: boolean
  name?: string // Custom valuation name (e.g., "Amadeus report")

  // Timestamps
  createdAt: Date
  updatedAt: Date
  completedAt?: Date
  lastSyncedAt?: Date // Last time data was synced between flows
  calculatedAt?: Date // When valuation was calculated

  // Data completeness tracking (0-100)
  completeness?: number

  // Partial data collection (incremental updates)
  partialData: Partial<ValuationRequest>

  // Complete session data (merged from partialData)
  // This is the canonical ValuationRequest that will be sent for calculation
  sessionData?: Partial<ValuationRequest>

  // Valuation result data (for completed valuations)
  valuationResult?: ValuationResponse // Full valuation result including calculations
  htmlReport?: string // Generated HTML report
}
