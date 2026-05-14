/**
 * Backend API Service - Refactored Orchestrator
 *
 * Bank-Grade Excellence Framework Implementation:
 * - Single Responsibility: Orchestrate focused API services
 * - SOLID Principles: Dependency Inversion, Interface Segregation
 * - Clean Architecture: Thin orchestrator, focused services
 *
 * BEFORE: 993-line monolithic class with mixed responsibilities
 * AFTER:  150-line orchestrator coordinating 5 focused services
 *
 * Services:
 * - ValuationAPI: All valuation calculation operations
 * - ReportAPI: Report CRUD and download operations
 * - SessionAPI: Valuation session lifecycle management
 * - CreditAPI: Credit status and usage tracking
 * - UtilityAPI: Health checks and utility operations
 */

import type {
  CreateValuationSessionRequest,
  SaveValuationRequest,
  UpdateValuationSessionRequest,
} from '../types/api'
import type {
  ConversationHistoryResponse,
  ConversationStatusResponse,
  CreateValuationSessionResponse,
  GuestMigrationResponse,
  SaveValuationResponse,
  SwitchViewResponse,
  UpdateValuationSessionResponse,
  ValuationSessionResponse,
} from '../types/api-responses'
import type { ValuationSession } from '../types/valuation'
import { ValuationRequest, ValuationResponse } from '../types/valuation'
import { CreditAPI } from './api/credit'
import { APIRequestConfig } from './api/HttpClient'
import { ProfileAPI } from './api/profile/ProfileAPI'
import { ReportAPI } from './api/report'
import { SessionAPI } from './api/session'
import { UtilityAPI } from './api/utility'
import { ValuationAPI } from './api/valuation'

/**
 * Shape of getUserPlan response — mirrors what CreditAPI.getUserPlan
 * returns, declared here so the dedup wrapper has a single source of
 * truth for the type instead of duplicating an inline object literal.
 */
type UserPlanResponse = {
  id: string
  user_id: string
  plan_type: string
  credits_per_period: number
  credits_used: number
  credits_remaining: number
  created_at: string
  allowed_methods?: string[] | null
  yearly_discount_percent?: number
  plan_features?: {
    ebitda_normalization: boolean
    tax_latencies: boolean
    version_control: boolean
    audit_trail: boolean
    integrations_enabled: boolean
    valuation_synthesis: boolean
    valuation_download?: boolean
    live_benelux_sector_multiples?: boolean
    team_seat_addons?: boolean
  }
  bonus_valuations?: number
}

/**
 * Refactored BackendAPI - Clean orchestrator for API operations
 *
 * This maintains the same external interface while internally
 * delegating to focused, single-responsibility services.
 */
class BackendAPI {
  // Modular API services
  private valuationAPI: ValuationAPI
  private reportAPI: ReportAPI
  private sessionAPI: SessionAPI
  private creditAPI: CreditAPI
  private profileAPI: ProfileAPI
  private utilityAPI: UtilityAPI

  /**
   * Dedup + short-TTL cache for getUserPlan. Without this, every Venus
   * hook that needs plan-tier gating (useCredits — at minimum the
   * Bootstrap, ManualLayout, ReportPanel branches) does its own
   * /api/v2/credits/plan round-trip on mount, each ~900-1100 ms.
   * Plan tier changes via Stripe webhook on subscription change; a
   * 60s TTL with in-flight sharing is the right shape. Consumers
   * that need fresh data (after upgrade flows) call
   * `refreshCredits()` which falls through the dedup via {force:true}.
   */
  private getUserPlanInflight: Promise<UserPlanResponse> | null = null
  private getUserPlanCache: { value: UserPlanResponse; expiresAt: number } | null = null

  constructor() {
    // Initialize all API services
    this.valuationAPI = new ValuationAPI()
    this.reportAPI = new ReportAPI()
    this.sessionAPI = new SessionAPI()
    this.creditAPI = new CreditAPI()
    this.profileAPI = new ProfileAPI()
    this.utilityAPI = new UtilityAPI()
  }

  // ===== VALUATION OPERATIONS =====

  async calculateManualValuation(
    data: ValuationRequest,
    options?: APIRequestConfig
  ): Promise<ValuationResponse> {
    return this.valuationAPI.calculateManualValuation(data, options)
  }

  async calculateAIGuidedValuation(data: ValuationRequest): Promise<ValuationResponse> {
    return this.valuationAPI.calculateAIGuidedValuation(data)
  }

  async calculateInstantValuation(data: ValuationRequest): Promise<ValuationResponse> {
    return this.valuationAPI.calculateInstantValuation(data)
  }

  async calculateValuationForReport(data: ValuationRequest): Promise<ValuationResponse> {
    return this.valuationAPI.calculateValuationUnified(data)
  }

  async calculateValuation(data: ValuationRequest): Promise<ValuationResponse> {
    return this.valuationAPI.calculateValuationUnified(data)
  }

  async calculateValuationUnified(
    data: ValuationRequest,
    options?: APIRequestConfig
  ): Promise<ValuationResponse> {
    return this.valuationAPI.calculateValuationUnified(data, options)
  }

  async generatePreviewHtml(
    data: ValuationRequest
  ): Promise<{ html: string; completeness_percent: number }> {
    return this.valuationAPI.generatePreviewHtml(data)
  }

