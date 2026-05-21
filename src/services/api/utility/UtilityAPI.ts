/**
 * Utility API Service
 *
 * Single Responsibility: Handle utility operations like health checks and data migration
 * Extracted from BackendAPI to follow SRP
 *
 * @module services/api/utility/UtilityAPI
 */

import type { ConversationStatusResponse } from '../../../types/api-responses'
import { APIError } from '../../../types/errors'
import type { Message } from '../../../types/message'
import { apiLogger } from '../../../utils/logger'
import { APIRequestConfig, HttpClient } from '../HttpClient'

// AUTH-FIRST: GuestMigrationResponse type deprecated

type AxiosLikeError = {
  name?: string
  response?: {
    data?: unknown
    status?: number
  }
}

function asAxiosLikeError(error: unknown): AxiosLikeError {
  return error && typeof error === 'object' ? (error as AxiosLikeError) : {}
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function unwrapResponseData(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value)
  const nested = asRecord(record?.data)
  return nested ?? record
}

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
        },
        options
      )
    } catch (error) {
      apiLogger.error('Health check failed', { error })
      const axiosError = asAxiosLikeError(error)
      const statusCode = axiosError?.response?.status
      throw new APIError('Health check failed', statusCode, undefined, true, {
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
      const response = await this.client.request<unknown>({
        method: 'GET',
        url: `/api/v1/intelligent-conversation/status/${sessionId}`,
        signal: options?.signal,
        timeout: options?.timeout || 10000, // 10 second timeout for status checks
      })

      // CRITICAL FIX: Handle both response formats (status object or direct data)
      const data = unwrapResponseData(response.data)

      // CRITICAL FIX: Check if status indicates exists: false (from graceful error handling)
      if (data?.exists === false) {
        apiLogger.debug('Conversation status check returned exists: false', { sessionId })
        return { exists: false, status: 'error' }
      }

      if (data) {
        const messages = Array.isArray(data.messages) ? data.messages : undefined
        const metadata = asRecord(data.metadata)
        const status =
          data.status === 'active' || data.status === 'completed' || data.status === 'error'
            ? data.status
            : 'active'
        return {
          exists: true,
          status,
          message_count: messages?.length,
          last_activity:
            typeof metadata?.last_activity === 'string' ? metadata.last_activity : undefined,
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
      const axiosError = asAxiosLikeError(error)
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
        if (asRecord(axiosError?.response?.data)?.exists === false) {
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
      const response = await this.client.request<unknown>({
        method: 'GET',
        url: `/api/conversation/history/${conversationId}`,
        signal,
        timeout: 30000, // 30 second timeout for history
      })

      const data = unwrapResponseData(response.data)
      if (data && Array.isArray(data.messages)) {
        return {
          messages: data.messages as Message[],
          exists: true,
        }
      }

      return { messages: [], exists: false }
    } catch (error) {
      const axiosError = asAxiosLikeError(error)
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
