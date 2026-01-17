/**
 * Unified Session API (Bank-Grade Architecture)
 * 
 * Replaces:
 * - SessionAPI (valuation sessions)
 * - GuestSessionAPI
 * 
 * Talks to new unified backend: /api/v2/sessions
 */

import { HttpClient } from '../HttpClient';
import { apiLogger } from '../../../utils/logger';

export interface Session {
  id: string;
  session_key: string;
  type: 'valuation' | 'onboarding' | 'assessment';
  status: 'active' | 'completed' | 'expired' | 'abandoned';
  view_type?: 'simple' | 'advanced';
  current_step?: number;
  data: Record<string, any>;
  created_at: string;
  updated_at?: string;
  expires_at: string;
  last_activity_at?: string;
}

export interface CreateSessionRequest {
  type?: 'valuation' | 'onboarding' | 'assessment';
  data?: Record<string, any>;
  view_type?: 'simple' | 'advanced' | 'manual' | 'conversational';
  current_step?: number;
  session_key?: string; // For idempotency
}

export interface UpdateSessionRequest {
  data?: Record<string, any>;
  view_type?: 'simple' | 'advanced';
  current_step?: number;
  status?: 'active' | 'completed' | 'expired' | 'abandoned';
}

/**
 * Unified Session API Client
 */
export class UnifiedSessionAPI extends HttpClient {
  constructor() {
    super();
  }

  /**
   * Create new session
   * 
   * Ownership is resolved automatically by backend from request context
   */
  async create(request: CreateSessionRequest): Promise<Session> {
    apiLogger.info('[UnifiedSessionAPI] Creating session', {
      type: request.type,
      view_type: request.view_type,
    });

    const startTime = performance.now();

    try {
      const response = await this.client.post<{ success: boolean; session: Session }>(
        '/api/v2/sessions',
        request
      );

      const duration = performance.now() - startTime;
      apiLogger.info('[UnifiedSessionAPI] Session created successfully', {
        session_key: response.data.session.session_key.substring(0, 20) + '...',
        duration_ms: duration.toFixed(2),
      });

      return response.data.session;
    } catch (error) {
      const duration = performance.now() - startTime;
      apiLogger.error('[UnifiedSessionAPI] Failed to create session', {
        error,
        duration_ms: duration.toFixed(2),
      });
      throw error;
    }
  }

  /**
   * Get session by key
   */
  async get(sessionKey: string): Promise<Session> {
    apiLogger.debug('[UnifiedSessionAPI] Getting session', {
      session_key: sessionKey.substring(0, 20) + '...',
    });

    try {
      const response = await this.client.get<{ success: boolean; session: Session }>(
        `/api/v2/sessions/${sessionKey}`
      );

      return response.data.session;
    } catch (error) {
      apiLogger.error('[UnifiedSessionAPI] Failed to get session', {
        session_key: sessionKey.substring(0, 20) + '...',
        error,
      });
      throw error;
    }
  }

  /**
   * Update session
   * 
   * Data is merged (partial update)
   */
  async update(sessionKey: string, request: UpdateSessionRequest): Promise<Session> {
    apiLogger.debug('[UnifiedSessionAPI] Updating session', {
      session_key: sessionKey.substring(0, 20) + '...',
      hasDataUpdate: !!request.data,
    });

    try {
      const response = await this.client.patch<{ success: boolean; session: Session }>(
        `/api/v2/sessions/${sessionKey}`,
        request
      );

      apiLogger.debug('[UnifiedSessionAPI] Session updated successfully', {
        session_key: sessionKey.substring(0, 20) + '...',
      });

      return response.data.session;
    } catch (error) {
      apiLogger.error('[UnifiedSessionAPI] Failed to update session', {
        session_key: sessionKey.substring(0, 20) + '...',
        error,
      });
      throw error;
    }
  }

  /**
   * Delete session (soft delete)
   */
  async delete(sessionKey: string): Promise<void> {
    apiLogger.info('[UnifiedSessionAPI] Deleting session', {
      session_key: sessionKey.substring(0, 20) + '...',
    });

    try {
      await this.client.delete(`/api/v2/sessions/${sessionKey}`);

      apiLogger.info('[UnifiedSessionAPI] Session deleted successfully', {
        session_key: sessionKey.substring(0, 20) + '...',
      });
    } catch (error) {
      apiLogger.error('[UnifiedSessionAPI] Failed to delete session', {
        session_key: sessionKey.substring(0, 20) + '...',
        error,
      });
      throw error;
    }
  }

  /**
   * List sessions for current owner
   */
  async list(): Promise<Session[]> {
    apiLogger.debug('[UnifiedSessionAPI] Listing sessions');

    try {
      const response = await this.client.get<{ success: boolean; sessions: Session[]; count: number }>(
        '/api/v2/sessions'
      );

      apiLogger.debug('[UnifiedSessionAPI] Sessions listed successfully', {
        count: response.data.count,
      });

      return response.data.sessions;
    } catch (error) {
      apiLogger.error('[UnifiedSessionAPI] Failed to list sessions', { error });
      throw error;
    }
  }

  /**
   * Migrate guest sessions to authenticated user
   * 
   * Called after user authenticates
   */
  async migrateGuestSessions(): Promise<void> {
    apiLogger.info('[UnifiedSessionAPI] Migrating guest sessions to user');

    try {
      await this.client.post('/api/v2/sessions/migrate');

      apiLogger.info('[UnifiedSessionAPI] Guest sessions migrated successfully');
    } catch (error) {
      apiLogger.error('[UnifiedSessionAPI] Failed to migrate guest sessions', { error });
      // Non-fatal - user can continue
    }
  }
}

/**
 * Export singleton instance
 */
export const unifiedSessionAPI = new UnifiedSessionAPI();
