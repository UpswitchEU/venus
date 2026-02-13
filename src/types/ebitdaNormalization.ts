/**
 * Type definitions for EBITDA Normalization (Frontend)
 *
 * Supports the first primitive: the normalization bridge (economic truth)
 * Transforms reported EBITDA to normalized EBITDA through 12 adjustment categories
 */

// 12 Adjustment Categories
export enum NormalizationCategory {
  OWNER_COMPENSATION = 'owner_compensation_adjustment',
  ONE_TIME_EXPENSES = 'one_time_expenses',
  PERSONAL_EXPENSES = 'personal_expenses',
  RELATED_PARTY = 'related_party_transactions',
  NON_RECURRING_REVENUE = 'non_recurring_revenue',
  NON_RECURRING_COSTS = 'non_recurring_costs',
  DEPRECIATION = 'depreciation_adjustment',
  FAMILY_EXPENSES = 'family_expenses',
  UNUSUAL_TRANSACTIONS = 'unusual_transactions',
  TAX_OPTIMIZATION = 'tax_optimization_reversal',
  DISCRETIONARY_EXPENSES = 'discretionary_expenses',
  OTHER_ADJUSTMENTS = 'other_adjustments',
}

export type ConfidenceScore = 'low' | 'medium' | 'high'

export interface CustomAdjustment {
  id?: string // Client-side ID for React keys
  description: string
  amount: number
  note?: string
}

export interface NormalizationAdjustment {
  category: NormalizationCategory
  amount: number
  note?: string
  confidence?: ConfidenceScore
}

export interface EbitdaNormalization {
  id?: string
  session_id: string
  version_id?: string | null
  year: number
  reported_ebitda: number
  adjustments: NormalizationAdjustment[]
  custom_adjustments: CustomAdjustment[]
  total_adjustments: number
  normalized_ebitda: number
  confidence_score: ConfidenceScore
  market_rate_source?: string | null
  created_at?: string
  updated_at?: string
}

export interface MarketRateSuggestion {
  category: NormalizationCategory
  suggested_amount: number
  market_rate_50th_percentile?: number
  market_rate_75th_percentile?: number
  suggested_percentage?: number
  rationale: string
  confidence: ConfidenceScore
  source?: string
}

export interface NormalizationBridgeData {
  year: number
  reported_ebitda: number
  adjustments: NormalizationAdjustment[]
  normalized_ebitda: number
  total_adjustments: number
  adjustment_percentage: number
}

// API Request/Response types
export interface CreateNormalizationRequest {
  session_id: string
  user_id?: string | null
  version_id?: string | null
  year: number
  reported_ebitda: number
  adjustments: NormalizationAdjustment[]
  custom_adjustments?: CustomAdjustment[]
  confidence_score?: ConfidenceScore
  market_rate_source?: string
}

export interface GetNormalizationResponse {
  id: string
  version_id: string | null
  year: number
  reported_ebitda: number
  adjustments: NormalizationAdjustment[]
  custom_adjustments: CustomAdjustment[]
  total_adjustments: number
  normalized_ebitda: number
  confidence_score: ConfidenceScore
  market_rate_source: string | null
  created_at: string
  updated_at: string
}

export interface MarketRatesResponse {
  owner_compensation_market_rate?: number
  owner_compensation_percentile_50?: number
  owner_compensation_percentile_75?: number
  personal_expenses_suggested_percentage?: number
  discretionary_expenses_suggested_percentage?: number
  industry: string
  location: string
  confidence: ConfidenceScore
  source?: string
}

// Category definition for UI
export interface NormalizationCategoryDefinition {
  id: NormalizationCategory
  label: string
  description: string
  detailedDescription: string
  examples: string[]
  marketRateLogic: string
  validationRules: {
    min: number
    max: number
    warningThreshold?: number
    warningMessage?: string
  }
  confidenceFactors?: string[]
  helpText?: string
  adjustmentDirection: 'add' | 'subtract' | 'both'
  visualGuidance: {
    positiveScenario: string
    negativeScenario: string
  }
}
