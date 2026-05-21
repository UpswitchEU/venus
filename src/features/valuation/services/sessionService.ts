/**
 * Session Service Implementation
 *
 * Concrete implementation of ISessionService interface.
 * Provides session management and persistence with DIP compliance.
 *
 * NOTE: This is a legacy service. Use the shared SessionService from services/session/SessionService.ts instead.
 */

import { sessionService as sharedSessionService } from '../../../services/session/SessionService'
import type { ValuationRequest, ValuationSession } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { ISessionService } from './interfaces'

type LegacySessionSeed = Record<string, unknown>

/**
 * Session Service Implementation
 *
 * Provides concrete implementation of session management.
 * Follows Single Responsibility Principle - only handles session logic.
 */
export class SessionService implements ISessionService {
  /**
   * Create a new valuation session
   */
  async createSession(
    reportId: string,
    flow: 'manual' | 'conversational',
    initialData?: LegacySessionSeed
  ): Promise<ValuationSession> {
    try {
      generalLogger.info('Creating new valuation session', { reportId, flow })

      // Use shared SessionService - create by saving initial data
      // SessionService.loadSession will create if it doesn't exist
      const session = await sharedSessionService.loadSession(reportId)

      if (!session) {
        // If session doesn't exist, save initial data to create it
        await sharedSessionService.saveSession(reportId, {
          currentView: flow,
          ...(initialData || {}),
        })

        // Load the newly created session
        const newSession = await sharedSessionService.loadSession(reportId)
        if (!newSession) {
          throw new Error('Failed to create session')
        }

        generalLogger.info('Session created successfully', {
          reportId,
          sessionId: newSession.reportId,
          flow: newSession.currentView,
        })

        return newSession
      }

      generalLogger.info('Session already exists', {
        reportId,
        sessionId: session.reportId,
        flow: session.currentView,
      })

      return session
    } catch (error) {
      generalLogger.error('Failed to create session', { reportId, flow, error })
      throw error instanceof Error ? error : new Error('Failed to create session')
    }
  }

  /**
   * Load existing session by report ID
   */
  async loadSession(reportId: string): Promise<ValuationSession | null> {
    try {
      generalLogger.debug('Loading session', { reportId })

      // Use shared SessionService
      const session = await sharedSessionService.loadSession(reportId)

      if (session) {
        generalLogger.debug('Session loaded successfully', { reportId })
        return session
      }

      generalLogger.debug('Session not found', { reportId })
      return null
    } catch (error) {
      generalLogger.error('Failed to load session', { reportId, error })
      return null
    }
  }

  /**
   * Update session data
   */
  async updateSession(reportId: string, updates: Partial<ValuationSession>): Promise<void> {
    try {
      generalLogger.debug('Updating session', { reportId, updates: Object.keys(updates) })

      // Convert ValuationSession updates to ValuationRequest format
      const requestUpdates: Partial<ValuationRequest> = {}

      // Map sessionData if present
      if (updates.sessionData && typeof updates.sessionData === 'object') {
        Object.assign(requestUpdates, updates.sessionData)
      }

      // Map other fields
      if (updates.partialData && typeof updates.partialData === 'object') {
        const partialData = updates.partialData as Record<string, unknown>
        if ('company_name' in partialData) {
          requestUpdates.company_name = partialData.company_name as string
        }
        if ('revenue' in partialData) {
          requestUpdates.revenue = partialData.revenue as number
        }
        if ('number_of_employees' in partialData) {
          requestUpdates.number_of_employees = partialData.number_of_employees as number
        }
      }

      // Use shared SessionService
      await sharedSessionService.saveSession(reportId, requestUpdates)

      generalLogger.debug('Session updated successfully', { reportId })
    } catch (error) {
      generalLogger.error('Failed to update session', { reportId, error })
      throw error instanceof Error ? error : new Error('Failed to update session')
    }
  }

  /**
   * Delete session
   */
  async deleteSession(reportId: string): Promise<void> {
    try {
      generalLogger.info('Deleting session', { reportId })

      // Note: Session deletion not implemented in shared SessionService
      // Sessions are managed by backend, clearing is handled by stores
      generalLogger.info('Session deletion requested (handled by backend)', { reportId })
    } catch (error) {
      generalLogger.error('Failed to delete session', { reportId, error })
      throw error instanceof Error ? error : new Error('Failed to delete session')
    }
  }
}

// Export singleton instance
export const sessionService = new SessionService()
