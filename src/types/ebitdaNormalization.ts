/**
 * EBITDA Normalization Types (Venus)
 *
 * Canonical enums/metadata are vendored in `./canonical/normalization` so
 * standalone Vercel builds resolve without the monorepo `packages/types` tree.
 */

import type { ConfidenceScoreValue, NormalizationCategory } from './canonical/normalization'

export {
  CATEGORY_METADATA,
  ConfidenceScore,
  type ConfidenceScoreValue,
  NORMALIZATION_CATEGORY_VALUES,
  NormalizationCategory,
  type NormalizationCategoryMetadata,
  type NormalizationItemBase,
  type NormalizationSource,
  type NormalizationStatus,
  type NormalizationType,
} from './canonical/normalization'

export interface CustomAdjustment {
  id?: string
  description: string
  amount: number
  note?: string
  ledger_code?: string
  ledger_name?: string
}

export interface NormalizationAdjustment {
  category: NormalizationCategory
  amount: number
  note?: string
  confidence?: ConfidenceScoreValue
  ledger_code?: string
  ledger_name?: string
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
  confidence_score: ConfidenceScoreValue
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
  confidence: ConfidenceScoreValue
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

export interface CreateNormalizationRequest {
  session_id: string
  user_id?: string | null
  version_id?: string | null
  year: number
  reported_ebitda: number
  adjustments: NormalizationAdjustment[]
  custom_adjustments?: CustomAdjustment[]
  confidence_score?: ConfidenceScoreValue
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
  confidence_score: ConfidenceScoreValue
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
  confidence: ConfidenceScoreValue
  source?: string
}

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
