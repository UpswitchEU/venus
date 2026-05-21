/**
 * Valuation Service Interfaces
 *
 * Dependency Inversion Principle compliant interfaces for valuation services.
 * Components depend on these abstractions, not concrete implementations.
 */

import type { Message } from '../../../types/message'
import type {
  ValuationRequest,
  ValuationResponse,
  ValuationSession,
} from '../../../types/valuation'

// Core domain types
export interface BusinessProfile {
  company_name?: string
  industry?: string
  business_type?: string
  revenue?: number
  revenue_range?: string
  employees?: number
  founding_year?: number
  country_code?: string
  [key: string]: unknown
}

export interface ConversationStartRequest {
  user_id?: string
  company_name?: string
  industry?: string
  business_model?: string
  time_commitment?: 'quick' | 'detailed'
  focus_area?: 'all' | 'financials' | 'operations' | 'market'
  [key: string]: unknown
}

export interface ConversationStartResponse {
  conversation_id: string
  valuation_result?: ValuationResponse
  message?: string
}

// Service Interfaces (DIP compliant)

/**
 * Valuation Service Interface
 *
 * Abstracts the core valuation calculation logic.
 * Components depend on this interface, not concrete implementations.
 */
export interface IValuationService {
  /**
   * Calculate valuation based on provided data
   */
  calculateValuation(request: ValuationRequest): Promise<ValuationResponse>

  /**
   * Start streaming valuation calculation
   */
  startStreamingValuation(
    request: ValuationRequest,
    onProgress?: (progress: number, message: string) => void,
    onComplete?: (result: ValuationResponse) => void,
    onError?: (error: string) => void
  ): Promise<{ stop: () => void }>
}

/**
 * Session Service Interface
 *
 * Abstracts session management and persistence.
 */
export interface ISessionService {
  /**
   * Create a new valuation session
   */
  createSession(
    reportId: string,
    flow: 'manual' | 'conversational',
    initialData?: unknown
  ): Promise<ValuationSession>

  /**
   * Load existing session by report ID
   */
  loadSession(reportId: string): Promise<ValuationSession | null>

  /**
   * Update session data
   */
  updateSession(reportId: string, updates: Partial<ValuationSession>): Promise<void>

  /**
   * Delete session
   */
  deleteSession(reportId: string): Promise<void>
}

/**
 * Conversation Service Interface
 *
 * Abstracts conversation/chat functionality.
 */
export interface IConversationService {
  /**
   * Start a new conversation
   */
  startConversation(request: ConversationStartRequest): Promise<ConversationStartResponse>

  /**
   * Send message in conversation
   */
  sendMessage(conversationId: string, message: string, context?: unknown): Promise<Message>

  /**
   * Get conversation history
   */
  getConversationHistory(conversationId: string): Promise<{ messages: Message[]; exists: boolean }>

  /**
   * Restore conversation from backend
   */
  restoreConversation(sessionId: string): Promise<Message[]>

  /**
   * Clear conversation
   */
  clearConversation(conversationId: string): Promise<void>
}

/**
 * Business Profile Service Interface
 *
 * Abstracts business profile management.
 */
export interface IBusinessProfileService {
  /**
   * Fetch user's business profile
   */
  fetchUserProfile(userId: string): Promise<BusinessProfile | null>

  /**
   * Save/update business profile
   */
  saveProfile(userId: string, profile: BusinessProfile): Promise<void>

  /**
   * Transform profile for conversation start
   */
  transformForConversation(profile: BusinessProfile, options?: unknown): ConversationStartRequest

  /**
   * Get profile completeness analysis
   */
  getCompletenessAnalysis(profile: BusinessProfile): {
    completeness: number
    complete: string[]
    priority: string[]
    estimatedTime: string
  }
}

/**
 * Credit Service Interface
 *
 * Abstracts credit/usage management for guest users.
 */
export interface ICreditService {
  /**
   * Check if user has credits
   */
  hasCredits(): boolean

  /**
   * Use a credit
   */
  useCredit(): boolean

  /**
   * Get remaining credits
   */
  getCreditsRemaining(): number

  /**
   * Reset credits (admin function)
   */
  resetCredits(): void

  /**
   * Get credit status
   */
  getCreditStatus(): {
    remaining: number
    total: number
    hasCredits: boolean
    isFirstTime: boolean
  }
}

/**
 * Report Service Interface
 *
 * Abstracts report generation and management.
 */
export interface IReportService {
  /**
   * Generate valuation report
   */
  generateReport(valuationResult: ValuationResponse): Promise<string>

  /**
   * Download report as PDF
   */
  downloadPDF(valuationData: unknown, options: unknown): Promise<void>

  /**
   * Save report to backend
   */
  saveReport(reportId: string, reportData: unknown): Promise<void>

  /**
   * Load saved report
   */
  loadReport(reportId: string): Promise<unknown>
}
