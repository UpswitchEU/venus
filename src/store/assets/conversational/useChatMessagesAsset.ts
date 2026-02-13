/**
 * Chat Messages Asset Store (Conversational Flow)
 *
 * Manages state for chat messages in conversational flow.
 * - Send mode: When creating new messages (frontend → backend)
 * - Receive mode: When restoring conversation (backend → frontend)
 *
 * @module store/assets/conversational/useChatMessagesAsset
 */

import type { Message } from '../../../types/message'
import { createAssetStore } from '../createAssetStore'

export interface ChatMessagesData {
  messages: Message[]
  pythonSessionId: string | null
  reportId: string
}

export const useChatMessagesAsset = createAssetStore<ChatMessagesData>(
  'Conversational:ChatMessages',
  { messages: [], pythonSessionId: null, reportId: '' }
)

// Convenience selectors
export const useChatMessages = () => useChatMessagesAsset((state) => state.data?.messages || [])
export const useChatSessionId = () => useChatMessagesAsset((state) => state.data?.pythonSessionId)
export const useChatMessagesStatus = () => useChatMessagesAsset((state) => state.status)
export const useChatMessagesError = () => useChatMessagesAsset((state) => state.error)
export const useChatMessagesProgress = () => useChatMessagesAsset((state) => state.progress)
