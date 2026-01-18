/**
 * Session Resolver
 * 
 * Resolves report/session state: new vs existing, status, resumability.
 * Fetches session data from Titan API.
 * 
 * @module lib/bootstrap/resolvers/SessionResolver
 */

import type {
  BootstrapContext,
  BootstrapHints,
  BootstrapResolver,
  IdentityState,
  ReportState,
  ResolverResult,
} from '../types';
import { DEFAULT_REPORT } from '../types';
import { generateReportId, truncateForLog } from '../utils';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 
                process.env.NEXT_PUBLIC_API_BASE_URL || 
                'https://api.upswitch.app';

interface SessionData {
  session_key: string;
  session_data: Record<string, unknown>;
  view_type: string;
  current_step: number;
  status: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  user_id?: string;
  guest_session_id?: string;
  report_id?: string;
}

export class SessionResolver implements BootstrapResolver<ReportState> {
  private readonly logger = console;

  /**
   * Resolve session/report state
   */
  async resolve(
    context: BootstrapContext,
    hints: BootstrapHints,
    identity?: IdentityState
  ): Promise<ResolverResult<ReportState>> {
    const startTime = performance.now();
    
    try {
      // If no report ID, this is a new report
      if (!hints.hasReportId || !context.reportId) {
        const newReportId = generateReportId();
        
        return {
          success: true,
          data: {
            mode: 'new',
            reportId: newReportId,
            hasExistingData: false,
            status: 'draft',
          },
          source: 'generated',
          durationMs: performance.now() - startTime,
        };
      }

      // Try to fetch existing session
      const sessionResult = await this.fetchSession(context.reportId, identity);
      
      if (sessionResult.success && sessionResult.data) {
        const session = sessionResult.data;
        
        return {
          success: true,
          data: {
            mode: 'existing',
            reportId: session.session_key,
            hasExistingData: this.hasExistingData(session),
            version: context.version,
            status: this.mapStatus(session.status),
            createdAt: new Date(session.created_at),
            updatedAt: new Date(session.updated_at),
            completedAt: session.completed_at ? new Date(session.completed_at) : undefined,
            currentStep: session.current_step,
          },
          source: 'titan',
          durationMs: performance.now() - startTime,
        };
      }

      // Session not found - treat as new report with provided ID
      // This allows creating reports with pre-generated IDs
      this.logger.info('[SessionResolver] Session not found, creating new with ID', {
        reportId: truncateForLog(context.reportId),
      });

      return {
        success: true,
        data: {
          mode: 'new',
          reportId: context.reportId,
          hasExistingData: false,
          status: 'draft',
        },
        source: 'new_with_id',
        durationMs: performance.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('[SessionResolver] Resolution failed:', errorMessage);
      
      // Generate new report ID as fallback
      const fallbackReportId = context.reportId || generateReportId();
      
      return {
        success: false,
        data: {
          ...this.fallback(),
          reportId: fallbackReportId,
        },
        error: errorMessage,
        source: 'fallback',
        durationMs: performance.now() - startTime,
      };
    }
  }

  /**
   * Fallback state for graceful degradation
   */
  fallback(): ReportState {
    return {
      ...DEFAULT_REPORT,
      reportId: generateReportId(),
    };
  }

  /**
   * Fetch session from Titan API
   */
  private async fetchSession(
    sessionKey: string,
    identity?: IdentityState
  ): Promise<{ success: boolean; data?: SessionData; error?: string }> {
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };

      // Add guest session ID header if guest
      if (identity?.type === 'guest' && identity.guestSessionId) {
        headers['X-Guest-Session-Id'] = identity.guestSessionId;
      }

      // Add client context headers if accountant flow
      if (identity?.type === 'accountant_for_client' && identity.clientContext) {
        headers['X-Client-User-Id'] = identity.clientContext.clientUserId;
        headers['X-Accountant-User-Id'] = identity.clientContext.accountantUserId;
      }

      const response = await fetch(
        `${API_URL}/api/v2/valuations/sessions/${sessionKey}`,
        {
          method: 'GET',
          credentials: 'include',
          headers,
        }
      );

      if (response.status === 404) {
        return { success: false, error: 'Session not found' };
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.message || `Failed to fetch session (${response.status})`,
        };
      }

      const data = await response.json();
      const session = data.data || data;

      return { success: true, data: session };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Network error',
      };
    }
  }

  /**
   * Check if session has meaningful existing data
   */
  private hasExistingData(session: SessionData): boolean {
    const sessionData = session.session_data || {};
    
    // Check for key fields that indicate meaningful data
    const meaningfulFields = [
      'company_name',
      'business_type_id',
      'revenue',
      'ebitda',
      'industry',
      'valuation_result',
    ];

    for (const field of meaningfulFields) {
      const value = sessionData[field];
      if (value !== null && value !== undefined && value !== '') {
        return true;
      }
    }

    // Check for year data
    if (sessionData.year_data && typeof sessionData.year_data === 'object') {
      const years = Object.keys(sessionData.year_data);
      if (years.length > 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * Map backend status to our status enum
   */
  private mapStatus(status: string): ReportState['status'] {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'completed';
      case 'active':
        return 'active';
      case 'expired':
        return 'expired';
      default:
        return 'draft';
    }
  }
}

// Export singleton instance
export const sessionResolver = new SessionResolver();
