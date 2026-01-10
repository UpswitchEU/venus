/**
 * Conversation API
 *
 * Handles conversation history persistence and retrieval
 */

import type { InternalAxiosRequestConfig } from 'axios'
import type { Message } from '../../../types/message'
import { apiLogger } from '../../../utils/logger'
import { HttpClient } from '../HttpClient'

export interface SaveMessageRequest {
  reportId: string
  messageId: string
  role: string
  type: string
  content: string
  metadata: Record<string, any>
}

export interface ConversationHistoryResponse {
  exists: boolean
  messages: Message[]
  session_id: string
  source?: 'python' | 'database'
}

export class ConversationAPI extends HttpClient {
  /**
   * Save a conversation message to the database
   * Non-blocking - errors are logged but don't fail the conversation flow
   * Failproof: Comprehensive validation and error handling
   */
  async saveMessage(data: SaveMessageRequest): Promise<void> {
    // Failproof: Validate required fields
    if (!data || typeof data !== 'object') {
      apiLogger.warn('Cannot save message: invalid data object', {
        dataType: typeof data,
      })
      return
    }

    if (!data.reportId || !data.messageId || !data.content) {
      apiLogger.warn('Cannot save message: missing required fields', {
        hasReportId: !!data.reportId,
        hasMessageId: !!data.messageId,
        hasContent: !!data.content,
      })
      return
    }

    // Failproof: Validate content is string
    if (typeof data.content !== 'string' || data.content.length === 0) {
      apiLogger.warn('Cannot save message: invalid content', {
        messageId: data.messageId,
        contentType: typeof data.content,
        contentLength: data.content?.length || 0,
      })
      return
    }

    try {
      await this.executeRequest<void>({
        method: 'POST',
        url: '/api/v2/intelligent-conversation/messages',
        data: {
          reportId: data.reportId,
          messageId: data.messageId,
          role: data.role || 'user',
          type: data.type || 'user',
          content: data.content,
          metadata: data.metadata || {},
        },
      } as InternalAxiosRequestConfig)
    } catch (error) {
      // Log but don't throw - message persistence shouldn't block conversation
      apiLogger.warn('Failed to persist message to database', {
        messageId: data.messageId,
        reportId: data.reportId,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      })
      // Don't throw - non-blocking persistence
    }
  }

  /**
   * Get conversation history for a report
   * Checks Python backend first, falls back to database
   * Failproof: Returns empty history on error instead of throwing
   */
  async getHistory(reportId: string): Promise<ConversationHistoryResponse> {
    // Failproof: Validate reportId
    if (!reportId || typeof reportId !== 'string') {
      apiLogger.warn('Cannot get conversation history: invalid reportId', {
        reportId,
        reportIdType: typeof reportId,
      })
      return {
        exists: false,
        messages: [],
        session_id: reportId || '',
        source: 'database',
      }
    }

    try {
      return await this.executeRequest<ConversationHistoryResponse>({
        method: 'GET',
        url: `/api/conversation/history/${reportId}`,
      } as InternalAxiosRequestConfig)
    } catch (error) {
      // Failproof: Return empty history instead of throwing
      apiLogger.error('Failed to get conversation history', {
        reportId,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      })
      return {
        exists: false,
        messages: [],
        session_id: reportId,
        source: 'database',
      }
    }
  }
}

// Export singleton instance
export const conversationAPI = new ConversationAPI()
