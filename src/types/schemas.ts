/**
 * Zod Validation Schemas
 *
 * Runtime type validation for API responses and user inputs.
 * Provides type-safe parsing with automatic error handling.
 *
 * @module types/schemas
 */

import { z } from 'zod'

/**
 * Financial Data Schema
 */
export const FinancialDataSchema = z
  .object({
    revenue: z.number().min(0, 'Revenue must be positive'),
    ebitda: z.number(), // Can be negative
    net_income: z.number().optional(),
    gross_profit: z.number().min(0).optional(),
    operating_expenses: z.number().min(0).optional(),
  })
  .strict()

export const YearFinancialDataSchema = z
  .object({
    year: z.number().int().min(1900).max(2100),
    revenue: z.number().min(0, 'Revenue must be positive'),
    ebitda: z.number(),
    is_forecast: z.boolean().optional(),
  })
  .passthrough()

/**
 * Valuation Request Schema
 */
export const ValuationRequestSchema = z
  .object({
    company_name: z.string().min(1, 'Company name is required'),
    country_code: z.string().length(2, 'Country code must be 2 characters'),
    industry: z.string().min(1, 'Industry is required'),
    business_model: z.string().optional(),
    founding_year: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
    current_year_data: FinancialDataSchema,
    historical_years_data: z.array(YearFinancialDataSchema).optional(),
    forecast_years_data: z.array(YearFinancialDataSchema).optional(),
    number_of_employees: z.number().int().min(0).optional(),
    number_of_owners: z.number().int().min(1).optional(),
    recurring_revenue_percentage: z.number().min(0).max(100).optional(),
    /** Venus always values 100% of the business; omit or set exactly 100. */
    shares_for_sale: z.literal(100).optional(),
    business_type_id: z.string().optional(),
    business_context: z.record(z.unknown()).optional(),
    comparables: z.array(z.unknown()).optional(),
  })
  .strict()

/**
 * Valuation Response Schema
 */
export const ValuationResponseSchema = z
  .object({
    valuation_id: z.string(),
    equity_value_low: z.number(),
    equity_value_mid: z.number(),
    equity_value_high: z.number(),
    methodology: z.string(),
    confidence_score: z.number().min(0).max(100),
    html_report: z.string().optional(),
    created_at: z.string().datetime().optional(),
    methodology_weights: z.record(z.number()).optional(),
    assumptions: z.record(z.unknown()).optional(),
    risk_factors: z.array(z.string()).optional(),
  })
  .passthrough() // Allow additional fields for backward compatibility

/**
 * Conversation Message Schema
 */
export const ConversationMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    timestamp: z.string().datetime(),
    field_name: z.string().optional(),
    confidence: z.number().min(0).max(1).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict()

/**
 * Conversation Context Schema
 */
export const ConversationContextSchema = z
  .object({
    session_id: z.string(),
    owner_profile: z
      .object({
        involvement_level: z.string(),
        time_commitment: z.number(),
        succession_plan: z.string(),
        risk_tolerance: z.string(),
        growth_ambition: z.string(),
        industry_experience: z.number(),
        management_team_strength: z.string(),
        key_man_risk: z.boolean(),
        personal_guarantees: z.boolean(),
      })
      .optional(),
    conversation_history: z.array(ConversationMessageSchema),
    current_step: z.number(),
    total_steps: z.number(),
    extracted_business_model: z.string().optional(),
    extracted_founding_year: z.number().optional(),
    business_context: z.record(z.unknown()).optional(),
    extraction_confidence: z.record(z.number()).optional(),
    collected_data: z.record(z.unknown()).optional(),
  })
  .passthrough()

/**
 * Session History Response Schema
 */
export const SessionHistoryResponseSchema = z
  .object({
    exists: z.boolean(),
    messages: z.array(ConversationMessageSchema).optional(),
    fields_collected: z.number().optional(),
    completeness_percent: z.number().min(0).max(100).optional(),
  })
  .strict()

/**
 * API Error Response Schema
 */
export const APIErrorResponseSchema = z
  .object({
    error: z.string(),
    message: z.string(),
    code: z.string().optional(),
    status: z.number().optional(),
    details: z.record(z.unknown()).optional(),
  })
  .strict()

/**
 * Business Profile Data Schema
 */
export const BusinessProfileDataSchema = z
  .object({
    company_name: z.string().optional(),
    industry: z.string().optional(),
    business_type: z.string().optional(),
    revenue: z.number().optional(),
    revenue_range: z.string().optional(),
    ebitda: z.number().optional(),
    employees: z.number().optional(),
    founding_year: z.number().optional(),
    country_code: z.string().optional(),
  })
  .passthrough()

/**
 * Report Section Schema
 */
export const ReportSectionSchema = z
  .object({
    id: z.string(),
    section: z.string(),
    phase: z.number(),
    html: z.string(),
    progress: z.number().optional(),
    status: z.enum(['loading', 'complete', 'error']).optional(),
    is_fallback: z.boolean().optional(),
    is_error: z.boolean().optional(),
    error_message: z.string().optional(),
    timestamp: z.date(),
  })
  .strict()

/**
 * Type inference helpers
 */
export type FinancialData = z.infer<typeof FinancialDataSchema>
export type ValuationRequest = z.infer<typeof ValuationRequestSchema>
export type ValuationResponse = z.infer<typeof ValuationResponseSchema>
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>
export type ConversationContext = z.infer<typeof ConversationContextSchema>
export type SessionHistoryResponse = z.infer<typeof SessionHistoryResponseSchema>
export type APIErrorResponse = z.infer<typeof APIErrorResponseSchema>
export type BusinessProfileData = z.infer<typeof BusinessProfileDataSchema>
export type ReportSection = z.infer<typeof ReportSectionSchema>

/**
 * Safe parse helpers
 */
export function safeParseValuationResponse(
  data: unknown
): { success: true; data: ValuationResponse } | { success: false; error: z.ZodError } {
  const result = ValuationResponseSchema.safeParse(data)
  return result
}

export function safeParseSessionHistory(
  data: unknown
): { success: true; data: SessionHistoryResponse } | { success: false; error: z.ZodError } {
  const result = SessionHistoryResponseSchema.safeParse(data)
  return result
}

export function safeParseConversationContext(
  data: unknown
): { success: true; data: ConversationContext } | { success: false; error: z.ZodError } {
  const result = ConversationContextSchema.safeParse(data)
  return result
}

/**
 * Validation error formatter
 */
export function formatZodError(error: z.ZodError): string {
  return error.errors.map((err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`).join(', ')
}
