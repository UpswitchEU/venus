import type { BusinessModel, ValuationRequest } from './request'
import type { ValuationResponse } from './response'

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
  validation_rules?: Record<string, unknown>
  help_text?: string
  context: Record<string, unknown>
  owner_profile_needed: boolean
  valuation_result?: unknown
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
  collected_data?: Record<string, unknown>

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
