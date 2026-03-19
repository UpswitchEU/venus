import type {
  BusinessModel, // ADD: BusinessModel import
  ConversationContext,
  ConversationStartResponse,
  ConversationStepRequest,
  ConversationStepResponse,
  OwnerProfileRequest,
} from '../types/valuation'
import {
  inferBusinessModelFromIndustry,
  isValidYear,
  mapToBusinessModel,
} from '../utils/businessExtractionUtils'
import { serviceLogger } from '../utils/logger'
import { api } from './api'

export interface TriageSession {
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

export interface StartTriageRequest {
  user_id?: string
  company_id?: string
  business_type?: string
  industry?: string
  country_code?: string
  business_context?: Record<string, any>
  pre_filled_data?: Record<string, any>
  user_preferences?: Record<string, any>
}

export interface TriageStepRequest {
  session_id: string
  field: string
  value: any
  context_data?: Record<string, any>
}

export const intelligentTriageService = {
  /**
   * Start intelligent conversation with pre-filled business data
   */
  async startConversation(request: StartTriageRequest): Promise<TriageSession> {
    try {
      const response: ConversationStartResponse = await api.startConversation(request)

      // Add null safety checks for response
      if (!response) {
        serviceLogger.warn('Triage API returned empty response, using fallback')
        throw new Error('Empty triage response')
      }

      // Convert to TriageSession format - map backend response directly
      return {
        session_id: response.session_id,
        complete: response.complete || false,
        ai_message: response.ai_message || 'Welcome to the valuation conversation',
        step: response.step || 0,
        field_name: response.field_name, // Direct mapping, not response.next_question.id
        input_type: response.input_type, // Direct mapping, not response.next_question.question_type
        validation_rules: response.validation_rules || { required: true },
        help_text: response.help_text || '',
        context: response.context || {},
        owner_profile_needed: response.owner_profile_needed || false,
        valuation_result: response.valuation_result,
      }
    } catch (error) {
      serviceLogger.error('Failed to start triage conversation', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw new Error('Failed to start intelligent conversation')
    }
  },

  /**
   * Process conversation step with user response
   */
  async processStep(
    sessionId: string,
    field: string,
    value: any,
    contextData?: Record<string, any>
  ): Promise<TriageSession> {
    try {
      // Extract business_model if mentioned
      if (field === 'business_model' || field === 'industry' || field === 'business_type') {
        const extractedBusinessModel = this.extractBusinessModelFromValue(value, field)
        if (extractedBusinessModel) {
          // Store in context for later use
          contextData = {
            ...contextData,
            extracted_business_model: extractedBusinessModel,
          }
        }
      }

      // Extract founding_year if mentioned
      if (field === 'founding_year' || field === 'company_age' || field === 'years_in_operation') {
        const extractedYear = this.extractFoundingYearFromValue(value, field)
        if (extractedYear) {
          contextData = {
            ...contextData,
            extracted_founding_year: extractedYear,
          }
        }
      }

      const request: ConversationStepRequest = {
        session_id: sessionId,
        answer: value,
        question_id: field,
        additional_context: contextData ? JSON.stringify(contextData) : undefined,
      }

      const response: ConversationStepResponse = await api.conversationStep(request)

      // ✅ Add null safety
      if (!response) {
        throw new Error('Empty response from conversation step API')
      }

      // Convert to TriageSession format
      return {
        session_id: sessionId,
        complete: response.is_complete ?? false,
        ai_message: response.next_question?.question || 'Conversation complete',
        step: 0, // Will be updated based on progress
        field_name: response.next_question?.id,
        input_type: response.next_question?.question_type,
        validation_rules: {
          required: response.next_question?.required ?? false,
        },
        help_text: response.next_question?.help_text || '',
        context: {
          progress_percentage: response.progress_percentage ?? 0,
          insights: response.insights || [],
          recommendations: response.recommendations || [],
        },
        owner_profile_needed: false, // Will be determined by backend
        valuation_result: response.current_valuation,
      }
    } catch (error) {
      serviceLogger.error('Failed to process triage step', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw new Error(
        `Failed to process conversation step: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  },

  /**
   * Extract business model from conversation value
   */
  extractBusinessModelFromValue(value: any, field: string): BusinessModel | string | null {
    if (field === 'business_model') {
      return mapToBusinessModel(String(value))
    }

    if (field === 'industry') {
      return inferBusinessModelFromIndustry(String(value))
    }

    return null
  },

  /**
   * Extract founding year from conversation value
   */
  extractFoundingYearFromValue(value: any, field: string): number | null {
    if (field === 'founding_year') {
      const year = parseInt(String(value))
      return isValidYear(year) ? year : null
    }

    if (field === 'years_in_operation' || field === 'company_age') {
      const years = parseInt(String(value))
      return new Date().getFullYear() - years
    }

    return null
  },

  // Note: mapToBusinessModel, inferBusinessModelFromIndustry, and isValidYear
  // are now imported from businessExtractionUtils to eliminate code duplication

  /**
   * Get current conversation context
   */
  async getContext(sessionId: string): Promise<TriageSession> {
    try {
      const response: ConversationContext = await api.getConversationContext(sessionId)

      // Convert to TriageSession format
      return {
        session_id: response.session_id,
        complete: response.current_step >= response.total_steps,
        ai_message: 'Continue conversation',
        step: response.current_step,
        field_name: undefined,
        input_type: undefined,
        validation_rules: {},
        help_text: undefined,
        context: {
          business_context: response.business_context,
          owner_profile: response.owner_profile,
          conversation_history: response.conversation_history,
          methodology_selected: response.methodology_selected,
        },
        owner_profile_needed: false,
        valuation_result: undefined,
      }
    } catch (error) {
      serviceLogger.error('Failed to get triage context', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw new Error('Failed to get conversation context')
    }
  },

  /**
   * Create owner profile for human factor in valuation
   */
  async createOwnerProfile(
    businessId: string,
    profileData: {
      hours_per_week: number
      primary_tasks: string[]
      delegation_capability: number
      succession_plan: boolean
      succession_details?: string
    },
    countryCode: string = 'BE'
  ): Promise<any> {
    try {
      // Convert to OwnerProfile format
      const ownerProfile = {
        involvement_level: 'hands_on' as const,
        time_commitment: profileData.hours_per_week,
        succession_plan: profileData.succession_plan ? ('management' as const) : ('none' as const),
        risk_tolerance: 'moderate' as const,
        growth_ambition: 'moderate_growth' as const,
        industry_experience: 5, // Default value
        management_team_strength: 'adequate' as const,
        key_man_risk: profileData.delegation_capability < 5,
        personal_guarantees: false,
        additional_context: profileData.succession_details,
      }

      const request: OwnerProfileRequest = {
        profile: ownerProfile,
        business_context: {
          company_name: businessId,
          country_code: countryCode,
        },
      }

      const response = await api.submitOwnerProfile(request)
      return response
    } catch (error) {
      serviceLogger.error('Failed to create owner profile', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw new Error('Failed to create owner profile')
    }
  },
}
