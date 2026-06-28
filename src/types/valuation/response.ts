import type {
  AcademicSource,
  DcfWaccBuildup,
  HistoricalFcfReadiness,
  MethodologySelection,
  ModularSystem,
  MultiplePipeline,
  ProfessionalReviewReady,
  SmallFirmAdjustments,
  TransparencyData,
  ValidationWarning,
  ValuationMethodResult,
} from './modular'
import type { ApiNumeric, ValuationRequest, YearDataInput } from './request'

/**
 * BET-462 — the canonical VALUATION PRESENTATION CONTRACT (Titan
 * `buildValuationPresentationContract`). The honest display directives every
 * surface reads to render the number by tier, so a false-precision point can
 * never appear at the indicative tier. Inner fields mirror Titan verbatim
 * (camelCase); all copy fields are the backend's brand-reviewed strings, rendered
 * as-is. Optional on the response — present only once the backend attaches it.
 */
export interface PresentationContract {
  tier: 'indicative' | 'defensible' | 'attested'
  tierLabel: string
  tierDescription: string
  /** `band_only` ⇒ a RANGE only, never a single point (no false precision). */
  display: 'band_only' | 'point_and_band'
  showPointEstimate: boolean
  pointEstimateBasis: 'none' | 'policy' | 'proven_calibration' | 'attested'
  /** Minimum band half-width as a fraction of the base (0.3 ⇒ ±30%). */
  bandFloorWidth: number
  confidence: 'low' | 'medium' | 'high'
  confidenceLabel: string
  disclaimer: string
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
  /**
   * BET-462 — the backend's honest presentation contract for THIS valuation.
   * Present only once Titan attaches it to the calculate/session response;
   * surfaces render it (tier label + confidence + disclaimer, band-only vs
   * point+band) only when present, so behaviour is unchanged until then.
   */
  presentation_contract?: PresentationContract
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
    reason_label_en?: string | null
    reason_label_nl?: string | null
    free_text_reason?: string | null
    generated_footnote_en?: string | null
    generated_footnote_nl?: string | null
    generated_footnote?: string | null
    acknowledged_extreme?: boolean
    created_at?: string | null
    updated_at?: string | null
    updated_by_user_id?: string | null
  }

  // Validation warnings (from backend sanity checks)
  validation_warnings?: ValidationWarning[]

  /** Academic guardrail failures (e.g. WACC range) — also rendered on report disclaimers page. */
  academic_validation_issues?: string[]

  // Transparency data
  transparency?: TransparencyData

  // NEW: Modular system metadata (Phase 1: Backend Integration)
  modular_system?: ModularSystem

  // NEW: Methodology statement and academic sources (from Step 11)
  methodology_statement?: string
  academic_sources?: AcademicSource[]
  professional_review_ready?: ProfessionalReviewReady

  // Owner Dependency Assessment (Phase 4: 12-factor analysis).
  // OWNER-PROFILING-1 / OP-6 — `raw_adjustment` field added so the cover-page
  // chip can render "MVP cap applied — full risk -X%" when the engine
  // emitted more than -15% but the synthesizer clamped. Per SPIKE-1 §5.4 the
  // raw figure must NEVER be displayed without the "cap applied" framing —
  // see the `OwnerProfilingChip` component contract for the enforcement.
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
    /** Engine-emitted (uncapped) figure preserved for cap-applied messaging. */
    raw_adjustment?: number | null
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
    /** Operating DCF value before APV debt tax shields are added. */
    dcf_enterprise_value_before_apv?: number | null
    dcf_equity_value_before_apv?: number | null
    apv_methodology?: string | null
    apv_discount_rate?: number | null
    apv_discounting_convention?: 'mid_year' | 'year_end' | string | null
    apv_tax_shield_value?: number | null
    apv_tax_shield_pct_of_total?: number | null
    apv_enterprise_value?: number | null
    apv_equity_value?: number | null
    apv_tax_shield_projections_5y?: number[] | null
    apv_tax_shield_pv_5y?: number[] | null
    apv_bridge_provenance?: Record<string, unknown> | null
    apv_benchmark_reconciliation?: Record<string, unknown> | null
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
  valuation_result?: Record<string, unknown>
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
  /** Render snapshot fingerprint from Titan (guards stale HTML fallback). */
  render_fingerprint?: string
  /** Fingerprint the persisted PDF was built from (`metadata.pdf_render_fingerprint`). */
  pdf_render_fingerprint?: string | null
  /**
   * Authoritative PDF coherence from Titan (`getCoherentPersistedPdfUrl`): `true` when the
   * persisted PDF provably matches current economics. Preferred over fingerprint comparison.
   */
  pdf_coherent?: boolean | null

  /** EV → equity bridge steps (aligned with report valuation_waterfall_steps) */
  ev_equity_waterfall_steps?: EvEquityWaterfallStep[]
  /** Titan may persist full Jinja context; waterfall steps may appear here if top-level omitted */
  report_context?: Record<string, unknown>

  /** ISO-4217 currency of the headline equity band (set by the restore hydrator from the pricing range). */
  currency?: string

  /**
   * Per-year valuation timeline (the value-over-fiscal-years curve): one adaptive
   * valuation per year (historical actuals + current + forecast), restated on the
   * current market lens. The report shows the latest year; this curve shows the
   * full trend. Always attached by Titan for full valuations; absent on legacy
   * persisted reports that predate it (the curve degrades to a single point).
   */
  valuation_timeline?: ValuationTimelinePoint[]
}

/**
 * One fiscal-year point on the {@link ValuationResponse.valuation_timeline} curve.
 * Numerics arrive as strings or numbers (Python decimal precision) — parse before
 * charting. Mirrors Titan's `ValuationTimelinePoint`.
 */
export interface ValuationTimelinePoint {
  fiscal_year: number
  equity_low: ApiNumeric
  equity_mid: ApiNumeric
  equity_high: ApiNumeric
  currency?: string
  methodology_used?: string | null
  confidence_level?: string | null
  confidence_score?: ApiNumeric | null
  is_forecast?: boolean
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
