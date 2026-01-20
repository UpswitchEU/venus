/**
 * Session Engine Abstraction
 * 
 * Twin Engine Architecture: Two completely separate engines
 * - GuestSessionEngine: localStorage-only sandbox, no backend until explicit save
 * - AuthenticatedSessionEngine: Full backend integration with all features
 * 
 * Zero mixing of guest/auth logic - early routing based on bootstrap identity.
 * 
 * @module services/session/SessionEngine
 */

import type { ValuationSession } from '../../types/valuation'

export type FlowType = 'manual' | 'conversational'

/**
 * Session Engine Interface
 * 
 * All session operations are abstracted through this interface.
 * Engines implement this interface differently:
 * - Guest: localStorage-only, no backend calls
 * - Auth: Full backend integration
 */
export interface ISessionEngine {
  /**
   * Load session by reportId
   * 
   * Guest: Reads from localStorage, creates new if doesn't exist
   * Auth: Calls backend API
   */
  loadSession(
    reportId: string,
    flow?: FlowType,
    prefilledQuery?: string | null
  ): Promise<ValuationSession | null>

  /**
   * Update session data
   * 
   * Guest: Updates localStorage only
   * Auth: Updates backend + local state
   */
  updateSession(updates: Partial<ValuationSession>): void

  /**
   * Save session to backend
   * 
   * Guest: ONLY method that calls backend (explicit user action)
   * Auth: Backend persistence (may be auto-save)
   */
  saveSession(reason?: 'user' | 'autosave' | 'system'): Promise<void>

  /**
   * Clear session
   * 
   * Guest: Clears localStorage
   * Auth: Clears backend + local state
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
