/**
 * Authenticated Session Engine
 * 
 * AUTH-FIRST Architecture: The only session engine used.
 * All users must authenticate before accessing session features.
 * 
 * Features:
 * - Backend session persistence via Titan API
 * - Auto-save on changes
 * - Versions support
 * - Accountant-for-client workflows (session owned by client)
 * - Data prefill from KBO, user profile, and existing sessions
 * 
 * Supported Identity Types:
 * - 'authenticated': Regular logged-in user owns the session
 * - 'accountant_for_client': Client owns session, accountant acts on behalf
 * 
 * @module services/session/engines/AuthenticatedSessionEngine
 */

import type { ISessionEngine } from '../SessionEngine'
import type { ValuationSession } from '../../../types/valuation'
import type { FlowType } from '../SessionEngine'
import { sessionService } from '../../index'
import { generalLogger } from '../../../utils/logger'

/**
 * Authenticated Session Engine
 * 
 * Full backend integration - wraps existing SessionService
 */
export class AuthenticatedSessionEngine implements ISessionEngine {
  private currentSession: ValuationSession | null = null

  /**
   * Load session from backend
   */
  async loadSession(
    reportId: string,
    flow: FlowType = 'manual',
    prefilledQuery?: string | null
  ): Promise<ValuationSession | null> {
    try {
      const session = await sessionService.loadSession(reportId, flow, prefilledQuery)
      
      if (session) {
        this.currentSession = session
        
        generalLogger.debug('[AuthenticatedSessionEngine] Loaded session from backend', {
          reportId,
          hasData: !!session.sessionData,
        })
      }
      
      return session
    } catch (error) {
      generalLogger.error('[AuthenticatedSessionEngine] Failed to load session', {
        reportId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * Update session (backend + local state)
   * 
   * BOOTSTRAP FIX: Handles the case where session is being set for the first time
   * during bootstrap flow (when no loadSession was called because it's a new report).
   */
  updateSession(updates: Partial<ValuationSession>): void {
    // Handle case where session is being set for the first time (bootstrap flow)
    if (!this.currentSession) {
      if (updates.reportId) {
        // Bootstrap is setting initial session - accept it
        this.currentSession = {
          reportId: updates.reportId,
          currentView: updates.currentView || 'manual',
          dataSource: updates.dataSource || 'manual',
          createdAt: updates.createdAt || new Date(),
          updatedAt: new Date(),
          sessionData: updates.sessionData || {},
          partialData: updates.partialData || {},
        } as ValuationSession
        
        generalLogger.debug('[AuthenticatedSessionEngine] Session initialized from updates (bootstrap flow)', {
          reportId: updates.reportId,
          hasSessionData: !!updates.sessionData,
        })
        return
      }
      
      generalLogger.warn('[AuthenticatedSessionEngine] Cannot update - no current session and no reportId in updates')
      return
    }

    // Update local state immediately (optimistic update)
    this.currentSession = {
      ...this.currentSession,
      ...updates,
      updatedAt: new Date(),
    }

    // Merge sessionData if provided
    if (updates.sessionData) {
      this.currentSession.sessionData = {
        ...(this.currentSession.sessionData || {}),
        ...updates.sessionData,
      }
    }

    // Merge partialData if provided
    if (updates.partialData) {
      this.currentSession.partialData = {
        ...(this.currentSession.partialData || {}),
        ...updates.partialData,
      }
    }

    generalLogger.debug('[AuthenticatedSessionEngine] Updated session (local)', {
      reportId: this.currentSession.reportId,
      updateKeys: Object.keys(updates),
    })

    // Backend persistence happens via saveSession (auto-save or manual)
  }

  /**
   * Save session to backend
   */
  async saveSession(reason: 'user' | 'autosave' | 'system' = 'autosave'): Promise<void> {
    if (!this.currentSession) {
      generalLogger.warn('[AuthenticatedSessionEngine] Cannot save - no current session')
      return
    }

    try {
      // Prepare updates from current session
      const updates = {
        ...(this.currentSession.sessionData || {}),
        ...(this.currentSession.partialData || {}),
      }
      
      // Save to backend
      const updatedSession = await sessionService.saveSession(
        this.currentSession.reportId,
        updates
      )
      
      // Update local session with backend response
      if (updatedSession) {
        this.currentSession = updatedSession
        
        generalLogger.debug('[AuthenticatedSessionEngine] Session saved to backend', {
          reportId: this.currentSession.reportId,
          reason,
        })
      }
    } catch (error) {
      generalLogger.error('[AuthenticatedSessionEngine] Failed to save session', {
        reportId: this.currentSession.reportId,
        reason,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Clear session (backend + local state)
   */
  clearSession(): void {
    if (this.currentSession) {
      sessionService.clearSessionCache(this.currentSession.reportId)
      
      generalLogger.debug('[AuthenticatedSessionEngine] Cleared session', {
        reportId: this.currentSession.reportId,
      })
    }

    this.currentSession = null
  }

  /**
   * Get current report ID
   */
  getReportId(): string | null {
    return this.currentSession?.reportId || null
  }

  /**
   * Get current session data
   */
  getSessionData(): any | null {
    return this.currentSession?.sessionData || null
  }

  /**
   * Get current session (full object)
   */
  getSession(): ValuationSession | null {
    return this.currentSession
  }
}
