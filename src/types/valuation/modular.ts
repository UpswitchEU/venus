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
  value: unknown
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
  key_outputs?: Record<string, unknown> // Key outputs from step
  reason?: string // Reason for skip
  error?: string // Error message if failed
  methodology_note?: string // Methodology-specific note
  formula?: string // Calculation formula (legacy)
  inputs?: Record<string, unknown> // Input data (legacy)
  outputs?: Record<string, unknown> // Output data (legacy)
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
  inputs: Record<string, unknown>
  outputs: Record<string, unknown>
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
