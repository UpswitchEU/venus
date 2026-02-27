/**
 * Session Engine Abstraction
 *
 * AUTH-FIRST Architecture: Only AuthenticatedSessionEngine is used.
 * All users must authenticate before accessing session features.
 *
 * @module services/session/SessionEngine
 */

import type { ValuationSession } from '../../types/valuation'

export type FlowType = 'manual' | 'conversational'

/**
 * Session Engine Interface
 *
 * AUTH-FIRST: All session operations require authentication.
 * Implemented by AuthenticatedSessionEngine with full backend integration.
 */
export interface ISessionEngine {
  /**
   * Load session by reportId
   * Calls backend API to fetch or create session
   */
  loadSession(
    reportId: string,
    flow?: FlowType,
    prefilledQuery?: string | null
  ): Promise<ValuationSession | null>

  /**
   * Update session data
   * Updates backend + local state
   */
  updateSession(updates: Partial<ValuationSession>): void

  /**
   * Save session to backend
   * Backend persistence (auto-save or explicit user action)
   */
  saveSession(reason?: 'user' | 'autosave' | 'system'): Promise<void>

  /**
   * Clear session
   * Clears backend + local state
   */
  clearSession(): void

  /**
   * Get current report ID
   */
  getReportId(): string | null

  /**
   * Get current session data
   */
  getSessionData(): any | null

  /**
   * Get current session (full object)
   */
  getSession(): ValuationSession | null
}