  async updateSelectedMethod(
    reportId: string,
    selectedMethod: string,
    overrideReason?: string,
    overrideNote?: string,
    options?: {
      preparer_ev_ebitda_median?: number
      preparer_ev_ebitda_override?: {
        reason_key: string
        note?: string
        acknowledged_extreme?: boolean
      }
      clear_preparer_override?: boolean
    },
  ): Promise<{ selected_method: string; html_report?: string }> {
    return this.valuationAPI.updateSelectedMethod(
      reportId,
      selectedMethod,
      overrideReason,
      overrideNote,
      options,
    )
  }

  // ===== REPORT OPERATIONS =====

  async getReport(reportId: string, options?: APIRequestConfig): Promise<ValuationResponse> {
    return this.reportAPI.getReport(reportId, options)
  }

  async ensureReportHtml(
    reportId: string,
    options?: { sync?: boolean; sessionKey?: string; alternateReportId?: string }
  ): Promise<Record<string, unknown> | null> {
    return this.reportAPI.ensureReportHtml(reportId, options)
  }

  async updateReport(
    reportId: string,
    data: Partial<ValuationRequest>
  ): Promise<ValuationResponse> {
    return this.reportAPI.updateReport(reportId, data)
  }

  async deleteReport(reportId: string): Promise<{ success: boolean }> {
    return this.reportAPI.deleteReport(reportId)
  }

  async downloadAccountantViewPDF(reportId: string): Promise<Blob> {
    return this.reportAPI.downloadAccountantViewPDF(reportId)
  }

  // ===== SESSION OPERATIONS =====

  async getValuationSession(reportId: string): Promise<ValuationSessionResponse | null> {
    return this.sessionAPI.getValuationSession(reportId)
  }

  async createValuationSession(
    session: CreateValuationSessionRequest | ValuationSession
  ): Promise<CreateValuationSessionResponse> {
    // Pass session directly to SessionAPI - it handles both types
    // SessionAPI will extract required fields and map 'conversational' → 'ai-guided'
    return this.sessionAPI.createValuationSession(session as any)
  }

  async updateValuationSession(
    reportId: string,
    updates: Partial<ValuationSession>
  ): Promise<UpdateValuationSessionResponse> {
    const request: UpdateValuationSessionRequest = {
      reportId,
      updates,
    }
    return this.sessionAPI.updateValuationSession(reportId, request)
  }

  async switchValuationView(
    reportId: string,
    view: 'manual' | 'conversational'
  ): Promise<SwitchViewResponse> {
    return this.sessionAPI.switchValuationView(reportId, view)
  }

  async deleteValuationSession(
    reportId: string
  ): Promise<{ success: boolean; message?: string }> {
    return this.sessionAPI.deleteValuationSession(reportId)
  }

  // ===== CREDIT OPERATIONS =====

  async getCreditStatus(): Promise<{ creditsRemaining: number; isPremium: boolean }> {
    return this.creditAPI.getCreditStatus()
  }

  async getUserPlan(options: { forceRefresh?: boolean } = {}): Promise<UserPlanResponse> {
    const now = Date.now()
    if (
      !options.forceRefresh &&
      this.getUserPlanCache &&
      this.getUserPlanCache.expiresAt > now
    ) {
      return this.getUserPlanCache.value
    }
    if (this.getUserPlanInflight) {
      return this.getUserPlanInflight
    }
    this.getUserPlanInflight = (async () => {
      try {
        const value = (await this.creditAPI.getUserPlan()) as UserPlanResponse
        this.getUserPlanCache = { value, expiresAt: Date.now() + 60_000 }
        return value
      } finally {
        this.getUserPlanInflight = null
      }
    })()
    return this.getUserPlanInflight
  }

  async saveValuation(
    data: ValuationResponse,
    reportId?: string,
    sessionId?: string
  ): Promise<SaveValuationResponse> {
    const request: SaveValuationRequest = {
      valuation_id: data.valuation_id || '',
      data,
      reportId,
      sessionId,
    }
    return this.creditAPI.saveValuation(request)
  }

  // ===== PROFILE OPERATIONS =====

  async getProfile(): Promise<import('./api/profile/ProfileAPI').ProfileData> {
    return this.profileAPI.getProfile()
  }

  async updateProfile(
    data: Partial<import('./api/profile/ProfileAPI').ProfileData>
  ): Promise<import('./api/profile/ProfileAPI').ProfileData> {
    return this.profileAPI.updateProfile(data)
  }

  // ===== UTILITY OPERATIONS =====

  async health(): Promise<{ status: string }> {
    return this.utilityAPI.health()
  }

  async getConversationStatus(sessionId: string): Promise<ConversationStatusResponse> {
    return this.utilityAPI.getConversationStatus(sessionId)
  }

  async getConversationHistory(
    conversationId: string,
    signal?: AbortSignal
  ): Promise<ConversationHistoryResponse> {
    return this.utilityAPI.getConversationHistory(conversationId, signal)
  }

  // ===== CLEANUP =====

  /**
   * Clean up all API service resources
   */
  cleanup(): void {
    this.valuationAPI.cleanup()
    this.reportAPI.cleanup()
    this.sessionAPI.cleanup()
    this.creditAPI.cleanup()
    this.utilityAPI.cleanup()
  }
}

// Export singleton instance
export const backendAPI = new BackendAPI()
