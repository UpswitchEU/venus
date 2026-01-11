/**
 * Utility API Service
 *
 * Single Responsibility: Handle utility operations like health checks and data migration
 * Extracted from BackendAPI to follow SRP
 *
 * @module services/api/utility/UtilityAPI
 */

import type {
  ConversationStatusResponse,
  GuestMigrationResponse,
} from '../../../types/api-responses'
import { APIError } from '../../../types/errors'
import type { Message } from '../../../types/message'
import { apiLogger } from '../../../utils/logger'
import { APIRequestConfig, HttpClient } from '../HttpClient'

export class UtilityAPI extends HttpClient {
  /**
   * Health check endpoint
   */
  async health(options?: APIRequestConfig): Promise<{ status: string }> {
    try {
      return await this.executeRequest<{ status: string }>(
        {
          method: 'GET',
          url: '/api/health',
          headers: {},
        } as any,
        options
      )
    } catch (error) {
      apiLogger.error('Health check failed', { error })
      const axiosError = error as any
      const statusCode = axiosError?.response?.status
      throw new APIError('Health check failed', statusCode, undefined, true, {
        originalError: error,
      })
    }
  }

  /**
   * Migrate guest data to authenticated account
   */
  async migrateGuestData(
    guestSessionId: string,
    userId: string,
    options?: APIRequestConfig
  ): Promise<GuestMigrationResponse> {
    try {
      return await this.executeRequest<GuestMigrationResponse>(
        {
          method: 'POST',
          url: '/api/v2/guest/migrate',
          data: { guest_session_id: guestSessionId, user_id: userId }, // Backend expects snake_case
          headers: {},
        } as any,
        options
      )
    } catch (error) {
      apiLogger.error('Guest data migration failed', { error, guestSessionId, userId })
      const axiosError = error as any
      const statusCode = axiosError?.response?.status
      throw new APIError('Failed to migrate guest data', statusCode, undefined, true, {
        originalError: error,
      })
    }
  }

  /**
   * Get conversation status (for resuming conversations)
   */
  async getConversationStatus(
    sessionId: string,
    options?: APIRequestConfig
  ): Promise<ConversationStatusResponse> {
    try {
      // Call the valuation engine directly for conversation status
      // CRITICAL FIX: Use correct endpoint path - intelligent-conversation, not conversation
      const response = await this.client.request({
        method: 'GET',
        url: `/api/v1/intelligent-conversation/status/${sessionId}`,
        signal: options?.signal,
        timeout: options?.timeout || 10000, // 10 second timeout for status checks
      })

      // CRITICAL FIX: Handle both response formats (status object or direct data)
      const data = response.data?.data || response.data

      // CRITICAL FIX: Check if status indicates exists: false (from graceful error handling)
      if (data?.exists === false) {
        apiLogger.debug('Conversation status check returned exists: false', { sessionId })
        return { exists: false, status: 'error' }
      }

      if (data && typeof data === 'object') {
        return {
          exists: true,
          status: (data.status as 'active' | 'completed' | 'error') || 'active',
          message_count: data.messages?.length,
          last_activity: data.metadata?.last_activity as string | undefined,
          session_id: sessionId,
        }
      }

      // Fallback for unexpected response format
      apiLogger.warn('Unexpected conversation status response format', {
        sessionId,
        responseKeys: Object.keys(data || {}),
      })

      return { exists: false, status: 'error' }
    } catch (error) {
      const axiosError = error as any
      // CRITICAL FIX: Handle abort signal cancellation gracefully
      if (axiosError?.name === 'AbortError') {
        apiLogger.debug('Conversation status check was cancelled', { sessionId })
        // Return a special marker to indicate abort (caller should check for this)
        throw error // Re-throw abort errors so caller can handle them
      }

      // If conversation doesn't exist or network error, return empty state
      if (axiosError?.response?.status === 404) {
        apiLogger.debug('Conversation does not exist (404)', { sessionId })
        return { exists: false, status: 'error' }
      }

      // CRITICAL FIX: Handle 500 errors gracefully (backend may return exists: false in response body)
      if (axiosError?.response?.status === 500) {
        apiLogger.warn('Conversation status check failed with 500 error', { sessionId })

        // Check if response body contains a status object with exists: false
        if (axiosError?.response?.data?.exists === false) {
          apiLogger.debug('Conversation status check returned exists: false in 500 response', {
            sessionId,
          })
          return { exists: false, status: 'error' }
        }
      }

      // Otherwise, log the error but still return empty state
      apiLogger.warn('Conversation status check failed, returning empty state', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
        status: axiosError?.response?.status,
      })

      // Don't throw error - just return empty state to allow new conversation
      return { exists: false, status: 'error' }
    }
  }

  async getConversationHistory(
    conversationId: string,
    signal?: AbortSignal
  ): Promise<{ messages: Message[]; exists: boolean }> {
    try {
      const response = await this.client.request({
        method: 'GET',
        url: `/api/conversation/history/${conversationId}`,
        signal,
        timeout: 30000, // 30 second timeout for history
      })

      const data = response.data?.data || response.data
      if (data && Array.isArray(data.messages)) {
        return {
          messages: data.messages as Message[],
          exists: true,
        }
      }

      return { messages: [], exists: false }
    } catch (error) {
      const axiosError = error as any
      if (axiosError?.name === 'AbortError') {
        apiLogger.debug('Conversation history request was cancelled', { conversationId })
        throw error
      }

      if (axiosError?.response?.status === 404) {
        apiLogger.debug('Conversation history does not exist', { conversationId })
        return { messages: [], exists: false }
      }

      apiLogger.error('Failed to get conversation history', {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      })

      return { messages: [], exists: false }
    }
  }
}
