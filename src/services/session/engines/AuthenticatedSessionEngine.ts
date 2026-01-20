/**
 * Authenticated Session Engine
 * 
 * Twin Engine Architecture: Full backend integration for authenticated users
 * 
 * Features:
 * - Backend session persistence
 * - Auto-save on changes
 * - Versions support
 * - Accountant-client workflows
 * - All current features
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
   */
  updateSession(updates: Partial<ValuationSession>): void {
    if (!this.currentSession) {
      generalLogger.warn('[AuthenticatedSessionEngine] Cannot update - no current session')
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
