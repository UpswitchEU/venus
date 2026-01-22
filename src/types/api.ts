/**
 * API Types
 *
 * Type definitions for API requests and responses.
 * Ensures type safety across the entire API layer.
 *
 * @module types/api
 */

import type { ValuationRequest, ValuationResponse, ValuationSession } from './valuation'

/**
 * Base API response wrapper
 */
export interface APIResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
  code?: string
  timestamp?: string
}

/**
 * Save valuation request
 */
export interface SaveValuationRequest {
  valuation_id: string
  data: ValuationResponse
  reportId?: string
  sessionId?: string
}

/**
 * Save valuation response
 */
export interface SaveValuationResponse {
  success: boolean
  valuation_id?: string
  message?: string
}

/**
 * Create valuation session request
 */
export interface CreateValuationSessionRequest {
  reportId: string
  currentView: 'manual' | 'conversational'
  initialData?: Partial<ValuationRequest>
  timestamp?: string
}

/**
 * Create valuation session response
 */
export interface CreateValuationSessionResponse {
  success: boolean
  session: ValuationSession
  message?: string
}

/**
 * Update valuation session request
 */
export interface UpdateValuationSessionRequest {
  reportId: string
  updates: Partial<ValuationSession>
  timestamp?: string
}

/**
 * Update valuation session response
 */
export interface UpdateValuationSessionResponse {
  success: boolean
  session: ValuationSession
  message?: string
}

/**
 * Delete valuation session request
 */
export interface DeleteValuationSessionRequest {
  reportId: string
}

/**
 * Delete valuation session response
 */
export interface DeleteValuationSessionResponse {
  success: boolean
  message?: string
}

/**
 * Credit check request
 */
export interface CreditCheckRequest {
  userId: string
}

/**
 * Credit check response
 */
export interface CreditCheckResponse {
  hasCredits: boolean
  creditsRemaining: number
  message?: string
}

/**
 * Use credit request
 */
export interface UseCreditRequest {
  userId: string
  valuationId?: string
}

/**
 * Use credit response
 */
export interface UseCreditResponse {
  success: boolean
  creditsRemaining: number
  valuationId?: string
  message?: string
}

/**
 * Report metadata
 */
export interface ReportMetadata {
  reportId: string
  valuationId?: string
  createdAt: string
  updatedAt: string
  status: 'draft' | 'completed' | 'error'
  viewCount?: number
  downloadCount?: number
  sessionId?: string
}

/**
 * Report list request
 */
export interface ReportListRequest {
  userId: string
  limit?: number
  offset?: number
}

/**
 * Report list response
 */
export interface ReportListResponse {
  reports: ReportMetadata[]
  total: number
  hasMore: boolean
}

/**
 * API Error response
 */
export interface APIErrorResponse {
  success: false
  error: string
  code?: string
  details?: Record<string, any>
  timestamp?: string
}

/**
 * Axios error response data
 */
export interface AxiosErrorData {
  success?: boolean
  error?: string
  code?: string
  message?: string
  details?: Record<string, any>
}

/**
 * Request configuration for API calls
 */
export interface APIRequestConfig {
  timeout?: number
  retries?: number
  retryDelay?: number
  headers?: Record<string, string>
}

/**
 * Message metadata in conversation history
 */
export interface MessageMetadata {
  field_type?: string
  validation_result?: boolean
  source?: 'user_input' | 'suggestion' | 'fallback'
  processing_time?: number
  ai_confidence?: number
  [key: string]: any // Allow additional metadata fields
}

/**
 * Conversation message in history response
 */
export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
  field_name?: string
  confidence?: number
  metadata?: MessageMetadata
}

/**
 * Conversation history response
 */
export interface ConversationHistoryResponse {
  exists: boolean
  session_id: string
  messages?: ConversationMessage[]
  messages_count?: number
  collected_data?: Record<string, any>
  completeness_level?: string
  completeness_percent?: number
  fields_collected?: number
  missing_fields?: string[]
  last_updated?: string
}
