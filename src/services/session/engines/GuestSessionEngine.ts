/**
 * Guest Session Engine
 * 
 * Twin Engine Architecture: localStorage-only sandbox for guest users
 * 
 * Features:
 * - Zero backend calls until explicit save
 * - No rate limits (no backend calls)
 * - No session creation API calls
 * - Simple, zero complexity
 * - localStorage-only storage
 * 
 * @module services/session/engines/GuestSessionEngine
 */

import type { ISessionEngine } from '../SessionEngine'
import type { ValuationSession } from '../../../types/valuation'
import type { FlowType } from '../SessionEngine'
import { generalLogger } from '../../../utils/logger'

const GUEST_SESSION_PREFIX = 'guest_session_'

/**
 * Generate guest reportId locally
 * Format: guest_val_${timestamp}_${random}
 */
function generateGuestReportId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 11)
  return `guest_val_${timestamp}_${random}`
}

/**
 * Get localStorage key for guest session
 */
function getStorageKey(reportId: string): string {
  return `${GUEST_SESSION_PREFIX}${reportId}`
}

/**
 * Guest Session Engine
 * 
 * localStorage-only sandbox - no backend calls until explicit save
 */
export class GuestSessionEngine implements ISessionEngine {
  private currentSession: ValuationSession | null = null
  private currentReportId: string | null = null

  /**
   * Load session from localStorage
   * Creates new session if doesn't exist
   */
  async loadSession(
    reportId: string,
    flow: FlowType = 'manual',
    prefilledQuery?: string | null
  ): Promise<ValuationSession | null> {
    try {
      // If reportId is provided, try to load from localStorage
      if (reportId) {
        const storageKey = getStorageKey(reportId)
        const stored = localStorage.getItem(storageKey)
        
        if (stored) {
          try {
            const parsed = JSON.parse(stored)
            // Convert timestamps back to Date objects
            const session: ValuationSession = {
              ...parsed,
              createdAt: new Date(parsed.createdAt),
              updatedAt: new Date(parsed.updatedAt),
              completedAt: parsed.completedAt ? new Date(parsed.completedAt) : undefined,
              lastSyncedAt: parsed.lastSyncedAt ? new Date(parsed.lastSyncedAt) : undefined,
              calculatedAt: parsed.calculatedAt ? new Date(parsed.calculatedAt) : undefined,
            }
            
            this.currentSession = session
            this.currentReportId = reportId
            
            generalLogger.debug('[GuestSessionEngine] Loaded session from localStorage', {
              reportId,
              hasData: !!session.sessionData,
            })
            
            return session
          } catch (parseError) {
            generalLogger.warn('[GuestSessionEngine] Failed to parse stored session', {
              reportId,
              error: parseError instanceof Error ? parseError.message : String(parseError),
            })
            // Fall through to create new session
          }
        }
      }

      // Create new session if doesn't exist
      const newReportId = reportId || generateGuestReportId()
      const now = new Date()
      
      const newSession: ValuationSession = {
        reportId: newReportId,
        currentView: flow,
        dataSource: flow === 'conversational' ? 'conversational' : 'manual',
        name: 'My business valuation',
        createdAt: now,
        updatedAt: now,
        partialData: {},
        sessionData: prefilledQuery
          ? {
              business_description: prefilledQuery,
            }
          : {},
      }

      // Save to localStorage
      this.saveToLocalStorage(newSession)
      
      this.currentSession = newSession
      this.currentReportId = newReportId

      generalLogger.debug('[GuestSessionEngine] Created new guest session', {
        reportId: newReportId,
        flow,
        hasPrefilledQuery: !!prefilledQuery,
      })

      return newSession
    } catch (error) {
      generalLogger.error('[GuestSessionEngine] Failed to load session', {
        reportId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * Update session data (localStorage only)
   */
  updateSession(updates: Partial<ValuationSession>): void {
    if (!this.currentSession) {
      generalLogger.warn('[GuestSessionEngine] Cannot update - no current session')
      return
    }

    const updatedSession: ValuationSession = {
      ...this.currentSession,
      ...updates,
      updatedAt: new Date(),
    }

    // Merge sessionData if provided
    if (updates.sessionData) {
      updatedSession.sessionData = {
        ...(this.currentSession.sessionData || {}),
        ...updates.sessionData,
      }
    }

    // Merge partialData if provided
    if (updates.partialData) {
      updatedSession.partialData = {
        ...(this.currentSession.partialData || {}),
        ...updates.partialData,
      }
    }

    this.currentSession = updatedSession
    this.saveToLocalStorage(updatedSession)

    generalLogger.debug('[GuestSessionEngine] Updated session', {
      reportId: updatedSession.reportId,
      updateKeys: Object.keys(updates),
    })
  }

  /**
   * Save session to backend (ONLY method that calls backend)
   * 
   * ✅ SESSION CONTROLLER OPTIONAL FOR GUESTS:
   * - This method is OPTIONAL - guests can work entirely in localStorage
   * - Session controller is only needed for resume capability (cross-device access)
   * - Guests can calculate WITHOUT creating a session first (calculation creates session automatically)
   * - This method is called when user explicitly clicks "Save" button for resume capability
   * 
   * Use Cases:
   * - Resume work later (requires backend session)
   * - Cross-device access (requires backend session)
   * - Version history (requires backend session)
   * 
   * Not Required For:
   * - Form filling (localStorage only)
   * - Calculation (creates session automatically if needed)
   * - Basic valuation workflow
   */
  async saveSession(reason: 'user' | 'autosave' | 'system' = 'user'): Promise<void> {
    if (!this.currentSession) {
      generalLogger.warn('[GuestSessionEngine] Cannot save - no current session')
      return
    }

    // Only allow explicit user saves (no auto-save for guests)
    if (reason !== 'user') {
      generalLogger.debug('[GuestSessionEngine] Skipping non-user save', { reason })
      return
    }

    try {
      // Import SessionAPI dynamically to avoid circular dependencies
      const { SessionAPI } = await import('../../api/session/SessionAPI')
      const sessionAPI = new SessionAPI()

      // Get guest session ID for backend
      const { useGuestSessionStore } = await import('../../../store/useGuestSessionStore')
      const guestSessionId = await useGuestSessionStore.getState().ensureSession()

      if (!guestSessionId) {
        throw new Error('Guest session ID not available')
      }

      // Prepare session data for backend
      const sessionToCreate = {
        session_key: this.currentSession.reportId,
        reportId: this.currentSession.reportId,
        currentView: this.currentSession.currentView || 'manual',
        sessionData: {
          ...(this.currentSession.sessionData || {}),
          ...(this.currentSession.partialData || {}),
          currentView: this.currentSession.currentView,
        },
        name: this.currentSession.name || 'My business valuation',
        dataSource: this.currentSession.dataSource || 'manual',
        guest_session_id: guestSessionId,
      }

      // Call backend API to create session
      const response = await sessionAPI.createValuationSession(sessionToCreate)

      if (response.success && response.session) {
        // Update local session with backend response
        this.currentSession = {
          ...this.currentSession,
          ...response.session,
          updatedAt: new Date(),
          lastSyncedAt: new Date(),
        }
        
        this.saveToLocalStorage(this.currentSession)

        generalLogger.info('[GuestSessionEngine] Session saved to backend', {
          reportId: this.currentSession.reportId,
        })
      }
    } catch (error) {
      generalLogger.error('[GuestSessionEngine] Failed to save session to backend', {
        reportId: this.currentSession.reportId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Clear session (localStorage only)
   */
  clearSession(): void {
    if (this.currentReportId) {
      const storageKey = getStorageKey(this.currentReportId)
      localStorage.removeItem(storageKey)
      
      generalLogger.debug('[GuestSessionEngine] Cleared session', {
        reportId: this.currentReportId,
      })
    }

    this.currentSession = null
    this.currentReportId = null
  }

  /**
   * Get current report ID
   */
  getReportId(): string | null {
    return this.currentReportId || this.currentSession?.reportId || null
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

  /**
   * Save session to localStorage
   */
  private saveToLocalStorage(session: ValuationSession): void {
    try {
      const storageKey = getStorageKey(session.reportId)
      const serialized = JSON.stringify({
        ...session,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        completedAt: session.completedAt?.toISOString(),
        lastSyncedAt: session.lastSyncedAt?.toISOString(),
        calculatedAt: session.calculatedAt?.toISOString(),
      })
      
      localStorage.setItem(storageKey, serialized)
    } catch (error) {
      generalLogger.error('[GuestSessionEngine] Failed to save to localStorage', {
        reportId: session.reportId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
